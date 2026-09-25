"use client";

import { useMemo, useState } from "react";
import { useRecipes } from "@/hooks/use-recipes";
import { MAX_TAGS, SUGGESTED_TAGS } from "@/lib/constants";
import type { Ingredient, Recipe, RecipeInput } from "@/lib/types";
import { TagChip } from "./TagChip";

const NEW_CATEGORY = "__new__";

type Props = {
  initial?: Recipe;
  submitLabel: string;
  /** 保存に失敗した場合は例外を投げる(メッセージをフォームに表示する) */
  onSubmit: (input: RecipeInput) => void;
  onCancel: () => void;
};

const inputBase =
  "rounded-md border border-stone-300 bg-white px-3 py-2 outline-none focus:border-orange-500";
const inputClass = `w-full ${inputBase}`;

// スマホで押しやすいよう、行の削除(✕)と追加リンクのタップ領域を広げる(パソコン幅は従来どおり)
const removeBtnClass =
  "flex w-10 shrink-0 items-center justify-center px-2 text-stone-500 hover:text-red-600 disabled:opacity-30 sm:block sm:w-auto";
const addLinkClass = "mt-2 py-2 text-sm text-orange-700 underline sm:py-0";

type IngredientRowsProps = {
  /** 見出し・各入力の aria-label・追加リンクに使う(「材料」「調味料」) */
  label: string;
  hint?: string;
  rows: Ingredient[];
  onChange: (rows: Ingredient[]) => void;
  namePlaceholder: string;
  quantityPlaceholder: string;
};

/** 名前と分量の行を追加・削除できる入力欄。材料と調味料で共用する */
function IngredientRows({
  label,
  hint,
  rows,
  onChange,
  namePlaceholder,
  quantityPlaceholder,
}: IngredientRowsProps) {
  const update = (i: number, patch: Partial<Ingredient>) =>
    onChange(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div>
      <p className="mb-1 text-sm font-medium">
        {label}
        {hint && <span className="ml-2 text-xs font-normal text-stone-500">{hint}</span>}
      </p>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={row.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder={namePlaceholder}
              aria-label={`${label}${i + 1}の名前`}
              className={`min-w-0 flex-1 ${inputBase}`}
            />
            <input
              value={row.quantity}
              onChange={(e) => update(i, { quantity: e.target.value })}
              placeholder={quantityPlaceholder}
              aria-label={`${label}${i + 1}の分量`}
              className={`w-32 shrink-0 ${inputBase} sm:w-40`}
            />
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              disabled={rows.length === 1}
              aria-label={`${label}${i + 1}を削除`}
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
        ＋ {label}を追加
      </button>
    </div>
  );
}

export function RecipeForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const { recipes, categories } = useRecipes();

  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [newCategory, setNewCategory] = useState("");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    initial?.ingredients.length ? initial.ingredients : [{ name: "", quantity: "" }],
  );
  // 調味料が未入力の既存レシピは、空の1行から始める
  const [seasonings, setSeasonings] = useState<Ingredient[]>(
    initial?.seasonings?.length ? initial.seasonings : [{ name: "", quantity: "" }],
  );
  const [steps, setSteps] = useState<string[]>(
    initial?.steps.length ? initial.steps : [""],
  );
  const [error, setError] = useState("");

  // 登録済みレシピで使われているタグも候補に出す
  const tagSuggestions = useMemo(() => {
    const used = recipes.flatMap((r) => r.tags);
    return [...new Set([...SUGGESTED_TAGS, ...used])];
  }, [recipes]);

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const finalCategory = (addingCategory ? newCategory : category).trim();
    const cleanRows = (rows: Ingredient[]) =>
      rows
        .map((i) => ({ name: i.name.trim(), quantity: i.quantity.trim() }))
        .filter((i) => i.name);
    const cleanIngredients = cleanRows(ingredients);
    const cleanSeasonings = cleanRows(seasonings);
    const cleanSteps = steps.map((s) => s.trim()).filter(Boolean);

    if (!name.trim()) return setError("料理名を入力してください。");
    if (!finalCategory) return setError("カテゴリーを選択または追加してください。");
    if (cleanIngredients.length === 0) return setError("材料を1つ以上入力してください。");
    if (cleanSteps.length === 0) return setError("手順を1つ以上入力してください。");

    try {
      onSubmit({
        name: name.trim(),
        category: finalCategory,
        tags,
        ingredients: cleanIngredients,
        seasonings: cleanSeasonings,
        steps: cleanSteps,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました。");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
                className="rounded-full border border-stone-300 bg-white px-2.5 py-2 text-sm text-stone-700 hover:border-orange-400 disabled:opacity-40 sm:py-0.5"
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
              // 日本語入力の変換確定の Enter では追加しない
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              e.preventDefault();
              addTag(tagInput);
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
            className="shrink-0 rounded-md border border-stone-300 bg-white px-3 text-sm hover:bg-stone-50 disabled:opacity-40"
          >
            追加
          </button>
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
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          className="flex-1 rounded-md bg-orange-600 px-5 py-2.5 font-medium text-white hover:bg-orange-700 sm:flex-none sm:py-2"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md border border-stone-300 bg-white px-5 py-2.5 hover:bg-stone-50 sm:flex-none sm:py-2"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}
