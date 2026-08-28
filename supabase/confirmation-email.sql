-- Paola Propiedades: control idempotente del email de confirmación.
-- Ejecutar manualmente en Supabase SQL Editor antes de desplegar la función.
-- No elimina ni modifica los datos existentes; las columnas nuevas empiezan NULL.

begin;

alter table public.reservations
  add column if not exists confirmation_email_claimed_at timestamptz;

alter table public.reservations
  add column if not exists confirmation_email_sent_at timestamptz;

comment on column public.reservations.confirmation_email_claimed_at is
  'Bloqueo temporal para evitar envíos concurrentes del email de confirmación.';

comment on column public.reservations.confirmation_email_sent_at is
  'Fecha en que Resend aceptó el email de confirmación de la reserva.';

create index if not exists reservations_confirmation_email_pending_idx
  on public.reservations (confirmation_email_claimed_at)
  where reservation_status = 'confirmed'
    and confirmation_email_sent_at is null;

commit;
