"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRecipes } from "@/hooks/use-recipes";
import { useSync } from "@/hooks/use-sync";
import { MAX_TAGS, SUGGESTED_TAGS } from "@/lib/constants";
import { BENTO_CHOICES, BENTO_TAGS, bentoOf, choiceOf, type BentoChoice } from "@/lib/scene";
import { MAX_COOKING_MINUTES, parseCookingMinutes } from "@/lib/cooking-time";
import { cleanExtraGroups, cleanRows, nextRowAfter } from "@/lib/ingredient-groups";
import { isPlainEnter } from "@/lib/keyboard";
import { cleanReading, isKanaOnly } from "@/lib/reading";
import { autoReading, requestReadings } from "@/lib/reading-client";
import { MAX_SERVINGS, parseServings } from "@/lib/servings";
import { PhotoError, removePhoto, resizeImage, uploadPhoto } from "@/lib/photo";
import { extractionToFormValues, type ExtractedRecipe } from "@/lib/recipe-extract";
import type { Ingredient, IngredientGroup, Recipe, RecipeInput } from "@/lib/types";
import { RecipePhoto } from "./RecipePhoto";
import { RecipeReader } from "./RecipeReader";
import { TagChip } from "./TagChip";

const NEW_CATEGORY = "__new__";

type Props = {
  initial?: Recipe;
  submitLabel: string;
  /** 保存に失敗した場合は例外を投げる(メッセージをフォームに表示する) */
  onSubmit: (input: RecipeInput) => void | Promise<void>;
  onCancel: () => void;
};

const inputBase =
  "rounded-xl border-2 border-line bg-white font-bold shadow-pop-sm px-3 py-2 outline-none focus:border-orange-500";
const inputClass = `w-full ${inputBase}`;

// スマホで押しやすいよう、行の削除(✕)と追加リンクのタップ領域を広げる(パソコン幅は従来どおり)
const removeBtnClass =
  "flex w-10 shrink-0 items-center justify-center px-2 text-stone-500 hover:text-red-600 disabled:opacity-30 sm:block sm:w-auto";
const addLinkClass = "mt-2 py-2 text-sm text-orange-700 underline sm:py-0";

type IngredientRowsProps = {
  /** 見出しの代わりに使う名前(「材料」「調味料」、追加グループの名前)。省略できない */
  label: string;
  /** 追加リンクの対象の呼び名。省略時は label(追加グループは名前が長くなり得るので「行」にする) */
  addLabel?: string;
  /** 各入力の aria-label の接頭辞。省略時は label。追加グループはグループ名が固定枠と重なっても区別できるよう別に指定する */
  ariaPrefix?: string;
  hint?: string;
  /** 見出しの表示を差し替える(追加グループでは名前の入力欄にする)。省略すると label を表示 */
  title?: ReactNode;
  rows: Ingredient[];
  onChange: (rows: Ingredient[]) => void;
  namePlaceholder: string;
  quantityPlaceholder: string;
};

/** 名前と分量の行を追加・削除できる入力欄。材料・調味料・追加グループで共用する */
function IngredientRows({
  label,
  addLabel = label,
  ariaPrefix = label,
  hint,
  title,
  rows,
  onChange,
  namePlaceholder,
  quantityPlaceholder,
}: IngredientRowsProps) {
  const nameInputs = useRef<(HTMLInputElement | null)[]>([]);
  const quantityInputs = useRef<(HTMLInputElement | null)[]>([]);
  // Enter で行を足した直後は、描画が終わってから新しい行の名前欄へカーソルを移す
  const pendingFocus = useRef<number | null>(null);
  useEffect(() => {
    if (pendingFocus.current === null) return;
    nameInputs.current[pendingFocus.current]?.focus();
    pendingFocus.current = null;
  }, [rows]);

  const update = (i: number, patch: Partial<Ingredient>) =>
    onChange(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  function handleKeyDown(e: React.KeyboardEvent, i: number, field: "name" | "quantity") {
    if (e.key !== "Enter") return;
    // Enter でフォーム全体が送信されないようにする(変換確定の Enter も同様)
    e.preventDefault();
    // 日本語入力の変換を確定する Enter は、行の追加として扱わない
    if (!isPlainEnter(e)) return;

    // 名前欄の Enter は、同じ行の分量欄へ移る
    if (field === "name") {
      quantityInputs.current[i]?.focus();
      return;
    }

    // 分量欄の Enter は、次の行の名前欄へ移る(次の行がなければ追加する)
    const next = nextRowAfter(rows, i);
    if (!next) return; // 空欄の行では増やさない
    if (next.rows === rows) {
      nameInputs.current[next.focusIndex]?.focus();
    } else {
      pendingFocus.current = next.focusIndex;
      onChange(next.rows);
    }
  }

  return (
    <div>
      {title ?? (
        <p className="mb-1 text-sm font-medium">
          {label}
          {hint && <span className="ml-2 text-xs font-normal text-stone-500">{hint}</span>}
        </p>
      )}
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2">
            <input
              ref={(el) => {
                nameInputs.current[i] = el;
              }}
              value={row.name}
              onChange={(e) => update(i, { name: e.target.value })}
              onKeyDown={(e) => handleKeyDown(e, i, "name")}
              placeholder={namePlaceholder}
              aria-label={`${ariaPrefix}${i + 1}の名前`}
              className={`min-w-0 flex-1 ${inputBase}`}
            />
            <input
              ref={(el) => {
                quantityInputs.current[i] = el;
              }}
              value={row.quantity}
              onChange={(e) => update(i, { quantity: e.target.value })}
              onKeyDown={(e) => handleKeyDown(e, i, "quantity")}
              placeholder={quantityPlaceholder}
              aria-label={`${ariaPrefix}${i + 1}の分量`}
              className={`w-32 shrink-0 ${inputBase} sm:w-40`}
            />
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              disabled={rows.length === 1}
              aria-label={`${ariaPrefix}${i + 1}を削除`}
              className={removeBtnClass}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...rows, { name: "", quantity: "" }])}
        className={addLinkClass}
      >
        ＋ {addLabel}を追加
      </button>
    </div>
  );
}

export function RecipeForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const { recipes, categories } = useRecipes();

  const [name, setName] = useState(initial?.name ?? "");
  const [reading, setReading] = useState(initial?.reading ?? "");
  const [readingBusy, setReadingBusy] = useState(false);
  const [readingMsg, setReadingMsg] = useState("");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [newCategory, setNewCategory] = useState("");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [bentoChoice, setBentoChoice] = useState<BentoChoice>(choiceOf(initial?.bento));
  const [tagInput, setTagInput] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    initial?.ingredients.length ? initial.ingredients : [{ name: "", quantity: "" }],
  );
  // 調味料が未入力の既存レシピは、空の1行から始める
  const [seasonings, setSeasonings] = useState<Ingredient[]>(
    initial?.seasonings?.length ? initial.seasonings : [{ name: "", quantity: "" }],
  );
  // ユーザーが名前を付けて追加する材料グループ(レシピのカテゴリーとは別のもの)
  const [extraGroups, setExtraGroups] = useState<IngredientGroup[]>(
    initial?.extraGroups ?? [],
  );
  const [steps, setSteps] = useState<string[]>(
    initial?.steps.length ? initial.steps : [""],
  );
  // 調理時間(分)。入力中は文字のまま持つ(空欄 = 未入力)
  const [cookingMinutes, setCookingMinutes] = useState(
    initial?.cookingMinutes !== undefined ? String(initial.cookingMinutes) : "",
  );
  // 何人分の材料か。入力中は文字のまま持つ(空欄 = 未入力)
  const [servings, setServings] = useState(
    initial?.servings !== undefined ? String(initial.servings) : "",
  );
  const [error, setError] = useState("");

  // 写真(1枚)。保存するまでは、選んだ写真を端末の中に持っておき、保存のときにクラウドへ送る
  const sync = useSync();
  const signedIn =
    sync.status === "idle" || sync.status === "syncing" || sync.status === "error";
  const [photoPath, setPhotoPath] = useState<string | undefined>(initial?.photoPath);
  const [newPhoto, setNewPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  // 選んだ写真のプレビュー用URLは、使い終わったら解放する
  useEffect(() => {
    return () => {
      if (newPhoto) URL.revokeObjectURL(newPhoto.url);
    };
  }, [newPhoto]);

  async function handlePickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 同じ写真をもう一度選んでも反応するようにする
    if (!file) return;
    setError("");
    setPhotoBusy(true);
    try {
      const blob = await resizeImage(file);
      setNewPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      setError(err instanceof PhotoError ? err.message : "写真を読み込めませんでした。");
    } finally {
      setPhotoBusy(false);
    }
  }

  function clearPhoto() {
    setNewPhoto(null);
    setPhotoPath(undefined);
  }

  // 登録済みレシピで使われているタグも候補に出す
  const tagSuggestions = useMemo(() => {
    const used = recipes.flatMap((r) => r.tags);
    return [...new Set([...SUGGESTED_TAGS, ...(bentoChoice === "daily" ? [] : BENTO_TAGS), ...used])];
  }, [recipes, bentoChoice]);

  const addingCategory = category === NEW_CATEGORY;
  const tagsFull = tags.length >= MAX_TAGS;

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag || tags.includes(tag) || tagsFull) return;
    setTags([...tags, tag]);
    setTagInput("");
  }

  function toggleTag(tag: string) {
    if (tags.includes(tag)) setTags(tags.filter((t) => t !== tag));
    else addTag(tag);
  }

  // 読み取り結果(確認前の下書き)を入力欄に入れる。写真・カテゴリー(候補外)は、いまのままにする
  function applyExtraction(ex: ExtractedRecipe) {
    const v = extractionToFormValues(ex, categories);
    setName(v.name);
    if (v.category !== null) {
      setCategory(v.category);
      setNewCategory("");
    }
    setTags(v.tags);
    setCookingMinutes(v.cookingMinutes);
    setServings(v.servings);
    setIngredients(v.ingredients);
    setSeasonings(v.seasonings);
    setExtraGroups([]);
    setSteps(v.steps);
    setError("");
  }

  // 何か入力済みなら、読み取りで置き換わる前に確認する
  const hasContent =
    name.trim() !== "" ||
    cleanRows(ingredients).length > 0 ||
    cleanRows(seasonings).length > 0 ||
    steps.some((s) => s.trim() !== "") ||
    extraGroups.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || photoBusy) return;

    const finalCategory = (addingCategory ? newCategory : category).trim();
    const cleanIngredients = cleanRows(ingredients);
    const cleanSeasonings = cleanRows(seasonings);
    const cleanSteps = steps.map((s) => s.trim()).filter(Boolean);

    if (!name.trim()) return setError("料理名を入力してください。");
    if (!finalCategory) return setError("カテゴリーを選択または追加してください。");
    const minutes = parseCookingMinutes(cookingMinutes);
    if (minutes === null) {
      return setError(`調理時間は、1〜${MAX_COOKING_MINUTES}の整数(分)で入力してください。`);
    }
    const servingsNum = parseServings(servings);
    if (servingsNum === null) {
      return setError(`人数は、1〜${MAX_SERVINGS}の整数(人分)で入力してください。`);
    }
    if (cleanIngredients.length === 0) return setError("材料を1つ以上入力してください。");
    const groups = cleanExtraGroups(extraGroups);
    if (!groups.ok) return setError(groups.error);
    if (cleanSteps.length === 0) return setError("手順を1つ以上入力してください。");

    let finalReading = "";
    if (reading.trim()) {
      finalReading = cleanReading(reading);
      if (!finalReading) return setError("よみがなは、ひらがな(カタカナ)で入力してください。漢字や記号は入れられません。");
    }

    setSaving(true);
    setError("");
    // よみがなが空で、名前に漢字などがあるときは、AIに付けてもらう(ログイン中だけ。失敗しても、保存は続ける)
    if (!finalReading && signedIn && !isKanaOnly(name.trim())) {
      finalReading = await autoReading(name.trim());
    }
    // 今回アップロードした写真。保存に失敗したら、取り残さないよう消す
    let uploaded: string | undefined;
    try {
      let finalPhoto = photoPath;
      if (newPhoto) {
        uploaded = await uploadPhoto(newPhoto.blob);
        finalPhoto = uploaded;
      }
      // 写真を外した場合も確実に消えるよう、photoPath は(未設定でも)必ず渡す
      await onSubmit({
        name: name.trim(),
        // 空のときも、キーは渡す(消したよみがなが残らないように)
        reading: finalReading || undefined,
        category: finalCategory,
        tags,
        ingredients: cleanIngredients,
        seasonings: cleanSeasonings,
        extraGroups: groups.groups,
        steps: cleanSteps,
        photoPath: finalPhoto,
        // 空欄のときも、キーは渡す(消した調理時間が残らないように)
        cookingMinutes: minutes,
        servings: servingsNum,
        // ふだんのおかずのときも、キーは渡す(お弁当をやめたときに、印が残らないように)
        bento: bentoOf(bentoChoice),
      });
      // 保存できてから、差し替え・削除された古い写真を消す
      const old = initial?.photoPath;
      if (old && old !== finalPhoto) void removePhoto(old);
    } catch (err) {
      if (uploaded) void removePhoto(uploaded);
      setError(err instanceof Error ? err.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <RecipeReader categories={categories} hasContent={hasContent} onApply={applyExtraction} />

      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">
          料理名
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
        <label htmlFor="reading" className="mb-1 mt-3 block text-sm font-medium">
          よみがな
          <span className="ml-2 text-xs font-normal text-stone-500">あいうえお順に並べるため・ひらがな</span>
        </label>
        <div className="flex gap-2">
          <input
            id="reading"
            value={reading}
            onChange={(e) => {
              setReading(e.target.value);
              setReadingMsg("");
            }}
            placeholder={signedIn ? "空のまま保存すると、AIが入れます" : "例: おやこどん"}
            className={inputClass}
          />
          <button
            type="button"
            disabled={readingBusy || !name.trim()}
            onClick={async () => {
              setReadingBusy(true);
              setReadingMsg("");
              try {
                const got = await requestReadings([{ id: "x", name: name.trim() }]);
                if (got.x) setReading(got.x);
                else setReadingMsg("よみがなを付けられませんでした。自分で入れてください。");
              } catch (err) {
                setReadingMsg(err instanceof Error ? err.message : "よみがなを入れられませんでした。");
              } finally {
                setReadingBusy(false);
              }
            }}
            className="btn-pop shrink-0 rounded-xl border-2 border-orange-200 bg-white px-3 text-sm font-bold text-orange-700 hover:bg-orange-50 disabled:opacity-50"
          >
            {readingBusy ? "入れています…" : "AIで入れる"}
          </button>
        </div>
        {readingMsg && <p className="mt-1 text-sm text-red-700">{readingMsg}</p>}
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">
          写真
          <span className="ml-2 text-xs font-normal text-stone-500">任意・1枚</span>
        </p>
        {signedIn ? (
          <div className="rounded-2xl border-2 border-dashed border-orange-200 bg-white p-3">
            {newPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={newPhoto.url}
                alt="選んだ写真"
                className="h-44 w-full rounded-xl object-cover"
              />
            ) : photoPath ? (
              <RecipePhoto path={photoPath} alt="いまの写真" className="h-44 w-full rounded-xl" />
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label
                className={`inline-block cursor-pointer rounded-xl border-2 border-line bg-white font-bold shadow-pop-sm px-4 py-2.5 text-sm hover:bg-orange-50 sm:py-2 ${
                  photoBusy || saving ? "pointer-events-none opacity-40" : ""
                }`}
              >
                {photoBusy ? "写真を準備しています…" : newPhoto || photoPath ? "写真を選び直す" : "写真を選ぶ・撮る"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePickPhoto}
                  disabled={photoBusy || saving}
                  className="sr-only"
                />
              </label>
              {(newPhoto || photoPath) && (
                <button
                  type="button"
                  onClick={clearPhoto}
                  disabled={saving}
                  className="py-2 text-sm text-red-700 underline disabled:opacity-40 sm:py-0"
                >
                  写真を外す
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-stone-500">
              スマホでは、その場で撮るか、写真から選べます。大きい写真は、自動で小さくして保存します。
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
            写真は、ログインしているときに使えます。「設定」の「ほかの端末と同期する」で、ログインしてください。
          </div>
        )}
      </div>

      <div>
        <label htmlFor="cooking-minutes" className="mb-1 block text-sm font-medium">
          調理時間
          <span className="ml-2 text-xs font-normal text-stone-500">任意</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            id="cooking-minutes"
            type="text"
            inputMode="numeric"
            value={cookingMinutes}
            onChange={(e) => setCookingMinutes(e.target.value)}
            onKeyDown={(e) => {
              // Enter でフォームが送信されないようにする
              if (e.key === "Enter") e.preventDefault();
            }}
            placeholder="例: 15"
            className={`w-28 ${inputBase}`}
          />
          <span className="text-sm text-stone-600">分</span>
        </div>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium" id="bento-label">
          使う場面
        </p>
        <div role="radiogroup" aria-labelledby="bento-label" className="grid gap-2 sm:grid-cols-3" data-testid="bento-choice">
          {BENTO_CHOICES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={bentoChoice === c.id}
              onClick={() => setBentoChoice(c.id)}
              className={`min-h-[44px] rounded-2xl border-2 px-3 py-2 text-left ${
                bentoChoice === c.id ? "border-teal-700 bg-teal-700 text-white" : "border-line bg-white text-ink hover:bg-teal-50"
              }`}
            >
              <span className="block text-sm font-black">{c.label}</span>
              <span className={`block text-xs ${bentoChoice === c.id ? "text-teal-50" : "text-stone-600"}`}>{c.note}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="category" className="mb-1 block text-sm font-medium">
          カテゴリー
        </label>
        <select
          id="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={inputClass}
        >
          <option value="" disabled>
            選択してください
          </option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value={NEW_CATEGORY}>＋ 新しいカテゴリーを追加</option>
        </select>
        {addingCategory && (
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="新しいカテゴリー名"
            aria-label="新しいカテゴリー名"
            className={`${inputClass} mt-2`}
          />
        )}
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">
          用途タグ
          <span className="ml-2 text-xs font-normal text-stone-500">
            最大{MAX_TAGS}個({tags.length}/{MAX_TAGS})
          </span>
        </p>
        {tags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <TagChip
                key={t}
                label={t}
                selected
                onRemove={() => setTags(tags.filter((x) => x !== t))}
              />
            ))}
          </div>
        )}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {tagSuggestions
            .filter((t) => !tags.includes(t))
            .map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                disabled={tagsFull}
                className="rounded-full border-2 border-line bg-white px-2.5 py-2 text-sm text-stone-700 hover:border-orange-400 disabled:opacity-40 sm:py-0.5"
              >
                ＋ {t}
              </button>
            ))}
        </div>
        <div className="flex gap-2">
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              // 日本語入力の変換確定の Enter では追加しない
              if (isPlainEnter(e)) addTag(tagInput);
            }}
            disabled={tagsFull}
            placeholder={tagsFull ? "タグは最大3個までです" : "自由入力してEnterで追加"}
            aria-label="タグを自由入力"
            className={`${inputClass} disabled:bg-stone-100`}
          />
          <button
            type="button"
            onClick={() => addTag(tagInput)}
            disabled={tagsFull || !tagInput.trim()}
            className="shrink-0 rounded-xl border-2 border-line bg-white font-bold shadow-pop-sm px-3 text-sm hover:bg-orange-50 disabled:opacity-40"
          >
            追加
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="servings" className="mb-1 block text-sm font-medium">
          何人分の材料ですか
          <span className="ml-2 text-xs font-normal text-stone-500">任意</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            id="servings"
            type="text"
            inputMode="numeric"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            onKeyDown={(e) => {
              // Enter でフォームが送信されないようにする
              if (e.key === "Enter") e.preventDefault();
            }}
            placeholder="例: 2"
            className={`w-28 ${inputBase}`}
          />
          <span className="text-sm text-stone-600">人分</span>
        </div>
      </div>

      <IngredientRows
        label="材料"
        rows={ingredients}
        onChange={setIngredients}
        namePlaceholder="例: 玉ねぎ"
        quantityPlaceholder="例: 1個"
      />

      <IngredientRows
        label="調味料"
        hint="任意"
        rows={seasonings}
        onChange={setSeasonings}
        namePlaceholder="例: しょうゆ"
        quantityPlaceholder="例: 大さじ1"
      />

      {extraGroups.map((group, gi) => (
        <IngredientRows
          key={gi}
          label={group.name.trim() || `グループ${gi + 1}`}
          addLabel="行"
          ariaPrefix={`グループ${gi + 1}の行`}
          title={
            <div className="mb-1 flex items-center gap-2">
              <input
                value={group.name}
                onChange={(e) =>
                  setExtraGroups(
                    extraGroups.map((g, j) => (j === gi ? { ...g, name: e.target.value } : g)),
                  )
                }
                placeholder="グループ名(例: トッピング)"
                aria-label={`追加グループ${gi + 1}の名前`}
                className={`min-w-0 flex-1 font-medium ${inputBase}`}
              />
              <button
                type="button"
                onClick={() => setExtraGroups(extraGroups.filter((_, j) => j !== gi))}
                className="shrink-0 rounded-xl px-2 py-2.5 text-sm text-stone-500 hover:text-red-600 sm:py-2"
              >
                グループを削除
              </button>
            </div>
          }
          rows={group.items}
          onChange={(items) =>
            setExtraGroups(extraGroups.map((g, j) => (j === gi ? { ...g, items } : g)))
          }
          namePlaceholder="例: 明太子"
          quantityPlaceholder="例: 大さじ2"
        />
      ))}

      <div>
        <button
          type="button"
          onClick={() =>
            setExtraGroups([...extraGroups, { name: "", items: [{ name: "", quantity: "" }] }])
          }
          className="w-full rounded-xl border-2 border-dashed border-orange-200 bg-white py-2.5 text-sm text-orange-700 hover:border-orange-400 sm:w-auto sm:px-4 sm:py-2"
        >
          ＋ グループを追加
        </button>
        <p className="mt-1.5 text-xs text-stone-500">
          「トッピング」など、材料・調味料とは別の入力欄を増やせます(料理のカテゴリーとは別のものです)。
        </p>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">手順</p>
        <div className="space-y-2">
          {steps.map((s, i) => (
            <div key={i} className="flex gap-2">
              <span className="w-6 shrink-0 pt-2 text-right text-sm text-stone-500">
                {i + 1}.
              </span>
              <textarea
                value={s}
                onChange={(e) => setSteps(steps.map((x, j) => (j === i ? e.target.value : x)))}
                rows={2}
                aria-label={`手順${i + 1}`}
                className={`${inputClass} field-sizing-content`}
              />
              <button
                type="button"
                onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                disabled={steps.length === 1}
                aria-label={`手順${i + 1}を削除`}
                className={`${removeBtnClass} h-10 self-start sm:h-auto sm:self-stretch`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setSteps([...steps, ""])}
          className={addLinkClass}
        >
          ＋ 手順を追加
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving || photoBusy}
          className="flex-1 btn-pop rounded-xl bg-orange-600 px-5 py-2.5 font-bold text-white hover:bg-orange-700 disabled:opacity-50 sm:flex-none sm:py-2"
        >
          {saving ? "保存しています…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border-2 border-line bg-white font-bold shadow-pop-sm px-5 py-2.5 hover:bg-orange-50 sm:flex-none sm:py-2"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}
