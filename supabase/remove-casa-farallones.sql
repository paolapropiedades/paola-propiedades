-- Paola Propiedades: eliminación definitiva de Casa Farallones.
-- Elimina exclusivamente la propiedad número 1 y sus datos de prueba.

begin;

do $$
declare
  target_count integer;
begin
  select count(*) into target_count
  from public.properties
  where id = 1
    and number = 1
    and name = 'Casa Farallones';

  if target_count <> 1 then
    raise exception
      'No se encontró exactamente Casa Farallones con ID y número 1. No se eliminó nada.';
  end if;
end
$$;

delete from public.reservation_guest_lists
where reservation_id in (
  select id from public.reservations where property_id = 1
);

delete from public.payments
where reservation_id in (
  select id from public.reservations where property_id = 1
);

delete from public.reservations
where property_id = 1;

delete from public.properties
where id = 1
  and number = 1
  and name = 'Casa Farallones';

commit;

-- Resultado esperado:
--   * Casa Farallones deja de existir.
--   * Solo se eliminan sus reservas, pagos y lista de huéspedes de prueba.
