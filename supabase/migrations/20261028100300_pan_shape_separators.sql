-- PD-5 fix round 3: looks_like_pan also catches a PAN typed with separators or spaces
-- (ABCDE-1234-F, ABCDE 1234 F). The final letter must not run into a longer word, so a name such as
-- "Platinum 2024 Card" is still allowed. The unseparated form stays unconditional, as before.
-- Mirrors PAN_SHAPE in supabase/functions/explain/payload.ts. Existing rows are not re-checked
-- (CREATE OR REPLACE does not revalidate CHECK constraints); the seeded personas do not match.
create or replace function public.looks_like_pan(t text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    t ~* '[a-z]{5}[0-9]{4}[a-z]'
    or t ~* '[a-z]{5}[ .-]*[0-9]{4}[ .-]*[a-z](?![a-z])',
    false
  );
$$;
