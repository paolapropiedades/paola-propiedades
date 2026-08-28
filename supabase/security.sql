-- Paola Propiedades: seguridad definitiva de tablas y RPCs.
-- Ejecutar manualmente en Supabase SQL Editor.
-- Este script no elimina ni modifica reservas, propiedades o pagos existentes.

begin;

-- ---------------------------------------------------------------------------
-- 0. Comprobaciones previas. Si alguna falla, la transacción completa revierte.
-- ---------------------------------------------------------------------------

do $$
declare
  register_payment_count integer;
begin
  select count(*)
    into register_payment_count
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'register_payment';

  if register_payment_count <> 1 then
    raise exception
      'Se esperaba exactamente una función public.register_payment; se encontraron %.',
      register_payment_count;
  end if;

  if exists (
    select 1
    from public.reservations
    where confirmation_token is not null
    group by confirmation_token
    having count(*) > 1
  ) then
    raise exception
      'Hay confirmation_token duplicados en public.reservations. Corrígelos antes de aplicar security.sql.';
  end if;
end
$$;

-- Cada token debe identificar como máximo una reserva.
create unique index if not exists reservations_confirmation_token_uidx
  on public.reservations (confirmation_token)
  where confirmation_token is not null;

-- ---------------------------------------------------------------------------
-- 1. RLS y privilegios de tabla.
-- ---------------------------------------------------------------------------

alter table public.properties enable row level security;
alter table public.reservations enable row level security;
alter table public.payments enable row level security;

-- Elimina todas las policies anteriores de estas tres tablas. Esto permite
-- retirar policies temporales aunque sus nombres no estén versionados aquí.
do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select schemaname, tablename, policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in ('properties', 'reservations', 'payments')
  loop
    execute format(
      'drop policy %I on %I.%I',
      existing_policy.policyname,
      existing_policy.schemaname,
      existing_policy.tablename
    );
  end loop;
end
$$;

-- Primero se retiran todos los grants de los roles expuestos por la Data API.
revoke all privileges on table public.properties from public, anon, authenticated;
revoke all privileges on table public.reservations from public, anon, authenticated;
revoke all privileges on table public.payments from public, anon, authenticated;

-- Retira también posibles grants por columna que hayan quedado de pruebas.
do $$
declare
  column_grant record;
begin
  for column_grant in
    select grantee, table_name, column_name, privilege_type
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name in ('properties', 'reservations', 'payments')
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  loop
    execute format(
      'revoke %s (%I) on table public.%I from %s',
      column_grant.privilege_type,
      column_grant.column_name,
      column_grant.table_name,
      case
        when column_grant.grantee = 'PUBLIC' then 'PUBLIC'
        else format('%I', column_grant.grantee)
      end
    );
  end loop;
end
$$;

-- El navegador anónimo no recibe ningún privilegio directo sobre las tablas.
-- El administrador autenticado recibe únicamente las operaciones usadas por
-- la aplicación. No se concede DELETE en ninguna tabla.
grant select on table public.properties to authenticated;
grant select, insert, update on table public.reservations to authenticated;
grant select, insert on table public.payments to authenticated;

create policy properties_admin_select
  on public.properties
  for select
  to authenticated
  using (true);

create policy reservations_admin_select
  on public.reservations
  for select
  to authenticated
  using (true);

create policy reservations_admin_insert
  on public.reservations
  for insert
  to authenticated
  with check (true);

create policy reservations_admin_update
  on public.reservations
  for update
  to authenticated
  using (true)
  with check (true);

create policy payments_admin_select
  on public.payments
  for select
  to authenticated
  using (true);

create policy payments_admin_insert
  on public.payments
  for insert
  to authenticated
  with check (true);

-- Permite generar IDs solamente en las tablas donde el admin inserta filas.
do $$
declare
  sequence_name text;
begin
  foreach sequence_name in array array[
    pg_catalog.pg_get_serial_sequence('public.reservations', 'id'),
    pg_catalog.pg_get_serial_sequence('public.payments', 'id')
  ]
  loop
    if sequence_name is not null then
      execute format(
        'revoke all privileges on sequence %s from public, anon, authenticated',
        sequence_name
      );
      execute format(
        'grant usage, select on sequence %s to authenticated',
        sequence_name
      );
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. RPC pública de lectura por token.
-- No devuelve IDs internos, property_id, pagos ni datos personales.
-- ---------------------------------------------------------------------------

drop function if exists public.get_reservation_for_confirmation(text);

create function public.get_reservation_for_confirmation(
  p_confirmation_token text
)
returns table (
  reservation_number text,
  check_in date,
  check_out date,
  nights integer,
  total_price numeric,
  reservation_status text,
  property_name text
)
language sql
stable
security definer
set search_path = ''
rows 1
as $$
  select
    reservation.reservation_number::text,
    reservation.check_in::date,
    reservation.check_out::date,
    reservation.nights::integer,
    reservation.total_price::numeric,
    reservation.reservation_status::text,
    property.name::text
  from public.reservations as reservation
  join public.properties as property
    on property.id = reservation.property_id
  where reservation.confirmation_token::text = p_confirmation_token
    and p_confirmation_token is not null
    and pg_catalog.char_length(p_confirmation_token) between 32 and 128
  limit 1
$$;

revoke all privileges
  on function public.get_reservation_for_confirmation(text)
  from public, anon, authenticated;

grant execute
  on function public.get_reservation_for_confirmation(text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC pública de confirmación por token.
-- Solo acepta los cinco campos del tenant y pending -> confirmed.
-- ---------------------------------------------------------------------------

drop function if exists public.confirm_reservation_by_token(
  text,
  text,
  text,
  text,
  text,
  text
);

create function public.confirm_reservation_by_token(
  p_confirmation_token text,
  p_tenant_full_name text,
  p_tenant_address text,
  p_tenant_dni text,
  p_tenant_phone text,
  p_tenant_email text
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
    confirmed_at = pg_catalog.clock_timestamp()
  where reservation.confirmation_token::text = p_confirmation_token
    and reservation.reservation_status = 'pending';

  return found;
end
$$;

revoke all privileges
  on function public.confirm_reservation_by_token(text, text, text, text, text, text)
  from public, anon, authenticated;

grant execute
  on function public.confirm_reservation_by_token(text, text, text, text, text, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. register_payment: solo authenticated.
-- Conserva la implementación y firma existentes; únicamente blinda EXECUTE.
-- ---------------------------------------------------------------------------

do $$
declare
  payment_function record;
begin
  for payment_function in
    select procedure.oid::pg_catalog.regprocedure as signature
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'register_payment'
  loop
    execute format(
      'revoke all privileges on function %s from public, anon, authenticated',
      payment_function.signature
    );
    execute format(
      'grant execute on function %s to authenticated',
      payment_function.signature
    );
  end loop;
end
$$;

commit;

-- Resultado esperado después de ejecutar:
--   * anon no tiene grants directos sobre properties/reservations/payments.
--   * authenticated administra las operaciones requeridas, sin DELETE.
--   * anon solo puede ejecutar las dos RPC limitadas por confirmation_token.
--   * register_payment solo puede ser ejecutada por authenticated.
