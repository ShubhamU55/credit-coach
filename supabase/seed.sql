-- Local seed for `supabase db reset`.
--
-- The three sample personas (Aarav, Ishita, Rohan) and the default coach rules are defined once, in
-- supabase/migrations/20261028100200_demo_data.sql, so a hosted `supabase db push` gets them too.
-- This file only re-applies them (idempotent), which keeps the local stack identical to production.
select public.reset_demo_data();
