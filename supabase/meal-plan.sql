-- レシピ帳の「献立カレンダー」を、PC・スマホ間で同期するための表。
-- Supabase の「SQL Editor」に貼り付けて、1回だけ実行する(何度実行しても壊れない)。
-- ※ これを実行しなくても、献立は、使っている端末の中には保存される(他の端末と同期されないだけ)。

create table if not exists public.meal_plan (
  -- アプリが作る献立のID(crypto.randomUUID())
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- 作る日(YYYY-MM-DD)
  plan_date   text not null,
  -- 中身: { "recipeId": レシピのID, "servings": 何人分で作るか(なければ null) }
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

create index if not exists meal_plan_user_date_idx on public.meal_plan (user_id, plan_date);

-- 行レベルセキュリティ: 自分の献立だけを、読む・追加する・変える・消すことができる
alter table public.meal_plan enable row level security;

drop policy if exists "meal_plan_select_own" on public.meal_plan;
create policy "meal_plan_select_own" on public.meal_plan
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "meal_plan_insert_own" on public.meal_plan;
create policy "meal_plan_insert_own" on public.meal_plan
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "meal_plan_update_own" on public.meal_plan;
create policy "meal_plan_update_own" on public.meal_plan
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "meal_plan_delete_own" on public.meal_plan;
create policy "meal_plan_delete_own" on public.meal_plan
  for delete to authenticated
  using (user_id = (select auth.uid()));
