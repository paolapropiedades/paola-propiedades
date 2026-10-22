-- Vouchers privados opcionales. Conserva todos los pagos y reservas existentes.
begin;
alter table public.payments add column if not exists voucher_path text;
create unique index if not exists payments_voucher_path_unique on public.payments(voucher_path) where voucher_path is not null;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('payment-vouchers','payment-vouchers',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists payment_vouchers_admin_read on storage.objects;
create policy payment_vouchers_admin_read on storage.objects for select to authenticated
using (bucket_id='payment-vouchers');
drop policy if exists payment_vouchers_admin_upload on storage.objects;
create policy payment_vouchers_admin_upload on storage.objects for insert to authenticated
with check (bucket_id='payment-vouchers' and exists (
  select 1 from public.reservations r where r.id::text = (storage.foldername(name))[1]
  and r.reservation_status <> 'cancelled'
));

create or replace function public.register_payment_with_voucher(
 p_reservation_id bigint, p_amount numeric, p_payment_date date,
 p_currency text, p_operation_number text, p_voucher_path text
) returns bigint language plpgsql security definer set search_path='' as $$
declare payment_id bigint;
begin
 if (select auth.role()) is distinct from 'authenticated' then
  raise exception using errcode='42501',message='No autorizado.';
 end if;
 if p_voucher_path is null or split_part(p_voucher_path,'/',1) <> p_reservation_id::text
   or not exists(select 1 from storage.objects where bucket_id='payment-vouchers' and name=p_voucher_path) then
  raise exception using errcode='22023',message='Voucher inválido o no encontrado.';
 end if;
 payment_id := public.register_payment_in_currency(p_reservation_id,p_amount,p_payment_date,p_currency,p_operation_number);
 update public.payments set voucher_path=p_voucher_path where id=payment_id;
 return payment_id;
end $$;
revoke all on function public.register_payment_with_voucher(bigint,numeric,date,text,text,text) from public, anon, authenticated;
grant execute on function public.register_payment_with_voucher(bigint,numeric,date,text,text,text) to authenticated;
commit;
