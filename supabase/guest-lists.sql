-- Paola Propiedades: capacidades, Dpto 202 y listas de huéspedes/vehículos.
-- Ejecutar manualmente en Supabase SQL Editor antes de publicar el frontend.
-- No elimina reservas, pagos ni datos históricos.

begin;

-- ---------------------------------------------------------------------------
-- 1. Propiedades y capacidades.
-- ---------------------------------------------------------------------------

alter table public.properties
  add column if not exists max_guests integer;

do $$
declare
  current_names text[];
begin
  select array_agg(property.name order by property.number)
    into current_names
  from public.properties as property;

  if current_names = array[
    'Casa 1', 'Casa 2', 'Casa 3', 'Casa 4', 'Casa 5', 'Casa 6',
    'Dpto 101', 'Dpto 105', 'Dpto 106', 'Dpto 201', 'Dpto 301', 'Dpto 306'
  ] then
    -- Valores temporales evitan conflictos con UNIQUE(number).
    update public.properties set number = -11 where name = 'Dpto 301';
    update public.properties set number = -12 where name = 'Dpto 306';

    if exists (select 1 from public.properties where id = 13) then
      raise exception
        'El ID 13 ya está ocupado. No se agregó Dpto 202 ni se modificaron datos.';
    end if;

    insert into public.properties (id, number, name, active)
    values (13, 11, 'Dpto 202', true);

    update public.properties set number = 12 where name = 'Dpto 301';
    update public.properties set number = 13 where name = 'Dpto 306';
  elsif current_names is distinct from array[
    'Casa 1', 'Casa 2', 'Casa 3', 'Casa 4', 'Casa 5', 'Casa 6',
    'Dpto 101', 'Dpto 105', 'Dpto 106', 'Dpto 201', 'Dpto 202',
    'Dpto 301', 'Dpto 306'
  ] then
    raise exception
      'La lista actual de propiedades no coincide con la esperada. No se modificaron datos.';
  end if;
end
$$;

update public.properties
set max_guests = case
  when name like 'Casa %' then 16
  when name in ('Dpto 301', 'Dpto 306') then 8
  when name in ('Dpto 101', 'Dpto 105', 'Dpto 106', 'Dpto 201', 'Dpto 202') then 17
  else max_guests
end;

do $$
begin
  if exists (
    select 1
    from public.properties
    where max_guests is null
  ) then
    raise exception
      'Hay propiedades sin capacidad configurada. No se aplicó la migración.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.properties'::pg_catalog.regclass
      and conname = 'properties_max_guests_check'
  ) then
    alter table public.properties
      add constraint properties_max_guests_check
      check (max_guests between 1 and 30);
  end if;
end
$$;

alter table public.properties
  alter column max_guests set not null;

-- ---------------------------------------------------------------------------
-- 2. Lista asociada uno-a-uno con cada reserva.
-- ---------------------------------------------------------------------------

create table if not exists public.reservation_guest_lists (
  reservation_id bigint primary key
    references public.reservations (id) on delete restrict,
  guests jsonb not null default '[]'::jsonb,
  vehicle_plates text[] not null default '{}'::text[],
  submitted_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table public.reservation_guest_lists enable row level security;

drop policy if exists guest_lists_admin_select
  on public.reservation_guest_lists;

revoke all privileges
  on table public.reservation_guest_lists
  from public, anon, authenticated;

grant select
  on table public.reservation_guest_lists
  to authenticated;

create policy guest_lists_admin_select
  on public.reservation_guest_lists
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 3. Lectura pública limitada a una reserva confirmada y su token.
-- ---------------------------------------------------------------------------

drop function if exists public.get_guest_list_by_token(text);

create function public.get_guest_list_by_token(
  p_confirmation_token text
)
returns table (
  max_guests integer,
  submission_deadline date,
  submitted_at timestamptz,
  guests jsonb,
  vehicle_plates text[]
)
language sql
stable
security definer
set search_path = ''
rows 1
as $$
  select
    property.max_guests,
    (reservation.check_in - 7)::date,
    guest_list.submitted_at,
    coalesce(guest_list.guests, '[]'::jsonb),
    coalesce(guest_list.vehicle_plates, '{}'::text[])
  from public.reservations as reservation
  join public.properties as property
    on property.id = reservation.property_id
  left join public.reservation_guest_lists as guest_list
    on guest_list.reservation_id = reservation.id
  where reservation.confirmation_token::text = p_confirmation_token
    and reservation.reservation_status = 'confirmed'
    and p_confirmation_token is not null
    and pg_catalog.char_length(p_confirmation_token) between 32 and 128
  limit 1
$$;

revoke all privileges
  on function public.get_guest_list_by_token(text)
  from public, anon, authenticated;

grant execute
  on function public.get_guest_list_by_token(text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Guardado público validado por token, estado y capacidad.
-- ---------------------------------------------------------------------------

drop function if exists public.save_guest_list_by_token(text, jsonb, text[]);

create function public.save_guest_list_by_token(
  p_confirmation_token text,
  p_guests jsonb,
  p_vehicle_plates text[]
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_reservation_id bigint;
  guest_capacity integer;
  normalized_plates text[];
begin
  if p_confirmation_token is null
    or pg_catalog.char_length(p_confirmation_token) not between 32 and 128
  then
    return false;
  end if;

  select reservation.id, property.max_guests
    into target_reservation_id, guest_capacity
  from public.reservations as reservation
  join public.properties as property
    on property.id = reservation.property_id
  where reservation.confirmation_token::text = p_confirmation_token
    and reservation.reservation_status = 'confirmed';

  if not found then
    return false;
  end if;

  if p_guests is null
    or pg_catalog.jsonb_typeof(p_guests) <> 'array'
    or pg_catalog.jsonb_array_length(p_guests) not between 1 and guest_capacity
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_guests) as guest(value)
      where pg_catalog.jsonb_typeof(guest.value) <> 'object'
        or not guest.value ?& array['full_name', 'dni', 'age']
        or exists (
          select 1
          from pg_catalog.jsonb_object_keys(guest.value) as field(key)
          where field.key not in ('full_name', 'dni', 'age')
        )
        or pg_catalog.char_length(
          pg_catalog.btrim(coalesce(guest.value ->> 'full_name', ''))
        ) not between 1 and 200
        or pg_catalog.char_length(
          pg_catalog.btrim(coalesce(guest.value ->> 'dni', ''))
        ) not between 1 and 50
        or coalesce(guest.value ->> 'age', '') !~ '^[0-9]{1,3}$'
        or (guest.value ->> 'age')::integer not between 0 and 120
    )
  then
    raise exception using
      errcode = '22023',
      message = 'La lista de huéspedes no es válida.';
  end if;

  select coalesce(
    pg_catalog.array_agg(pg_catalog.btrim(plate)),
    '{}'::text[]
  )
    into normalized_plates
  from pg_catalog.unnest(coalesce(p_vehicle_plates, '{}'::text[])) as plate
  where pg_catalog.btrim(plate) <> '';

  if pg_catalog.cardinality(normalized_plates) > 2
    or exists (
      select 1
      from pg_catalog.unnest(normalized_plates) as plate
      where pg_catalog.char_length(plate) > 20
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Las placas de vehículos no son válidas.';
  end if;

  insert into public.reservation_guest_lists as guest_list (
    reservation_id,
    guests,
    vehicle_plates,
    submitted_at,
    updated_at
  )
  values (
    target_reservation_id,
    p_guests,
    normalized_plates,
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  )
  on conflict (reservation_id) do update
  set
    guests = excluded.guests,
    vehicle_plates = excluded.vehicle_plates,
    updated_at = pg_catalog.clock_timestamp();

  return true;
end
$$;

revoke all privileges
  on function public.save_guest_list_by_token(text, jsonb, text[])
  from public, anon, authenticated;

grant execute
  on function public.save_guest_list_by_token(text, jsonb, text[])
  to anon, authenticated;

commit;

-- Resultado esperado:
--   * Existen 13 propiedades y todas tienen capacidad.
--   * anon no puede leer ni modificar reservation_guest_lists directamente.
--   * El token solo accede a la lista de su reserva confirmada.
--   * El servidor valida capacidad, campos de huéspedes y máximo dos placas.
