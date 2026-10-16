-- El trigger invocador necesita que el administrador pueda ejecutar el cálculo.
-- No modifica reservas ni concede acceso a usuarios anónimos.
begin;
grant execute on function public.calculate_reservation_maintenance_pen(bigint, date, date) to authenticated;
commit;
