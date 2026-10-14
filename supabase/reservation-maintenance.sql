-- Mantenimiento separado del alquiler.
-- Las reservas existentes conservan S/ 0; las nuevas se calculan automáticamente.

begin;

alter table public.reservations
  add column if not exists maintenance_fee_pen numeric(12, 2) not null default 0;

alter table public.reservations
  drop constraint if exists reservations_maintenance_fee_pen_check;

alter table public.reservations
  add constraint reservations_maintenance_fee_pen_check
  check (maintenance_fee_pen >= 0);

comment on column public.reservations.maintenance_fee_pen is
  'Mantenimiento en soles, separado del alquiler. Las estadías que coinciden con el 28 de diciembre al 3 de enero están exoneradas por completo.';

create or replace function public.calculate_reservation_maintenance_pen(
  p_property_id bigint,
  p_check_in date,
  p_check_out date
)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
declare
  property_name text;
  monthly_rate numeric;
  calculated_amount numeric;
begin
  if p_check_in is null or p_check_out is null or p_check_out <= p_check_in then
    return 0;
  end if;

  select property.name
  into property_name
  from public.properties as property
  where property.id = p_property_id;

  if property_name is null then
    raise exception using errcode = '23503', message = 'Propiedad no encontrada.';
  end if;

  -- Si cualquier noche coincide con Año Nuevo, toda la estadía queda exonerada.
  if exists (
    select 1
    from pg_catalog.generate_series(
      p_check_in::timestamp,
      (p_check_out - 1)::timestamp,
      interval '1 day'
    ) as occupied_night
    where (
      pg_catalog.date_part('month', occupied_night) = 12
      and pg_catalog.date_part('day', occupied_night) >= 28
    ) or (
      pg_catalog.date_part('month', occupied_night) = 1
      and pg_catalog.date_part('day', occupied_night) <= 3
    )
  ) then
    return 0;
  end if;

  monthly_rate := case
    when property_name in ('Dpto 301', 'Dpto 305') then 450
    else 700
  end;

  select pg_catalog.round(
    pg_catalog.sum(
      monthly_rate /
      pg_catalog.date_part(
        'day',
        (
          pg_catalog.date_trunc('month', occupied_night)
          + interval '1 month - 1 day'
        )
      )::numeric
    ),
    2
  )
  into calculated_amount
  from pg_catalog.generate_series(
    p_check_in::timestamp,
    (p_check_out - 1)::timestamp,
    interval '1 day'
  ) as occupied_night;

  return coalesce(calculated_amount, 0);
end
$$;

revoke all privileges
  on function public.calculate_reservation_maintenance_pen(bigint, date, date)
  from public, anon, authenticated;

create or replace function public.set_reservation_maintenance_pen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.property_id is distinct from old.property_id
    or new.check_in is distinct from old.check_in
    or new.check_out is distinct from old.check_out
  then
    new.maintenance_fee_pen := public.calculate_reservation_maintenance_pen(
      new.property_id,
      new.check_in,
      new.check_out
    );
  elsif new.maintenance_fee_pen is distinct from old.maintenance_fee_pen then
    new.maintenance_fee_pen := old.maintenance_fee_pen;
  end if;

  return new;
end
$$;

revoke all privileges on function public.set_reservation_maintenance_pen()
  from public, anon, authenticated;

drop trigger if exists reservations_set_maintenance_pen
  on public.reservations;

create trigger reservations_set_maintenance_pen
before insert or update of property_id, check_in, check_out, maintenance_fee_pen
on public.reservations
for each row
execute function public.set_reservation_maintenance_pen();

drop function if exists public.get_reservation_for_confirmation(text);

create function public.get_reservation_for_confirmation(p_confirmation_token text)
returns table (
  reservation_number text,
  check_in date,
  check_out date,
  nights integer,
  total_price numeric,
  maintenance_fee_pen numeric,
  reservation_status text,
  property_name text,
  max_guests integer,
  currency text,
  payment_schedule jsonb,
  guarantee_amount numeric,
  guarantee_received_on date,
  guarantee_returned_on date
)
language sql
stable
security definer
set search_path = ''
rows 1
as $$
  select reservation.reservation_number::text,
         reservation.check_in::date,
         reservation.check_out::date,
         reservation.nights::integer,
         reservation.total_price::numeric,
         reservation.maintenance_fee_pen::numeric,
         reservation.reservation_status::text,
         property.name::text,
         property.max_guests::integer,
         reservation.currency::text,
         reservation.payment_schedule,
         reservation.guarantee_amount::numeric,
         reservation.guarantee_received_on,
         reservation.guarantee_returned_on
  from public.reservations as reservation
  join public.properties as property on property.id = reservation.property_id
  where reservation.confirmation_token::text = p_confirmation_token
    and p_confirmation_token is not null
    and pg_catalog.char_length(p_confirmation_token) between 32 and 128
  limit 1
$$;

revoke all privileges on function public.get_reservation_for_confirmation(text)
  from public, anon, authenticated;
grant execute on function public.get_reservation_for_confirmation(text)
  to anon, authenticated;

commit;
