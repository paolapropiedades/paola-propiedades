import { supabase } from '@/lib/supabase'

export const voucherBucket = 'payment-vouchers'
export function voucherError(file: File): string {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Selecciona una imagen JPG, PNG o WebP.'
  if (!file.size || file.size > 5 * 1024 * 1024) return 'La imagen debe pesar entre 1 byte y 5 MB.'
  return ''
}

export async function registerPaymentWithVoucher(params: {
  p_reservation_id: number
  p_amount: number
  p_payment_date: string
  p_currency: string
  p_operation_number: string
}, file: File | null) {
  try {
    if (!file) return await supabase.rpc('register_payment_in_currency', params)
    const invalid = voucherError(file)
    if (invalid) throw new Error(invalid)
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type]
    const path = `${params.p_reservation_id}/${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await supabase.storage.from(voucherBucket).upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) throw new Error(`No se pudo subir el voucher. ${uploadError.message}`)
    // El pago y la asociación del archivo se guardan en una misma transacción.
    return await supabase.rpc('register_payment_with_voucher', { ...params, p_voucher_path: path })
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'No se pudo registrar el pago.' } }
  }
}
