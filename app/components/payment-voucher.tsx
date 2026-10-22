'use client'

import { useId, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { voucherBucket, voucherError } from '@/lib/payment-voucher'

export function VoucherInput({ file, onChange, disabled }: {
  file: File | null; onChange: (file: File | null) => void; disabled: boolean
}) {
  const id = useId()
  const [error, setError] = useState('')
  return <div className="mt-4">
    <label htmlFor={id} className="block text-sm font-semibold text-gray-900">Voucher de pago (opcional)</label>
    <input key={file ? 'selected' : 'empty'} id={id} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled}
      onChange={event => {
        const selected = event.target.files?.[0] ?? null
        const invalid = selected ? voucherError(selected) : ''
        setError(invalid)
        onChange(invalid ? null : selected)
        if (invalid) event.target.value = ''
      }} className="mt-2 block w-full rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-900" />
    <p className="mt-1 text-xs text-gray-600">JPG, PNG o WebP · máximo 5 MB. Solo visible en el panel administrativo.</p>
    {file && <div className="mt-2 flex items-center gap-2 text-sm text-gray-800"><span className="break-all">{file.name}</span><button type="button" disabled={disabled} onClick={() => { onChange(null); setError('') }} className="font-bold text-red-700">Quitar</button></div>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </div>
}

export function VoucherLink({ path }: { path: string }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function view() {
    setBusy(true); setError('')
    try {
      const { data, error } = await supabase.storage.from(voucherBucket).createSignedUrl(path, 300)
      if (error) throw error
      setUrl(data.signedUrl)
    } catch { setError('No se pudo abrir el voucher. Intenta nuevamente.') }
    finally { setBusy(false) }
  }
  return <div className="mt-2">
    <button type="button" disabled={busy} onClick={() => { void view() }} className="text-sm font-bold text-blue-700">{busy ? 'Abriendo…' : 'Ver voucher'}</button>
    {url && <div className="mt-2"><a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-blue-700 underline">Abrir imagen del voucher</a><p className="text-xs text-gray-600">Enlace privado válido por 5 minutos.</p></div>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>
}
