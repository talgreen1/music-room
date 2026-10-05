-- Screenshot segments are re-encoded JPEGs. Run after the existing Firebase
-- third-party Auth integration is enabled. No additional paid services needed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('room-sheets', 'room-sheets', true, 3145728, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 3145728,
  allowed_mime_types = array['image/jpeg'];

-- Room members use Firebase anonymous identities. Each identity can create
-- immutable files only in its own namespace. Firebase room rules separately
-- enforce that only the room Master may publish a sheet to the group.
drop policy if exists "Music Room screenshot uploads" on storage.objects;
create policy "Music Room screenshot uploads"
on storage.objects for insert to anon, authenticated
with check (
  bucket_id = 'room-sheets'
  and auth.jwt()->>'iss' = 'https://securetoken.google.com/talgreen-music-room'
  and auth.jwt()->>'aud' = 'talgreen-music-room'
  and (storage.foldername(name))[1] = auth.jwt()->>'sub'
  and name ~ '^[a-zA-Z0-9_-]+/[a-f0-9]{32}/([0-9]|[1-3][0-9])\.jpg$'
);

-- Public download links are shared in rooms. Uploads do not replace/delete
-- existing files. Settings removes deleted songs once no active room uses them.
-- Saved songs stay until explicitly deleted; failed import orphan tiles can be
-- removed manually after confirming that no catalog entry or room references them.

-- Only the Settings administrator can remove tiles, after library tombstoning.
-- SELECT is needed by Storage's delete API; public downloads remain unchanged.
drop policy if exists "Music Room screenshot cleanup read" on storage.objects;
create policy "Music Room screenshot cleanup read"
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'room-sheets'
  and auth.jwt()->>'iss' = 'https://securetoken.google.com/talgreen-music-room'
  and auth.jwt()->>'aud' = 'talgreen-music-room'
  and auth.jwt()->>'sub' = 'nnN8tcCjAoO9sLOepJvHzDiUkWh2'
);
drop policy if exists "Music Room screenshot cleanup delete" on storage.objects;
create policy "Music Room screenshot cleanup delete"
on storage.objects for delete to anon, authenticated
using (
  bucket_id = 'room-sheets'
  and auth.jwt()->>'iss' = 'https://securetoken.google.com/talgreen-music-room'
  and auth.jwt()->>'aud' = 'talgreen-music-room'
  and auth.jwt()->>'sub' = 'nnN8tcCjAoO9sLOepJvHzDiUkWh2'
);
