-- レシピ帳の同期用テーブル。Supabase の「SQL Editor」に貼り付けて、1回だけ実行する。
-- 何度実行しても壊れないように書いてある(すでにあるものは作り直さない)。

create table if not exists public.recipes (
  -- アプリが作るレシピID(crypto.randomUUID())。バックアップ由来の文字列も受け付けるので text にしている
  id            text primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- 一覧を新しい順に並べるための、作成日時(ミリ秒)
  created_at_ms bigint not null default 0,
  -- レシピの中身(料理名・カテゴリー・タグ・材料・調味料・追加グループ・手順・作成日時)
  data          jsonb not null,
  updated_at    timestamptz not null default now()
);

create index if not exists recipes_user_id_idx on public.recipes (user_id);

-- 行レベルセキュリティ: 自分のレシピだけを、読む・追加する・変える・消すことができる
alter table public.recipes enable row level security;

drop policy if exists "recipes_select_own" on public.recipes;
create policy "recipes_select_own" on public.recipes
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "recipes_insert_own" on public.recipes;
create policy "recipes_insert_own" on public.recipes
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "recipes_update_own" on public.recipes;
create policy "recipes_update_own" on public.recipes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "recipes_delete_own" on public.recipes;
create policy "recipes_delete_own" on public.recipes
  for delete to authenticated
  using (user_id = (select auth.uid()));
