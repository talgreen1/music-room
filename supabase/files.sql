-- Shared PDF library. Run alongside sheets.sql before deploying the unified library.
-- Reuses Firebase third-party Auth and the existing Supabase Free project.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('room-pdfs', 'room-pdfs', true, 31457280, array['application/pdf'])
on conflict (id) do update set public = true, file_size_limit = 31457280,
  allowed_mime_types = array['application/pdf'];

-- Room members use Firebase anonymous identities. Each identity can create
-- immutable files only in its own namespace. Firebase room rules separately
-- enforce that only the room Master may publish a file to the group.
drop policy if exists "Music Room PDF uploads" on storage.objects;
create policy "Music Room PDF uploads"
on storage.objects for insert to anon, authenticated
with check (
  bucket_id = 'room-pdfs'
  and auth.jwt()->>'iss' = 'https://securetoken.google.com/talgreen-music-room'
  and auth.jwt()->>'aud' = 'talgreen-music-room'
  and (storage.foldername(name))[1] = auth.jwt()->>'sub'
  and name ~ '^[a-zA-Z0-9_-]+/[a-f0-9]{32}/document\.pdf$'
);

-- Public download links are shared in rooms. Uploads do not replace/delete
-- existing files. Settings removes deleted songs once no active room uses them.
-- Saved songs stay until explicitly deleted; failed import orphan PDFs can be
-- removed manually after confirming that no catalog entry or room references them.

-- Only the Settings administrator can remove PDFs, after library tombstoning.
-- SELECT is needed by Storage's delete API; public downloads remain unchanged.
drop policy if exists "Music Room PDF cleanup read" on storage.objects;
create policy "Music Room PDF cleanup read"
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'room-pdfs'
  and auth.jwt()->>'iss' = 'https://securetoken.google.com/talgreen-music-room'
  and auth.jwt()->>'aud' = 'talgreen-music-room'
  and auth.jwt()->>'sub' = 'nnN8tcCjAoO9sLOepJvHzDiUkWh2'
);
drop policy if exists "Music Room PDF cleanup delete" on storage.objects;
create policy "Music Room PDF cleanup delete"
on storage.objects for delete to anon, authenticated
using (
  bucket_id = 'room-pdfs'
  and auth.jwt()->>'iss' = 'https://securetoken.google.com/talgreen-music-room'
  and auth.jwt()->>'aud' = 'talgreen-music-room'
  and auth.jwt()->>'sub' = 'nnN8tcCjAoO9sLOepJvHzDiUkWh2'
);
