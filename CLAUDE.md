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

- **No backend:** no server, external DB, or external services. Persistence is browser `localStorage` only, and no data may be sent externally.
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
- Ingredients (`ingredients`) and seasonings (`seasonings`) are both stored as `{ name, quantity }` rather than free text, so a future shopping-list feature can sum quantities across recipes. The form shares one `IngredientRows` component for both.
- **`seasonings` was added after recipes were already being saved**, so stored recipes may lack it. `recipe-store.ts` fills in `[]` when loading (`normalize`), so the rest of the app can treat `Recipe.seasonings` as always present. The storage key stays `recipes:v1` because the change is additive; only bump it for a breaking change. The detail page hides the 調味料 section when it is empty.

## Out of scope

Photo upload (text-only), automatic recipe extraction from videos, meal planning / aggregated shopping lists (v2.0+).
