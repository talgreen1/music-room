-- Run in the Music Room Supabase SQL editor. For another installation, replace
-- the UID below with its allowlisted Firebase Settings account UID.
-- Enable the Firebase third-party Auth integration for talgreen-music-room first.
-- No service-role key or database password belongs in the frontend.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('songbooks', 'songbooks', true, 31457280, array['application/pdf'])
on conflict (id) do update set public = true, file_size_limit = 31457280,
  allowed_mime_types = array['application/pdf'];

-- Firebase tokens without a role claim use the anon role. Both roles are checked
-- against the issuer, audience and exact administrator UID below.
create policy "Music Room administrator uploads"
on storage.objects for insert to anon, authenticated
with check (
  bucket_id = 'songbooks'
  and auth.jwt()->>'iss' = 'https://securetoken.google.com/talgreen-music-room'
  and auth.jwt()->>'aud' = 'talgreen-music-room'
  and auth.jwt()->>'sub' = 'nnN8tcCjAoO9sLOepJvHzDiUkWh2'
  and lower(storage.extension(name)) = 'pdf'
);

-- Public buckets allow PDF downloads. No object overwrite/delete permission is
-- granted to clients, so existing rooms retain their versioned PDF.
