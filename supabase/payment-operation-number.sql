-- Paola Propiedades: número de operación por pago.
-- La columna es nullable para conservar intactos los pagos históricos.

begin;

alter table public.payments
  add column if not exists operation_number text;

alter table public.payments
  drop constraint if exists payments_operation_number_check;

alter table public.payments
  add constraint payments_operation_number_check
  check (
    operation_number is null
    or char_length(btrim(operation_number)) between 1 and 100
  );

drop function if exists public.register_payment_in_currency(bigint, numeric, date, text, text);

create function public.register_payment_in_currency(
  p_reservation_id bigint,
  p_amount numeric,
  p_payment_date date,
  p_currency text,
  p_operation_number text
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
  clean_operation_number text;
begin
  if (select auth.role()) <> 'authenticated' then
    raise exception using errcode = '42501', message = 'No autorizado.';
  end if;

  if p_amount is null or p_amount <= 0 or p_payment_date is null then
    raise exception using errcode = '22023', message = 'Monto o fecha inválidos.';
  end if;

  clean_operation_number := btrim(p_operation_number);
  if clean_operation_number is null
     or clean_operation_number = ''
     or char_length(clean_operation_number) > 100 then
    raise exception using errcode = '22023', message = 'Número de operación inválido.';
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

  insert into public.payments (
    reservation_id,
    amount,
    payment_date,
    currency,
    operation_number
  )
  values (
    p_reservation_id,
    p_amount,
    p_payment_date,
    p_currency,
    clean_operation_number
  )
  returning id into new_payment_id;

  update public.reservations
  set amount_paid = new_amount_paid,
      payment_status = case when new_amount_paid >= total_price then 'paid' else 'partial' end
  where id = p_reservation_id;

  return new_payment_id;
end
$$;

revoke all privileges on function public.register_payment_in_currency(bigint, numeric, date, text, text)
  from public, anon, authenticated;
grant execute on function public.register_payment_in_currency(bigint, numeric, date, text, text)
  to authenticated;

commit;
