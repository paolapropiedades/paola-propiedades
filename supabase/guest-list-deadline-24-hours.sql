-- Paola Propiedades: fecha límite de listas 24 horas antes del check-in.
-- Ejecutar manualmente en Supabase SQL Editor.
-- No modifica listas, reservas ni datos existentes.

begin;

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

commit;
