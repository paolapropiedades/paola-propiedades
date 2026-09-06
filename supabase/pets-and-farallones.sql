-- Paola Propiedades: Casa Farallones y hasta dos mascotas por reserva.
-- Ejecutar manualmente en Supabase SQL Editor.
-- Conserva reservas y listas existentes.

begin;

do $$
declare
  current_name text;
begin
  select name into current_name from public.properties where number = 1;

  if current_name not in ('Casa 1', 'Casa Farallones') then
    raise exception 'La propiedad número 1 no coincide con la esperada. No se modificó nada.';
  end if;

  update public.properties set name = 'Casa Farallones' where number = 1;
end
$$;

alter table public.reservation_guest_lists
  add column if not exists pets jsonb not null default '[]'::jsonb;

drop function if exists public.get_guest_list_by_token(text);

create function public.get_guest_list_by_token(p_confirmation_token text)
returns table (
  max_guests integer,
  submission_deadline date,
  submitted_at timestamptz,
  guests jsonb,
  vehicle_plates text[],
  pets jsonb
)
language sql
stable
security definer
set search_path = ''
rows 1
as $$
  select property.max_guests,
         (reservation.check_in - 1)::date,
         guest_list.submitted_at,
         coalesce(guest_list.guests, '[]'::jsonb),
         coalesce(guest_list.vehicle_plates, '{}'::text[]),
         coalesce(guest_list.pets, '[]'::jsonb)
  from public.reservations as reservation
  join public.properties as property on property.id = reservation.property_id
  left join public.reservation_guest_lists as guest_list
    on guest_list.reservation_id = reservation.id
  where reservation.confirmation_token::text = p_confirmation_token
    and reservation.reservation_status = 'confirmed'
    and p_confirmation_token is not null
    and pg_catalog.char_length(p_confirmation_token) between 32 and 128
  limit 1
$$;

revoke all privileges on function public.get_guest_list_by_token(text)
  from public, anon, authenticated;
grant execute on function public.get_guest_list_by_token(text)
  to anon, authenticated;

-- Se elimina la firma anterior para impedir que se omita deliberadamente
-- la declaración de mascotas.
drop function if exists public.save_guest_list_by_token(text, jsonb, text[]);
drop function if exists public.save_guest_list_by_token(text, jsonb, text[], jsonb);

create function public.save_guest_list_by_token(
  p_confirmation_token text,
  p_guests jsonb,
  p_vehicle_plates text[],
  p_pets jsonb
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
  join public.properties as property on property.id = reservation.property_id
  where reservation.confirmation_token::text = p_confirmation_token
    and reservation.reservation_status = 'confirmed';

  if not found then return false; end if;

  if p_guests is null
    or pg_catalog.jsonb_typeof(p_guests) <> 'array'
    or pg_catalog.jsonb_array_length(p_guests) not between 1 and guest_capacity
    or exists (
      select 1 from pg_catalog.jsonb_array_elements(p_guests) as guest(value)
      where pg_catalog.jsonb_typeof(guest.value) <> 'object'
        or not guest.value ?& array['full_name', 'dni', 'age']
        or exists (
          select 1 from pg_catalog.jsonb_object_keys(guest.value) as field(key)
          where field.key not in ('full_name', 'dni', 'age')
        )
        or pg_catalog.char_length(pg_catalog.btrim(coalesce(guest.value ->> 'full_name', ''))) not between 1 and 200
        or pg_catalog.char_length(pg_catalog.btrim(coalesce(guest.value ->> 'dni', ''))) not between 1 and 50
        or coalesce(guest.value ->> 'age', '') !~ '^[0-9]{1,3}$'
        or (guest.value ->> 'age')::integer not between 0 and 120
    )
  then
    raise exception using errcode = '22023', message = 'La lista de huéspedes no es válida.';
  end if;

  select coalesce(pg_catalog.array_agg(pg_catalog.btrim(plate)), '{}'::text[])
    into normalized_plates
  from pg_catalog.unnest(coalesce(p_vehicle_plates, '{}'::text[])) as plate
  where pg_catalog.btrim(plate) <> '';

  if pg_catalog.cardinality(normalized_plates) > 2
    or exists (
      select 1 from pg_catalog.unnest(normalized_plates) as plate
      where pg_catalog.char_length(plate) > 20
    )
  then
    raise exception using errcode = '22023', message = 'Las placas no son válidas.';
  end if;

  if p_pets is null
    or pg_catalog.jsonb_typeof(p_pets) <> 'array'
    or pg_catalog.jsonb_array_length(p_pets) > 2
    or exists (
      select 1 from pg_catalog.jsonb_array_elements(p_pets) as pet(value)
      where pg_catalog.jsonb_typeof(pet.value) <> 'object'
        or not pet.value ?& array['name', 'size']
        or exists (
          select 1 from pg_catalog.jsonb_object_keys(pet.value) as field(key)
          where field.key not in ('name', 'size')
        )
        or pg_catalog.char_length(pg_catalog.btrim(coalesce(pet.value ->> 'name', ''))) not between 1 and 100
        or coalesce(pet.value ->> 'size', '') not in ('Pequeña', 'Mediana', 'Grande')
    )
  then
    raise exception using errcode = '22023', message = 'La lista de mascotas no es válida.';
  end if;

  insert into public.reservation_guest_lists as guest_list (
    reservation_id, guests, vehicle_plates, pets, submitted_at, updated_at
  ) values (
    target_reservation_id, p_guests, normalized_plates, p_pets,
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  )
  on conflict (reservation_id) do update
  set guests = excluded.guests,
      vehicle_plates = excluded.vehicle_plates,
      pets = excluded.pets,
      updated_at = pg_catalog.clock_timestamp();

  return true;
end
$$;

revoke all privileges on function public.save_guest_list_by_token(text, jsonb, text[], jsonb)
  from public, anon, authenticated;
grant execute on function public.save_guest_list_by_token(text, jsonb, text[], jsonb)
  to anon, authenticated;

commit;
