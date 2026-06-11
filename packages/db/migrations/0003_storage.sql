-- ═══════════════════════════════════════════════════════════════
-- Lumix Social Manager — 0003: Supabase Storage
--
-- Bucket privado para vídeos dos posts.
-- Convenção de path: {org_id}/{client_id}/{post_id}/{arquivo}
-- (o 1º segmento DEVE ser o org_id — as policies dependem disso)
-- ═══════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-media',
  'post-media',
  false,
  524288000, -- 500 MB por arquivo
  array['video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do nothing;

-- membros da org leem a mídia da própria org
create policy post_media_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

-- upload apenas dentro do prefixo da própria org
create policy post_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

-- remoção: owner/admin da org
create policy post_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.current_user_role() in ('owner', 'admin')
  );
