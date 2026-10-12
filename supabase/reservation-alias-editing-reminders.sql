-- Paola Propiedades: alias privado, edición segura y recordatorios de cuotas.
-- Conserva todas las reservas, pagos, enlaces y listas de huéspedes existentes.

begin;

alter table public.reservations
  add column if not exists internal_alias text;

alter table public.reservations
  drop constraint if exists reservations_internal_alias_check;

alter table public.reservations
  add constraint reservations_internal_alias_check
  check (
    internal_alias is null
    or (
      internal_alias = pg_catalog.btrim(internal_alias)
      and pg_catalog.char_length(internal_alias) between 1 and 100
    )
  );

comment on column public.reservations.internal_alias is
  'Referencia privada visible únicamente para administradores autenticados.';

create or replace function public.validate_safe_reservation_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.internal_alias := nullif(pg_catalog.btrim(new.internal_alias), '');

  if new.check_out <= new.check_in then
    raise exception using errcode = '22023',
      message = 'El check-out debe ser posterior al check-in.';
  end if;

  new.nights := new.check_out - new.check_in;

  if new.total_price is null or new.total_price <= 0 then
    raise exception using errcode = '22023',
      message = 'El total de la reserva debe ser mayor a cero.';
  end if;

  if new.total_price < coalesce(new.amount_paid, 0) then
    raise exception using errcode = '22023',
      message = 'El total no puede ser menor que el monto ya pagado.';
  end if;

  if tg_op = 'UPDATE'
    and new.currency is distinct from old.currency
    and exists (
      select 1
      from public.payments as payment
      where payment.reservation_id = old.id
    )
  then
    raise exception using errcode = '22023',
      message = 'No se puede cambiar la moneda de una reserva que ya tiene pagos.';
  end if;

  return new;
end
$$;

revoke all privileges on function public.validate_safe_reservation_edit()
  from public, anon, authenticated;

drop trigger if exists reservations_validate_safe_edit
  on public.reservations;

create trigger reservations_validate_safe_edit
before insert or update of
  internal_alias,
  property_id,
  check_in,
  check_out,
  total_price,
  amount_paid,
  currency,
  payment_schedule
on public.reservations
for each row
execute function public.validate_safe_reservation_edit();

create table if not exists public.payment_reminder_deliveries (
  id bigint generated always as identity primary key,
  reservation_id bigint not null
    references public.reservations (id) on delete cascade,
  installment_index integer not null check (installment_index >= 0),
  due_date date not null,
  amount numeric not null check (amount > 0),
  claimed_at timestamptz,
  claim_token uuid,
  sent_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default pg_catalog.now(),
  unique (reservation_id, installment_index, due_date, amount)
);

comment on table public.payment_reminder_deliveries is
  'Control idempotente de recordatorios enviados 24 horas antes de cada cuota.';

create index if not exists payment_reminders_reservation_idx
  on public.payment_reminder_deliveries (reservation_id, due_date);

create index if not exists payment_reminders_pending_idx
  on public.payment_reminder_deliveries (due_date, claimed_at)
  where sent_at is null;

alter table public.payment_reminder_deliveries enable row level security;
revoke all privileges on table public.payment_reminder_deliveries
  from public, anon, authenticated;
grant select on table public.payment_reminder_deliveries to authenticated;

drop policy if exists payment_reminders_admin_select
  on public.payment_reminder_deliveries;

create policy payment_reminders_admin_select
  on public.payment_reminder_deliveries
  for select
  to authenticated
  using (true);

create or replace function public.clear_stale_payment_reminders_after_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_schedule is distinct from old.payment_schedule
    or new.total_price is distinct from old.total_price
    or new.currency is distinct from old.currency
    or new.tenant_email is distinct from old.tenant_email
  then
    delete from public.payment_reminder_deliveries
    where reservation_id = new.id
      and sent_at is null;
  end if;

  return new;
end
$$;

revoke all privileges
  on function public.clear_stale_payment_reminders_after_edit()
  from public, anon, authenticated;

drop trigger if exists reservations_clear_stale_payment_reminders
  on public.reservations;

create trigger reservations_clear_stale_payment_reminders
after update of payment_schedule, total_price, currency, tenant_email
on public.reservations
for each row
execute function public.clear_stale_payment_reminders_after_edit();

create or replace function public.claim_due_payment_reminders(
  p_due_date date,
  p_claim_token uuid
)
returns table (
  delivery_id bigint,
  reservation_id bigint,
  reservation_number text,
  confirmation_token text,
  tenant_full_name text,
  tenant_email text,
  property_name text,
  check_in date,
  currency text,
  installment_amount numeric,
  outstanding_balance numeric,
  due_date date,
  claim_token uuid
)
language sql
security definer
set search_path = ''
as $$
  with schedule_items as (
    select
      reservation.id as reservation_id,
      reservation.reservation_number::text,
      reservation.confirmation_token::text,
      reservation.tenant_full_name::text,
      reservation.tenant_email::text,
      property.name::text as property_name,
      reservation.check_in::date,
      reservation.currency::text,
      reservation.total_price::numeric,
      coalesce(reservation.amount_paid, 0)::numeric as amount_paid,
      (installment.ordinality - 1)::integer as installment_index,
      (installment.value ->> 'due_date')::date as due_date,
      (installment.value ->> 'amount')::numeric as installment_amount,
      sum((installment.value ->> 'amount')::numeric) over (
        partition by reservation.id
        order by
          (installment.value ->> 'due_date')::date,
          installment.ordinality
        rows between unbounded preceding and current row
      ) as cumulative_due
    from public.reservations as reservation
    join public.properties as property
      on property.id = reservation.property_id
    cross join lateral pg_catalog.jsonb_array_elements(
      reservation.payment_schedule
    ) with ordinality as installment(value, ordinality)
    where reservation.reservation_status = 'confirmed'
      and reservation.tenant_email is not null
      and pg_catalog.btrim(reservation.tenant_email) <> ''
      and coalesce(reservation.amount_paid, 0) < reservation.total_price
  ), candidates as (
    select *
    from schedule_items
    where schedule_items.due_date = p_due_date
      and schedule_items.amount_paid < schedule_items.cumulative_due
  ), claimed as (
    insert into public.payment_reminder_deliveries as delivery (
      reservation_id,
      installment_index,
      due_date,
      amount,
      claimed_at,
      claim_token,
      attempts,
      last_error
    )
    select
      candidate.reservation_id,
      candidate.installment_index,
      candidate.due_date,
      candidate.installment_amount,
      pg_catalog.now(),
      p_claim_token,
      1,
      null
    from candidates as candidate
    on conflict (reservation_id, installment_index, due_date, amount)
    do update set
      claimed_at = excluded.claimed_at,
      claim_token = excluded.claim_token,
      attempts = delivery.attempts + 1,
      last_error = null
    where delivery.sent_at is null
      and (
        delivery.claimed_at is null
        or delivery.claimed_at < pg_catalog.now() - interval '15 minutes'
      )
    returning delivery.id, delivery.reservation_id,
      delivery.installment_index, delivery.due_date, delivery.amount,
      delivery.claim_token
  )
  select
    claimed.id,
    candidate.reservation_id,
    candidate.reservation_number,
    candidate.confirmation_token,
    candidate.tenant_full_name,
    candidate.tenant_email,
    candidate.property_name,
    candidate.check_in,
    candidate.currency,
    candidate.installment_amount,
    greatest(
      candidate.total_price - candidate.amount_paid,
      0
    )::numeric,
    candidate.due_date,
    claimed.claim_token
  from claimed
  join candidates as candidate
    on candidate.reservation_id = claimed.reservation_id
   and candidate.installment_index = claimed.installment_index
   and candidate.due_date = claimed.due_date
   and candidate.installment_amount = claimed.amount
$$;

revoke all privileges
  on function public.claim_due_payment_reminders(date, uuid)
  from public, anon, authenticated;
grant execute
  on function public.claim_due_payment_reminders(date, uuid)
  to service_role;

commit;
