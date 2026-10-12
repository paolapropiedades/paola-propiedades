-- Programación diaria del recordatorio de pagos a las 09:00, hora de Lima.
-- Requiere estos secretos en Supabase Vault:
--   payment_reminder_function_url
--   payment_reminder_cron_secret

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'payment-reminders-daily'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end
$$;

select cron.schedule(
  'payment-reminders-daily',
  '0 14 * * *',
  $$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'payment_reminder_function_url'
        limit 1
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'payment_reminder_cron_secret'
          limit 1
        )
      ),
      body := '{"scheduled":true}'::jsonb,
      timeout_milliseconds := 10000
    );
  $$
);
