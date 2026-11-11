-- Enforce a cleaning day for new reservations and availability changes.
-- Existing dates and payments are untouched; unchanged legacy bookings remain editable.
begin;
set local lock_timeout = '5s';
create or replace function public.validate_reservation_cleaning_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reservation_status not in ('pending', 'confirmed', 'blocked') then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.property_id is not distinct from old.property_id
      and new.check_in is not distinct from old.check_in
      and new.check_out is not distinct from old.check_out
      and old.reservation_status in ('pending', 'confirmed', 'blocked')
    then
      return new;
    end if;
  end if;
  -- Serialize availability checks for the destination property.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('reservation-cleaning:' || new.property_id::text, 0)
  );
  if exists (
    select 1 from public.reservations r
    where r.property_id = new.property_id
      and r.id is distinct from new.id
      and r.reservation_status in ('pending', 'confirmed', 'blocked')
      and r.check_in <= new.check_out
      and r.check_out >= new.check_in
  ) then
    raise exception using errcode = '23P01',
      message = 'Estas fechas coinciden con otra reserva o con su día de limpieza. El siguiente ingreso debe ser, como mínimo, al día siguiente del check-out.';
  end if;
  return new;
end
$$;
revoke all on function public.validate_reservation_cleaning_day() from public, anon, authenticated;
drop trigger if exists reservations_validate_cleaning_day on public.reservations;
create trigger reservations_validate_cleaning_day
before insert or update of property_id, check_in, check_out, reservation_status
on public.reservations for each row
execute function public.validate_reservation_cleaning_day();
commit;
