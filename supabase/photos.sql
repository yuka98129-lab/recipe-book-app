-- レシピの写真用。Supabase の「SQL Editor」に貼り付けて、1回だけ実行する(schema.sql のあとで)。
-- 何度実行しても壊れないように書いてある(すでにあるものは、同じ設定に直すだけ)。

-- 写真を入れる入れ物(バケット)。非公開(public = false)で、JPEG だけ、1枚 3MB まで。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', false, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 自分のフォルダ(先頭が自分のユーザーIDのフォルダ)の写真だけ、読む・追加する・変える・消すことができる。
drop policy if exists "recipe_photos_select_own" on storage.objects;
create policy "recipe_photos_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "recipe_photos_insert_own" on storage.objects;
create policy "recipe_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "recipe_photos_update_own" on storage.objects;
create policy "recipe_photos_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid()::text))
  with check (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "recipe_photos_delete_own" on storage.objects;
create policy "recipe_photos_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
