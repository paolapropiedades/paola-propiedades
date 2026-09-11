-- Devolución total de garantía. Aplicar después de reservation-guarantee.sql.
-- No modifica importes, pagos ni reservas históricas.
begin;
alter table public.reservations add column if not exists guarantee_returned_on date;
alter table public.reservations drop constraint if exists reservations_guarantee_return_check;
alter table public.reservations add constraint reservations_guarantee_return_check check (
  guarantee_returned_on is null or (
    guarantee_received_on is not null and guarantee_amount > 0
    and guarantee_returned_on >= guarantee_received_on
  )
);
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
         reservation.reservation_status::text,
         property.name::text,
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
