# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`requirements.md` (Japanese) is the source of truth for scope; read it before making product decisions.

@AGENTS.md

## Commands

- `npm run dev`: dev server at http://localhost:3000 (Next picks another port if it is taken; check the startup log)
- `npm run build` / `npm start`: production build / serve
- `npm run lint`: ESLint (flat config, `eslint.config.mjs`)
- `npm test`: Vitest (jsdom), runs `src/**/*.test.ts` once. `npm run test:watch` for watch mode.
- Single test file: `npx vitest run src/lib/filter.test.ts`; single test by name: `npx vitest run -t "複数タグ"`.

Stack: Next.js 16 (App Router, `src/`, alias `@/*` → `src/*`), React 19, Tailwind CSS v4, TypeScript, Vitest.

Tests cover the pure logic only (`src/lib/filter.ts`, `src/lib/recipe-store.ts`); there are no component tests. `recipe-store` keeps a module-level cache, so tests re-import it with `vi.resetModules()` per test.

## Project

A personal recipe book app ("レシピ帳") for people who forget recipes they find (e.g. in videos). Users save recipes with ingredients and steps, and organize/search them by category **and** by purpose tags such as 時短 (quick), ダイエット (diet), 栄養重視 (nutrition), 簡単 (easy), 節約 (budget). The purpose tag is the differentiating feature, so it must be a first-class filter and search dimension, not just a label.

## Fixed constraints

- **Local-first, sync is optional:** the app must keep working with browser `localStorage` alone. Cloud sync (Supabase, login required) is an opt-in layer enabled only when `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set; without them nothing is sent externally. Never put a secret / service_role key in the client. Only the signed-in user's own rows may be readable (RLS in `supabase/schema.sql`).
- **Do not enable `output: 'export'`:** recipe IDs are only known at runtime, so `/recipes/[id]` is a dynamic route rendered on demand, not statically generated.
- **Devices:** desktop-first, but layouts should remain usable on mobile via Tailwind responsive utilities.
- **Language:** UI and product docs are Japanese (`<html lang="ja">`, system Japanese font stack, no Google fonts).

## Architecture

- **`src/lib/recipe-store.ts` is the only code that touches `localStorage`** (keys `recipes:v1`, `categories:v1`). It exposes `subscribe/getSnapshot/getServerSnapshot` for `useSyncExternalStore` plus `addRecipe/updateRecipe/deleteRecipe`. Writes throw `StorageError` (quota/privacy mode), which `RecipeForm` shows to the user. Bump the key version if the stored shape changes.
- **`src/hooks/use-recipes.ts`** wraps the store and adds `ready`. It is `false` during SSR/hydration, when the store returns empty data, so UI must show a loading state rather than "no recipes yet" until `ready`.
- **All pages are Client Components** because `localStorage` is browser-only. `src/app/page.tsx` is a thin shell wrapping `RecipeBrowser` in `<Suspense>` (required for `useSearchParams` at build time).
- **Home filter state lives in the URL**: `?q=&category=&tag=a&tag=b`. Multiple tags are combined with AND. `src/lib/filter.ts` is a pure function (NFKC-normalized, so full/half-width kana match; each search term must match the name or a tag).
- **Categories** start from `DEFAULT_CATEGORIES` in `src/lib/constants.ts`; users add more via "＋ 新しいカテゴリーを追加" in the form, and the store persists them when a recipe using them is saved. The home filter only lists categories/tags that are in use.
- **A recipe holds at most `MAX_TAGS` (3) tags**, enforced in `RecipeForm`. Tags are free text with suggestions.
- **Edit happens inside the detail page** (`/recipes/[id]` toggles to `RecipeForm`), not on a separate route, to keep the screen flow at two levels: Top → create / detail. Do not add deeper navigation.
- Ingredients (`ingredients`) and seasonings (`seasonings`) are both stored as `{ name, quantity }` rather than free text, so a future shopping-list feature can sum quantities across recipes. The form shares one `IngredientRows` component for 材料, 調味料 and the user-added groups.
- **`seasonings` was added after recipes were already being saved**, so stored recipes may lack it. `recipe-store.ts` fills in `[]` when loading (`normalize`), so the rest of the app can treat `Recipe.seasonings` as always present. The storage key stays `recipes:v1` because the change is additive; only bump it for a breaking change. The detail page hides the 調味料 section when it is empty.
- **User-added ingredient groups** (`Recipe.extraGroups: { name, items }[]`, e.g. トッピング) are separate from the fixed 材料 (required) and 調味料 (optional) fields, and are **not related to the recipe `category`** (主菜・副菜 etc.); keep the two concepts and their UI wording apart. Like `seasonings`, `extraGroups` may be missing in older stored recipes and is normalized to `[]` on load (malformed entries are dropped). Form validation for groups lives in `src/lib/ingredient-groups.ts` (`cleanExtraGroups`: blank groups are dropped, half-filled ones and duplicate/reserved names are errors).
- **Enter adds a row** in ingredient inputs (`nextRowAfter`, no blank rows added). IME safety: use `isPlainEnter` (`src/lib/keyboard.ts`), which ignores `isComposing` **and** `keyCode === 229` (Safari fires the confirming Enter after `compositionend`). Enter in these inputs always `preventDefault`s so it never submits the form.

## Sync (optional, Supabase)

- Files: `src/lib/supabase.ts` (client, null when not configured), `src/lib/sync-logic.ts` (pure: pending-op queue, `mergeRemote`, `migrationOps`, row mapping), `src/lib/sync.ts` (state machine + network), `SyncBootstrap` (starts it once from the layout), `SyncPanel` (login / status UI on the home page), `supabase/schema.sql`, `docs/同期の設定手順.md`.
- The UI still reads/writes only `recipe-store.ts`. The store reports changes through `setChangeHandler` (add/update/delete/import) and accepts the server's content through `replaceFromRemote` (which does not report a change).
- Changes are queued in the outbox (`localStorage` key `sync:outbox:v1`, one entry per recipe id, last op wins) and flushed after ~1s, on login, on tab focus (throttled), and on `online`. Failed sends stay in the outbox and are retried; local data is never dropped.
- Each sync: flush outbox → pull all rows → (first login on this device only, tracked in `sync:migrated:v1`) upload local recipes the server lacks → `mergeRemote` (server is the source of truth, but pending local upserts/deletes win) → `replaceFromRemote`.
- Login is email + password (`signInWithPassword`); there is intentionally no sign-up UI (the single user is created in the Supabase dashboard and public sign-ups are disabled).
- Custom categories are not a separate table: they are derived from the `category` of synced recipes.
- Tests: `sync-logic.test.ts` (pure) and `sync.test.ts` (flow against a fake Supabase client). The real Supabase service has not been exercised by automated tests.

## Backup (export / import)

- Format: JSON `{ app: "recipe-book", version: 1, exportedAt, recipes, customCategories }` (`src/lib/backup.ts`). Bump `BACKUP_VERSION` only for a breaking change; files with a newer version are rejected.
- `parseBackup` is strict and **all-or-nothing**: one bad recipe rejects the whole file (error names the recipe number and field), and only known fields are copied out. Older files without `seasonings`/`extraGroups` are accepted and normalized to `[]`.
- Import modes (`importBackup` in `recipe-store.ts`): `add` keeps existing recipes and skips ids that already exist (re-importing the same file adds nothing; existing recipes are never overwritten); `replace` swaps everything and requires an inline confirmation in `BackupPanel`. A file with 0 recipes is refused so it cannot wipe the data.
- `commit()` in the store restores the previous `localStorage` values if the second write fails, so recipes and categories never end up out of sync.
- `BackupPanel` sits on the home page outside `RecipeBrowser` so it is shown even with 0 recipes (restoring into an empty app).

## Out of scope

Photo upload (text-only), automatic recipe extraction from videos, meal planning / aggregated shopping lists (v2.0+).

## Photo (optional, needs sync) and cooking time

- `Recipe.photoPath?: string` points to one JPEG in the private Supabase Storage bucket `recipe-photos` (`supabase/photos.sql`: private, JPEG only, 3MB, RLS so only `<own uid>/…` objects are accessible). Path format `<uid>/<random uuid>.jpg` (`src/lib/photo-path.ts`: `makePhotoPath`, `isPhotoPath`). **Invalid paths are treated as "no photo"** in `normalize` (store), `fromRow` (sync) and `parseBackup`.
- `src/lib/photo.ts`: `resizeImage` (canvas → JPEG, long side ≤1280, white background), `uploadPhoto`, `removePhoto` (best effort), `getPhotoUrl` (1-hour signed URLs, reused for 50 min, failures are not cached). `usePhotoUrl` + `RecipePhoto` show the image or a gray placeholder; a failed `<img>` falls back to the placeholder.
- Photos need a signed-in session: without it the form shows a login note instead of the file input. The recipe itself still works fully offline/local-first. Photo bytes are never in localStorage or the backup JSON (only the path is).
- `RecipeForm` keeps the picked photo as a Blob until save, then uploads, then calls `onSubmit` (which may now return a Promise). If saving fails after upload, the new photo is removed; after a successful save, a replaced/removed old photo is removed. `onSubmit` always receives the `photoPath` and `cookingMinutes` keys (possibly `undefined`) so `updateRecipe`'s spread can clear them. Deleting a recipe also removes its photo (best effort, in the detail page).
- `Recipe.cookingMinutes?: number` (integer 1–1440, `src/lib/cooking-time.ts`: `parseCookingMinutes` accepts full-width digits, `formatMinutes`). Same normalize/fromRow/parseBackup handling as `photoPath`.
- Ingredient inputs: Enter in a **name** field focuses the same row's **quantity** field; Enter in a **quantity** field uses `nextRowAfter` (next row's name, adding a row if needed). Both ignore IME-composition Enter.
- Ideas not built yet: nutrition estimates from a photo and vegetable-intake vs. reference values. If added, treat results as rough estimates, make the user able to correct them, and keep it out of the offline core.

## Recipe reader (photos / pasted text → form draft)

- Flow: `RecipeReader` (collapsible panel at the top of `RecipeForm`, signed-in only) → `recipe-reader-client.ts` (`imageToReadDataUrl` = `resizeImage` with `READ_IMAGE_OPTIONS` 1600px/q0.85; sends `Authorization: Bearer <supabase access token>`) → `POST /api/extract-recipe` (`src/app/api/extract-recipe/route.ts`, nodejs runtime) → `recipe-reader.ts` `readRecipe` (Anthropic SDK, forced tool `record_recipe`) → `recipe-extract.ts` `parseExtraction` (sanitizes/limits; returns null if nothing read) → `extractionToFormValues` → `RecipeForm.applyExtraction`.
- The result is only a **draft**: it fills the form, never saves. Photo, and the category when it is not in the user's list, are left unchanged. `uncertain[]` notes are shown to the user. Extra groups are cleared when applying; if the form already has content, the user must confirm replacement.
- Server: needs `ANTHROPIC_API_KEY` (server only, never `NEXT_PUBLIC_`), optional `ANTHROPIC_MODEL` (default `claude-haiku-4-5`). Verifies the Supabase token with `auth.getUser(token)`; in-memory rate limit 20 calls / 10 min / user; limits ≤3 JPEG images (≤2.5M base64 chars each), text ≤8000 chars (≥10 if no image), body ≤6MB. Pasted text is wrapped in `<recipe_text>` and the prompt tells the model to ignore instructions inside data. AI error details are logged server-side only. The route uses relative imports (vitest has no `@/` alias).
- Tests: `recipe-extract.test.ts`, `recipe-reader.test.ts` (mock client), `route.test.ts` (`// @vitest-environment node`, mocks Supabase + Anthropic).

## Servings and nutrition estimate

- `Recipe.servings?: number` (integer 1–100, `src/lib/servings.ts`: `parseServings` accepts full-width digits and a trailing 「人分」). Same normalize/fromRow/parseBackup handling as `cookingMinutes`; the reader's `record_recipe` tool also returns `servings` (null unless written).
- `Recipe.nutrition?: NutritionEstimate` (`src/lib/nutrition.ts`): per-ingredient `items` (each with `grams`, `isVegetable`, nine nutrient values — energy, protein, fat, carbs, calcium, iron, vitamin A/C/D), `assumptions`, `basis` (djb2 hash of ingredients/seasonings/extraGroups → `isNutritionCurrent` shows a "stale" notice after edits), `usedPhoto`, `estimatedAt`. **Totals, per-serving and vegetable grams are computed in code** from the items (`totalNutrition`, `perServing`, `vegetableGrams`); the AI is never asked to add. `parseStoredNutrition` validates stored data (note: stored items nest values under `values`, the AI's reply is flat).
- Flow: `NutritionPanel` (detail page, signed-in only) → `nutrition-client.ts` `requestNutrition` (optionally downloads the saved photo from Storage and resizes it) → `POST /api/estimate-nutrition` (`src/app/api/estimate-nutrition/route.ts`, forced tool `record_nutrition` in `recipe-nutrition.ts`) → `setNutrition(id, est)` in the store (saves only the nutrition; `undefined` removes it). Editing the recipe form keeps the old nutrition (it becomes "stale").
- Shared server guard in `src/lib/api-guard.ts` (`authenticate`, `createRateLimiter`, `fail`); both API routes use it, each with its own 20 calls / 10 min / user limit. Results are labeled as AI estimates in the UI; never present them as medical numbers.
- Ideas not built yet: editing estimated values by hand, vegetable-intake vs. reference values (verify the official source first), salt/fiber.

## Meal plan calendar and shopping list

- Data: `PlanEntry {id, date 'YYYY-MM-DD', recipeId, servings|null}` (`src/lib/plan.ts`: date helpers incl. Monday-start `monthGrid`, `parsePlanEntry`). Stored in localStorage `plan:v1` by `plan-store.ts` (same local-first pattern as recipes; `setPlanChangeHandler` for sync). Deleting a recipe does NOT delete its plan entries: they show as 削除されたレシピ and are skipped in the shopping list (`missing`).
- Sync: `plan-sync.ts` (`syncPlan`, called at the end of `syncNow` in `sync.ts`; outbox `plan:outbox:v1`; Supabase table `meal_plan` from `supabase/meal-plan.sql`) with pure logic in `plan-logic.ts` (`mergePlanRemote` mirrors `mergeRemote`). A failure/missing table never changes the recipe sync status: `syncPlan` returns a message stored in `SyncState.planMessage` and shown on the calendar page. Plan is not part of the backup JSON.
- `src/lib/shopping.ts` (pure, no AI): `parseQuantity` (numbers, fractions, 1と1/2, 大さじ/小さじ first, kg→g, L→ml, aliases; ranges/words like 少々 → `text`, units must be letters only), `nameKey` (NFKC, katakana→hiragana, strips whitespace/parentheses; kanji vs kana stay different on purpose), `classify` (longest keyword match wins, e.g. 油揚げ ≠ 油), `buildShoppingList(entries, recipes, from, to)` (scales by planned/recipe servings only when both exist; text quantities are never scaled), `shoppingToText`.
- UI: `/plan` (`MealCalendar`: month grid, day panel with recipe search, servings box only for recipes with servings, range pickers) and `/plan/shopping?from&to` (`ShoppingView`: grouped checklist, 内訳, copy via clipboard with execCommand fallback, `window.print()` with `print:hidden` on chrome; checks stored per range in localStorage `shopping:checked:v1`, device-only). Header has a 献立 link.
- Tests: `plan.test.ts`, `shopping.test.ts`, `plan-logic.test.ts`, `plan-store.test.ts`; e2e script lived outside the repo (route-mocked Supabase incl. `meal_plan`).

## Design system (pop theme) and navigation

- Colors live only in `src/app/globals.css` (`@theme inline`): the Tailwind **orange scale is overridden with the coral palette** (so existing `orange-*` classes are the brand color; 600–900 are darkened for text contrast, 500 `#ff5e57` is decorative), plus `cream`, `line`, `sun`, `butter`, `mint`, `mint-d`, `mintbg`, `ink`, and `stone-500` darkened. Utilities: `shadow-pop`, `shadow-pop-sm`, `btn-pop` (pressable 3D button). Keep white-on-color text ≥ 4.4:1 (use `orange-600`+, not `orange-500`, for filled buttons with text).
- Shapes: cards `rounded-2xl/3xl bg-white shadow-pop` (no borders), inputs/buttons `rounded-xl border-2 border-line`, pills `rounded-full`. Headings `font-black`; section titles use a colored vertical bar.
- Navigation (`src/components/AppNav.tsx`): `TopNav` (≥ sm) and `BottomNav` (< sm, fixed, safe-area padding, center "＋" → /recipes/new), both `nav` landmarks named メインメニュー with `aria-current="page"`; only one is visible per width. `.app-main` adds bottom padding so the bar never covers content; the bar is `print:hidden`. 設定 = `/settings` (SyncPanel + BackupPanel moved there from the home page; login prompts elsewhere say 「設定」の「ほかの端末と同期する」).
- `RecipePhoto` placeholder is a gradient chosen from a seed (recipe id); `TagChip` color is chosen from the label (pink/butter/mint), selected = solid coral. Detail page uses `InfoCard`s (調理時間 / 材料 N人分 / 野菜) and `pfcShare` (nutrition.ts) for the PFC bar.
- PWA-ish: `src/app/manifest.ts` (standalone, theme `#ff5e57`), icons `public/icon-192.png`, `public/icon-512.png`, `src/app/icon.png`, `src/app/apple-icon.png`; `layout.tsx` sets `viewport` (themeColor, viewportFit cover) and `appleWebApp`. No service worker (not offline-installable, just "Add to Home Screen").

## Nutrition data shapes (bug lesson)

- The AI's `record_nutrition` reply has nutrients **flat** on each item; the server (`/api/estimate-nutrition`), localStorage, sync and backups use `values: {...}` **nested**. `parseNutritionItems` accepts both. Any change to either shape must keep `recipe-nutrition.test.ts` ("server output re-parsed by client") passing, and e2e mocks of the API must use the real nested shape — a flat mock hid a production bug where every estimate ended in 「栄養素を推定できませんでした」.

## Voice input (話して入れる)

- `src/lib/speech.ts` (pure helpers: ctor lookup `SpeechRecognition`/`webkitSpeechRecognition`, `joinTranscript`, `speechErrorMessage`), `src/hooks/use-speech-input.ts` (ja-JP, continuous, interim; auto-restart up to 30 times unless the user stopped or a permission error occurred; `supported` via `useSyncExternalStore` so SSR renders "unsupported" first), UI in `RecipeReader.tsx` (appends final transcripts to the paste-text box; the existing 読み取る flow then structures it). `INSTRUCTIONS` in `recipe-reader.ts` has the spoken-language rule (fix 「さんこ」→「3個」, never invent missing items). Real Chromium exposes both constructors, so e2e fakes must override both (`e2e/speech.py`).
- Audio is processed by the browser vendor's speech service, not by this app; the UI says so.

## Reading (よみがな), あいうえお grouping, ingredient search

- `Recipe.reading?` is a hiragana-only furigana string for the recipe name (optional, additive; stored inside the recipe JSON, so **no Supabase schema change**). `src/lib/reading.ts` owns the rules: `toHiragana` (NFKC + katakana→hiragana), `cleanReading` (hiragana only, ≤60 chars, else `""`; applied in `recipe-store` normalize, `sync-logic` fromRow, `backup` parse), `readingOf` (given reading → else the name itself if it is kana-only → else `""`), `gyouOf` (あ行…わ行, dakuten/small kana map to their row, leading `ー` skipped, anything else `その他`), `groupByGyou` (あ行〜わ行, then その他 for names with kanji and no reading; empty rows omitted). Sorting uses `Intl.Collator("ja")` on the hiragana reading, **never on the raw name** (Collator does not sort kanji by reading).
- Home (`RecipeBrowser`) renders sections `#gyou-<行>` with a sticky jump bar (あ か さ た な は ま や ら わ 他; rows with no recipes are disabled), plus a banner when recipes need a reading.
- AI furigana: `POST /api/readings` (`src/app/api/readings/route.ts`, same guards as the other AI routes: Supabase login, rate limit 20/10min, **only `{id, name}` is sent** — never ingredients/steps/photos; max 40 names per call). `src/lib/recipe-reading.ts` (forced tool `record_readings`, `parseReadings` drops unknown ids / non-hiragana), `src/lib/reading-client.ts` (`requestReadings`, `fillMissingReadings` in chunks of 40 → `setReadings`, `autoReading` with a 6 s timeout used on save when the field is empty; failures never block saving). Not logged in → the field can still be typed by hand.
- `recipe-store.setReadings(map)` updates only readings in one commit and notifies sync per changed id.
- Search (`src/lib/filter.ts`): each space-separated term (AND) must match the name, reading, a tag, or an ingredient/seasoning/extra-group-item name; kana-folded. `ingredientHits` returns the ingredient names that matched a term not already explained by name/reading/tag (shown as a 「材料」 line on the card).
- Not verified: real AI furigana quality (test with the API key), iPhone Safari smooth scroll / sticky bar.

## Fridge search (冷蔵庫の材料から探す)

- Pure logic in `src/lib/fridge.ts`: `splitHave`/`cleanHave` (split on space/、/,; kana-folded dedupe), `covers(have, ingredientName)` (either string contains the other; but a 1-char recipe ingredient like 卵 only matches when the recipe-side name contains the have-term, not when the have-term merely contains it, so 「ゆで卵」 does not cover 卵), `findByFridge` (default: seasonings are assumed to be at home; `includeSeasonings` counts them; excludes recipes that use none of the have-items or miss more than `maxMissing`=2; sorted by fewest missing → most used → あいうえお), `nearestByFridge` (fallback: closest few regardless of missing count), `popularIngredients` (tap-to-add suggestions).
- UI: `FridgeFinder.tsx`, toggled from `RecipeBrowser` with URL `?fridge=1&have=…&have=…` (category/tag chips still narrow the pool; the text search box is hidden in this mode). `RecipeCard` takes `fridge={{used, missing}}` and shows 「ぜんぶそろっています」 or 「あと◯◯だけあれば作れます」.
- Lint note: `RecipeBrowser` deliberately uses no manual `useMemo` for `filtered`/`groups`/`missing` (React Compiler's `preserve-manual-memoization` rule errors once `update()` is called from more places).
- Not verified: matching quality with real recipe names (e.g. 「鶏もも肉」 vs 「鶏肉」 match because 「鶏肉」 is not a substring of 「鶏もも肉」 — they do NOT; users may need to type the same wording; a synonym list is a possible next step).
