-- Paola Propiedades: moneda fija por reserva y sus pagos.
-- Ejecutar manualmente en Supabase SQL Editor.
-- Conserva todos los datos; los registros existentes quedan como USD.

begin;

alter table public.reservations
  add column if not exists currency text not null default 'USD';

alter table public.payments
  add column if not exists currency text not null default 'USD';

alter table public.reservations drop constraint if exists reservations_currency_check;
alter table public.reservations add constraint reservations_currency_check
  check (currency in ('USD', 'PEN'));

alter table public.payments drop constraint if exists payments_currency_check;
alter table public.payments add constraint payments_currency_check
  check (currency in ('USD', 'PEN'));

drop function if exists public.register_payment_in_currency(bigint, numeric, date, text);

create function public.register_payment_in_currency(
  p_reservation_id bigint,
  p_amount numeric,
  p_payment_date date,
  p_currency text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_reservation public.reservations%rowtype;
  new_amount_paid numeric;
begin
  if (select auth.role()) <> 'authenticated' then
    raise exception using errcode = '42501', message = 'No autorizado.';
  end if;

  if p_amount is null or p_amount <= 0 or p_payment_date is null then
    raise exception using errcode = '22023', message = 'Monto o fecha inválidos.';
  end if;

  select * into current_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Reserva no encontrada.';
  end if;

  if current_reservation.reservation_status = 'cancelled' then
    raise exception using errcode = '22023', message = 'La reserva está cancelada.';
  end if;

  if p_currency not in ('USD', 'PEN') or p_currency <> current_reservation.currency then
    raise exception using errcode = '22023', message = 'La moneda no coincide con la reserva.';
  end if;

  new_amount_paid := coalesce(current_reservation.amount_paid, 0) + p_amount;

  if new_amount_paid > current_reservation.total_price then
    raise exception using errcode = '22023', message = 'El pago supera el saldo pendiente.';
  end if;

  insert into public.payments (reservation_id, amount, payment_date, currency)
  values (p_reservation_id, p_amount, p_payment_date, p_currency);

  update public.reservations
  set amount_paid = new_amount_paid,
      payment_status = case when new_amount_paid >= total_price then 'paid' else 'partial' end
  where id = p_reservation_id;

  return true;
end
$$;

revoke all privileges on function public.register_payment_in_currency(bigint, numeric, date, text)
  from public, anon, authenticated;
grant execute on function public.register_payment_in_currency(bigint, numeric, date, text)
  to authenticated;

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
  currency text
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
         reservation.currency::text
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
