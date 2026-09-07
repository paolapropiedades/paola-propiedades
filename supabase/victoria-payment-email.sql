-- Paola Propiedades: notificación idempotente de pagos de Victoria.
-- Conserva todos los pagos y reservas existentes.

begin;

alter table public.payments
  add column if not exists victoria_email_claimed_at timestamptz;

alter table public.payments
  add column if not exists victoria_email_sent_at timestamptz;

drop function if exists public.register_payment_in_currency(bigint, numeric, date, text);

create function public.register_payment_in_currency(
  p_reservation_id bigint,
  p_amount numeric,
  p_payment_date date,
  p_currency text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_reservation public.reservations%rowtype;
  new_amount_paid numeric;
  new_payment_id bigint;
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
  values (p_reservation_id, p_amount, p_payment_date, p_currency)
  returning id into new_payment_id;

  update public.reservations
  set amount_paid = new_amount_paid,
      payment_status = case when new_amount_paid >= total_price then 'paid' else 'partial' end
  where id = p_reservation_id;

  return new_payment_id;
end
$$;

revoke all privileges on function public.register_payment_in_currency(bigint, numeric, date, text)
  from public, anon, authenticated;
grant execute on function public.register_payment_in_currency(bigint, numeric, date, text)
  to authenticated;

commit;
