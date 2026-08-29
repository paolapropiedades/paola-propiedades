-- Paola Propiedades: aceptación de Términos y Condiciones.
-- Ejecutar manualmente en Supabase SQL Editor.
-- No modifica retroactivamente reservas existentes.

begin;

alter table public.reservations
  add column if not exists terms_accepted_at timestamptz;

alter table public.reservations
  add column if not exists terms_version text;

-- Elimina la firma anterior para que no pueda utilizarse para confirmar una
-- reserva sin aceptar los Términos y Condiciones.
drop function if exists public.confirm_reservation_by_token(
  text,
  text,
  text,
  text,
  text,
  text
);

drop function if exists public.confirm_reservation_by_token(
  text,
  text,
  text,
  text,
  text,
  text,
  boolean
);

create function public.confirm_reservation_by_token(
  p_confirmation_token text,
  p_tenant_full_name text,
  p_tenant_address text,
  p_tenant_dni text,
  p_tenant_phone text,
  p_tenant_email text,
  p_terms_accepted boolean
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_confirmation_token is null
    or pg_catalog.char_length(p_confirmation_token) not between 32 and 128
  then
    return false;
  end if;

  if p_terms_accepted is distinct from true then
    raise exception using
      errcode = '22023',
      message = 'Debes aceptar los Términos y Condiciones de Arrendamiento.';
  end if;

  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_tenant_full_name, ''))) not between 1 and 200
    or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_tenant_address, ''))) not between 1 and 500
    or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_tenant_dni, ''))) not between 1 and 50
    or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_tenant_phone, ''))) not between 1 and 50
    or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_tenant_email, ''))) not between 3 and 320
    or pg_catalog.btrim(p_tenant_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception using
      errcode = '22023',
      message = 'Los datos de confirmación no son válidos.';
  end if;

  update public.reservations as reservation
  set
    tenant_full_name = pg_catalog.btrim(p_tenant_full_name),
    tenant_address = pg_catalog.btrim(p_tenant_address),
    tenant_dni = pg_catalog.btrim(p_tenant_dni),
    tenant_phone = pg_catalog.btrim(p_tenant_phone),
    tenant_email = pg_catalog.btrim(p_tenant_email),
    reservation_status = 'confirmed',
    confirmed_at = pg_catalog.clock_timestamp(),
    terms_accepted_at = pg_catalog.clock_timestamp(),
    terms_version = '2026-08-28'
  where reservation.confirmation_token::text = p_confirmation_token
    and reservation.reservation_status = 'pending';

  return found;
end
$$;

revoke all privileges
  on function public.confirm_reservation_by_token(text, text, text, text, text, text, boolean)
  from public, anon, authenticated;

grant execute
  on function public.confirm_reservation_by_token(text, text, text, text, text, text, boolean)
  to anon, authenticated;

commit;

-- Resultado esperado:
--   * Las reservas históricas conservan NULL en ambas columnas.
--   * Solo la RPC establece la fecha y la versión de aceptación.
--   * La firma anterior sin aceptación deja de existir.
--   * anon conserva únicamente EXECUTE sobre la RPC y ningún acceso directo
--     a public.reservations.
