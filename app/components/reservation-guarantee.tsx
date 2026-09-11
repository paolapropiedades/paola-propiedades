'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'

export function ReservationGuarantee({
  reservationId,
  currency,
}: {
  reservationId: number
  currency: 'USD' | 'PEN'
}) {
  const [amount, setAmount] = useState('')
  const [received, setReceived] = useState(false)
  const [receivedOn, setReceivedOn] = useState('')
  const [returnedOn, setReturnedOn] = useState('')
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const { data, error } = await supabase
          .from('reservations')
          .select('guarantee_amount, guarantee_received_on, guarantee_returned_on')
          .eq('id', reservationId)
          .single()
        if (!active) return
        if (error) throw error
        setAmount(String(data.guarantee_amount ?? 0))
        setReceived(Boolean(data.guarantee_received_on))
        setReceivedOn(data.guarantee_received_on ?? '')
        setReturnedOn(data.guarantee_returned_on ?? '')
        setAvailable(true)
      } catch {
        if (active) setMessage('No se pudo cargar la garantía. Vuelve a abrir la reserva para intentarlo nuevamente.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [reservationId])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !available) return
    setMessage('')
    const value = Number(amount)
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || !Number.isFinite(value) || value < 0 || value > 9999999999.99) {
      setMessage('Ingresa un monto válido, con un máximo de dos decimales.')
      return
    }
    if (received && (value <= 0 || !receivedOn)) {
      setMessage('Para registrar la recepción, ingresa un monto mayor a cero y la fecha.')
      return
    }
    if (returnedOn && (!received || !receivedOn || returnedOn < receivedOn)) {
      setMessage('La devolución requiere una recepción y no puede ser anterior a ella.')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase
        .from('reservations')
        .update({
          guarantee_amount: value,
          guarantee_returned_on: returnedOn || null,
          guarantee_received_on: received ? receivedOn : null,
        })
        .eq('id', reservationId)
        .neq('reservation_status', 'cancelled')
        .select('id')
        .single()
      if (error) throw error
      setMessage('✓ Garantía guardada correctamente.')
    } catch {
      setMessage('No se pudo guardar la garantía. Intenta nuevamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-7 border-t border-gray-200 pt-6">
      <h3 className="text-lg font-bold text-gray-950">Depósito de garantía</h3>
      <p className="mt-1 text-sm text-gray-600">
        Se registra por separado y no reduce el saldo del alquiler. Usa 0 si no corresponde garantía.
      </p>
      {loading ? <p className="mt-3 text-sm text-gray-600">Cargando garantía...</p> : (
        <form onSubmit={save} className="mt-4 rounded-xl border border-gray-300 p-4">
          <fieldset disabled={!available || saving} className="space-y-4 disabled:opacity-50">
            <div>
              <label htmlFor="guarantee-amount" className="text-sm font-semibold text-gray-800">
                Monto de garantía ({currency === 'PEN' ? 'S/' : 'US$'})
              </label>
              <input id="guarantee-amount" type="number" min="0" max="9999999999.99" step="0.01" required
                value={amount} onChange={(event) => { setAmount(event.target.value); setMessage('') }}
                className="mt-2 w-full rounded-lg border border-gray-300 p-3 text-gray-950" />
            </div>
            <label className="flex items-center gap-3 text-sm font-semibold text-gray-800">
              <input type="checkbox" checked={received}
                onChange={(event) => { setReceived(event.target.checked); setMessage('') }}
                className="h-4 w-4" />
              Garantía recibida en su totalidad
            </label>
            {received && (
              <div>
                <label htmlFor="guarantee-received-on" className="text-sm font-semibold text-gray-800">Fecha de recepción</label>
                <input id="guarantee-received-on" type="date" required value={receivedOn}
                  onChange={(event) => { setReceivedOn(event.target.value); setMessage('') }}
                  className="mt-2 w-full rounded-lg border border-gray-300 p-3 text-gray-950" />
              </div>
            )}
            {received && <div>
              <label htmlFor="guarantee-returned-on" className="text-sm font-semibold text-gray-800">Fecha de devolución total (opcional)</label>
              <input id="guarantee-returned-on" type="date" min={receivedOn || undefined} value={returnedOn} onChange={(event) => { setReturnedOn(event.target.value); setMessage('') }} className="mt-2 w-full rounded-lg border border-gray-300 p-3 text-gray-950" />
              <p className="mt-1 text-sm text-gray-600">Déjala vacía mientras la garantía esté pendiente de devolución.</p>
            </div>}
            <p className="text-sm font-semibold text-gray-700">Estado: {returnedOn ? 'Devuelta' : received ? 'Recibida' : 'Pendiente de entrega'}</p>
            <button type="submit" className="w-full rounded-lg bg-gray-950 px-5 py-3 font-bold text-white hover:bg-gray-800">
              {saving ? 'Guardando...' : 'Guardar garantía'}
            </button>
          </fieldset>
          {message && <p role="status" className={`mt-3 text-sm font-semibold ${message.startsWith('✓') ? 'text-green-700' : 'text-red-700'}`}>{message}</p>}
        </form>
      )}
    </section>
  )
}
