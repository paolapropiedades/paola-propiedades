-- Paola Propiedades: cronograma opcional de pagos por reserva.
-- Ejecutar manualmente en Supabase SQL Editor.
-- Las reservas existentes conservan un cronograma vacío.

begin;

alter table public.reservations
  add column if not exists payment_schedule jsonb not null default '[]'::jsonb;

create or replace function public.validate_reservation_payment_schedule()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  scheduled_total numeric;
begin
  if pg_catalog.jsonb_typeof(new.payment_schedule) <> 'array'
    or pg_catalog.jsonb_array_length(new.payment_schedule) > 24
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(new.payment_schedule) as installment(value)
      where pg_catalog.jsonb_typeof(installment.value) <> 'object'
        or not installment.value ?& array['due_date', 'amount']
        or exists (
          select 1
          from pg_catalog.jsonb_object_keys(installment.value) as field(key)
          where field.key not in ('due_date', 'amount')
        )
        or coalesce(installment.value ->> 'due_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or coalesce(installment.value ->> 'amount', '') !~ '^[0-9]+(\.[0-9]{1,2})?$'
        or (installment.value ->> 'amount')::numeric <= 0
    )
  then
    raise exception using
      errcode = '22023',
      message = 'El cronograma de pagos no es válido.';
  end if;

  if pg_catalog.jsonb_array_length(new.payment_schedule) > 0 then
    select coalesce(sum((installment.value ->> 'amount')::numeric), 0)
      into scheduled_total
    from pg_catalog.jsonb_array_elements(new.payment_schedule) as installment(value);

    if round(scheduled_total, 2) <> round(new.total_price, 2) then
      raise exception using
        errcode = '22023',
        message = 'Las cuotas deben sumar exactamente el total de la reserva.';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists reservations_validate_payment_schedule
  on public.reservations;

create trigger reservations_validate_payment_schedule
before insert or update of payment_schedule, total_price
on public.reservations
for each row
execute function public.validate_reservation_payment_schedule();

revoke all privileges on function public.validate_reservation_payment_schedule()
  from public, anon, authenticated;

drop function if exists public.get_reservation_for_confirmation(text);

create function public.get_reservation_for_confirmation(p_confirmation_token text)
returns table (
  reservation_number text,
  check_in date,
  check_out date,
  nights integer,
  total_price numeric,
  reservation_status text,
  property_name text,
  currency text,
  payment_schedule jsonb
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
         reservation.reservation_status::text,
         property.name::text,
         reservation.currency::text,
         reservation.payment_schedule
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
