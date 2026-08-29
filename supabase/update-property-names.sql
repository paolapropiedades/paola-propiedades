-- Paola Propiedades: actualización de nombres de las 12 propiedades.
-- Ejecutar manualmente en Supabase SQL Editor.
-- Conserva IDs, reservas, pagos y todos los demás datos existentes.

begin;

do $$
declare
  existing_numbers integer[];
begin
  select array_agg(property.number::integer order by property.number)
    into existing_numbers
  from public.properties as property;

  if existing_numbers is distinct from
    array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
  then
    raise exception
      'Se esperaban exactamente las propiedades numeradas del 1 al 13. No se modificó ningún dato.';
  end if;
end
$$;

update public.properties as property
set name = property_names.name
from (
  values
    (1, 'Casa 1'),
    (2, 'Casa 2'),
    (3, 'Casa 3'),
    (4, 'Casa 4'),
    (5, 'Casa 5'),
    (6, 'Casa 6'),
    (7, 'Dpto 101'),
    (8, 'Dpto 105'),
    (9, 'Dpto 106'),
    (10, 'Dpto 201'),
    (11, 'Dpto 202'),
    (12, 'Dpto 301'),
    (13, 'Dpto 306')
) as property_names(number, name)
where property.number = property_names.number;

commit;
