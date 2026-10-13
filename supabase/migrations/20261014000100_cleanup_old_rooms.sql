-- Deletes rooms nobody has touched for 3 days, every night at 04:17 UTC.
-- Seats, the public state and hands go with them through `on delete cascade`.
create extension if not exists pg_cron;

select cron.schedule(
  'tenfold-delete-old-rooms',
  '17 4 * * *',
  $$delete from public.rooms where updated_at < now() - interval '3 days'$$
);
