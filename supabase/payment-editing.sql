-- Paola Propiedades: edición y eliminación segura de pagos.
-- Ambas operaciones recalculan el total pagado de la reserva en la misma transacción.

begin;

create or replace function public.update_reservation_payment(
  p_payment_id bigint,
  p_amount numeric,
  p_payment_date date,
  p_operation_number text
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_payment public.payments%rowtype;
  current_reservation public.reservations%rowtype;
  other_payments_total numeric;
  new_amount_paid numeric;
  clean_operation_number text;
begin
  if (select auth.role()) <> 'authenticated' then
    raise exception using errcode = '42501', message = 'No autorizado.';
  end if;

  clean_operation_number := btrim(p_operation_number);
  if p_amount is null or p_amount <= 0 or p_payment_date is null then
    raise exception using errcode = '22023', message = 'Monto o fecha inválidos.';
  end if;
  if clean_operation_number is null
     or clean_operation_number = ''
     or char_length(clean_operation_number) > 100 then
    raise exception using errcode = '22023', message = 'Número de operación inválido.';
  end if;

  select * into current_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Pago no encontrado.';
  end if;

  select * into current_reservation
  from public.reservations
  where id = current_payment.reservation_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Reserva no encontrada.';
  end if;

  select coalesce(sum(amount), 0) into other_payments_total
  from public.payments
  where reservation_id = current_payment.reservation_id
    and id <> current_payment.id;

  new_amount_paid := other_payments_total + p_amount;
  if new_amount_paid > current_reservation.total_price then
    raise exception using errcode = '22023', message = 'El pago supera el total de la reserva.';
  end if;

  update public.payments
  set amount = p_amount,
      payment_date = p_payment_date,
      operation_number = clean_operation_number
  where id = current_payment.id;

  update public.reservations
  set amount_paid = new_amount_paid,
      payment_status = case
        when new_amount_paid <= 0 then 'unpaid'
        when new_amount_paid >= total_price then 'paid'
        else 'partial'
      end
  where id = current_payment.reservation_id;

  return new_amount_paid;
end
$$;

create or replace function public.delete_reservation_payment(
  p_payment_id bigint
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_payment public.payments%rowtype;
  current_reservation public.reservations%rowtype;
  new_amount_paid numeric;
begin
  if (select auth.role()) <> 'authenticated' then
    raise exception using errcode = '42501', message = 'No autorizado.';
  end if;

  select * into current_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Pago no encontrado.';
  end if;

  select * into current_reservation
  from public.reservations
  where id = current_payment.reservation_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Reserva no encontrada.';
  end if;

  delete from public.payments where id = current_payment.id;

  select coalesce(sum(amount), 0) into new_amount_paid
  from public.payments
  where reservation_id = current_payment.reservation_id;

  update public.reservations
  set amount_paid = new_amount_paid,
      payment_status = case
        when new_amount_paid <= 0 then 'unpaid'
        when new_amount_paid >= total_price then 'paid'
        else 'partial'
      end
  where id = current_payment.reservation_id;

  return new_amount_paid;
end
$$;

revoke all privileges on function public.update_reservation_payment(bigint, numeric, date, text)
  from public, anon, authenticated;
grant execute on function public.update_reservation_payment(bigint, numeric, date, text)
  to authenticated;

revoke all privileges on function public.delete_reservation_payment(bigint)
  from public, anon, authenticated;
grant execute on function public.delete_reservation_payment(bigint)
  to authenticated;

commit;
