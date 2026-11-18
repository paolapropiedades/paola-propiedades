'use client'

import { useState } from 'react'
import { utils, writeFileXLSX } from 'xlsx'
import { supabase } from '@/lib/supabase'

type Row = {
  id: number
  payment_date: string
  amount: number
  currency: string
  operation_number: string | null
  reservations: {
    reservation_number: string
    tenant_full_name: string | null
    tenant_dni: string | null
    tenant_email: string | null
    tenant_phone: string | null
    tenant_address: string | null
    check_in: string
    check_out: string
    reservation_status: string
    properties: { name: string } | null
  } | null
}

export function PaymentExport({ owners }: { owners: Record<string, string> }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [owner, setOwner] = useState('all')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function download() {
    if (busy) return
    setMessage('')
    if (from && to && from > to) {
      setMessage('La fecha inicial debe ser anterior o igual a la fecha final.')
      return
    }
    setBusy(true)
    try {
      const payments: Row[] = []
      // Paginate so the API row limit never truncates the report.
      let offset = 0
      while (true) {
        let query = supabase.from('payments')
          .select('id, payment_date, amount, currency, operation_number, reservations(reservation_number, tenant_full_name, tenant_dni, tenant_email, tenant_phone, tenant_address, check_in, check_out, reservation_status, properties(name))')
          .order('payment_date', { ascending: false }).order('id', { ascending: false })
          .range(offset, offset + 499)
        if (from) query = query.gte('payment_date', from)
        if (to) query = query.lte('payment_date', to)
        const { data, error } = await query
        if (error) throw error
        const batch = (data ?? []) as unknown as Row[]
        payments.push(...batch)
        if (batch.length < 500) break
        offset += batch.length
      }
      const rows = payments.filter(payment => owner === 'all' ||
        owners[payment.reservations?.properties?.name ?? ''] === owner
      ).map(payment => ({
        'ID pago': payment.id,
        'Fecha del pago': payment.payment_date.split('-').reverse().join('/'),
        Reserva: payment.reservations?.reservation_number ?? '',
        Propiedad: payment.reservations?.properties?.name ?? '',
        Propietaria: owners[payment.reservations?.properties?.name ?? ''] ?? '',
        Cliente: payment.reservations?.tenant_full_name || 'Pendiente de completar',
        DNI: payment.reservations?.tenant_dni ?? '',
        Correo: payment.reservations?.tenant_email ?? '',
        Celular: payment.reservations?.tenant_phone ?? '',
        Dirección: payment.reservations?.tenant_address ?? '',
        'Check-in': payment.reservations?.check_in?.split('-').reverse().join('/') ?? '',
        'Check-out': payment.reservations?.check_out?.split('-').reverse().join('/') ?? '',
        'Estado de reserva': ({ pending: 'Pendiente', confirmed: 'Confirmada', cancelled: 'Cancelada', blocked: 'Bloqueada' } as Record<string, string>)[payment.reservations?.reservation_status ?? ''] ?? '',

        Monto: Number(payment.amount),
        Moneda: payment.currency,
        'Número de operación': payment.operation_number ?? '',
      }))
      if (!rows.length) {
        setMessage('No hay pagos para las fechas y propietaria seleccionadas.')
        return
      }
      const sheet = utils.json_to_sheet(rows)
      sheet['!cols'] = [12, 18, 22, 18, 16, 38, 16, 32, 18, 45, 16, 16, 20, 16, 12, 26].map(wch => ({ wch }))
      sheet['!autofilter'] = { ref: sheet['!ref']! }
      // Keep amounts numeric and identifiers as text (including leading zeros).
      for (let row = 2; row <= rows.length + 1; row++) sheet[`N${row}`].z = '#,##0.00'
      const book = utils.book_new()
      utils.book_append_sheet(book, sheet, 'Pagos y clientes')
      writeFileXLSX(book, `Paola_Propiedades_Pagos_y_Clientes_${owner}_${from || 'inicio'}_${to || 'hasta_hoy'}.xlsx`, { compression: true })
      setMessage(`Se descargaron ${rows.length} pagos.`)
    } catch {
      setMessage('No se pudieron descargar los pagos. Intenta nuevamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 text-gray-950">
      <h2 className="text-lg font-bold">Informe de pagos y clientes</h2>
      <p className="mt-1 text-sm text-gray-600">Una fila por pago con los datos del cliente y su reserva. Filtra por fecha del pago y propietaria; sin fechas se incluyen todos los pagos. Los datos de clientes sin registro completo aparecerán pendientes.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold">Desde
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} disabled={busy} className="mt-1 block min-h-11 rounded-lg border border-gray-300 bg-white px-3 text-gray-950" />
        </label>
        <label className="text-sm font-semibold">Hasta
          <input type="date" value={to} onChange={e => setTo(e.target.value)} disabled={busy} className="mt-1 block min-h-11 rounded-lg border border-gray-300 bg-white px-3 text-gray-950" />
        </label>
        <label className="text-sm font-semibold">Propietaria
          <select value={owner} onChange={e => setOwner(e.target.value)} disabled={busy} className="mt-1 block min-h-11 rounded-lg border border-gray-300 bg-white px-3 text-gray-950">
            <option value="all">Todas</option><option value="Paola">Paola</option><option value="Victoria">Victoria</option>
          </select>
        </label>
        <button type="button" onClick={download} disabled={busy} className="min-h-11 rounded-lg bg-green-700 px-5 py-3 font-bold text-white hover:bg-green-800 disabled:opacity-50">
          {busy ? 'Descargando…' : '↓ Descargar pagos y clientes en Excel'}
        </button>
      </div>
      <p role="status" className="mt-2 text-sm text-gray-700">{message}</p>
    </section>
  )
}
