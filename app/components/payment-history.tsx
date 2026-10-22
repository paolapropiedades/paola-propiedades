'use client'

import { useState } from 'react'
import { VoucherLink } from './payment-voucher'

export type PaymentRecord = {
  id: number
  reservation_id: number
  amount: number
  payment_date: string
  created_at: string
  currency: 'USD' | 'PEN'
  operation_number: string | null
  voucher_path?: string | null
}

type EditValues = {
  amount: number
  paymentDate: string
  operationNumber: string
}

export function PaymentHistory({
  payments,
  formatDate,
  formatMoney,
  currencyLabel,
  onEdit,
  onDelete,
}: {
  payments: PaymentRecord[]
  formatDate: (date: string) => string
  formatMoney: (amount: number) => string
  currencyLabel: (currency: 'USD' | 'PEN') => string
  onEdit: (payment: PaymentRecord, values: EditValues) => Promise<void>
  onDelete: (payment: PaymentRecord) => Promise<void>
}) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [operationNumber, setOperationNumber] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [message, setMessage] = useState('')

  function startEditing(payment: PaymentRecord) {
    setEditingId(payment.id)
    setAmount(String(payment.amount))
    setPaymentDate(payment.payment_date)
    setOperationNumber(payment.operation_number ?? '')
    setMessage('')
  }

  async function save(payment: PaymentRecord) {
    const numericAmount = Number(amount)
    const cleanOperationNumber = operationNumber.trim()
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setMessage('Ingresa un monto mayor a cero.')
      return
    }
    if (!paymentDate) {
      setMessage('Selecciona la fecha del pago.')
      return
    }
    if (!cleanOperationNumber || cleanOperationNumber.length > 100) {
      setMessage('Ingresa un número de operación de hasta 100 caracteres.')
      return
    }

    setBusyId(payment.id)
    setMessage('')
    try {
      await onEdit(payment, {
        amount: numericAmount,
        paymentDate,
        operationNumber: cleanOperationNumber,
      })
      setEditingId(null)
      setMessage('✓ Pago actualizado correctamente.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar el pago.')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(payment: PaymentRecord) {
    if (!window.confirm(`¿Eliminar el pago de ${currencyLabel(payment.currency)} ${formatMoney(payment.amount)}? El saldo de la reserva se recalculará.`)) return
    setBusyId(payment.id)
    setMessage('')
    try {
      await onDelete(payment)
      if (editingId === payment.id) setEditingId(null)
      setMessage('✓ Pago eliminado y saldo recalculado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo eliminar el pago.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mt-6">
      <h4 className="font-bold text-gray-950">Historial de pagos</h4>
      {message && (
        <p role="status" className={`mt-3 text-sm font-semibold ${message.startsWith('✓') ? 'text-green-700' : 'text-red-700'}`}>
          {message}
        </p>
      )}
      {payments.length === 0 ? (
        <p className="mt-3 text-sm font-medium text-gray-600">Todavía no hay pagos registrados.</p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">
          {payments.map((payment) => (
            <div key={payment.id} className="border-b border-gray-200 p-3 last:border-b-0">
              {editingId === payment.id ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor={`edit-payment-amount-${payment.id}`} className="text-xs font-bold uppercase text-gray-600">Monto</label>
                    <input id={`edit-payment-amount-${payment.id}`} type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-gray-950" />
                  </div>
                  <div>
                    <label htmlFor={`edit-payment-date-${payment.id}`} className="text-xs font-bold uppercase text-gray-600">Fecha</label>
                    <input id={`edit-payment-date-${payment.id}`} type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-gray-950" />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor={`edit-payment-operation-${payment.id}`} className="text-xs font-bold uppercase text-gray-600">Número de operación</label>
                    <input id={`edit-payment-operation-${payment.id}`} type="text" maxLength={100} value={operationNumber} onChange={(event) => setOperationNumber(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-gray-950" />
                  </div>
                  <div className="flex gap-2 sm:col-span-2">
                    <button type="button" disabled={busyId === payment.id} onClick={() => save(payment)} className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busyId === payment.id ? 'Guardando...' : 'Guardar cambios'}</button>
                    <button type="button" disabled={busyId === payment.id} onClick={() => { setEditingId(null); setMessage('') }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-800">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 text-sm font-medium text-gray-700">
                    <span className="block">{formatDate(payment.payment_date)}</span>
                    <span className="mt-1 block break-all text-xs text-gray-500">Operación: {payment.operation_number || 'Sin número registrado'}</span>
                    {payment.voucher_path && <VoucherLink path={payment.voucher_path} />}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <strong className="mr-1 text-gray-950">{currencyLabel(payment.currency)} {formatMoney(payment.amount)}</strong>
                    <button type="button" disabled={busyId !== null} onClick={() => startEditing(payment)} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold text-gray-800 hover:bg-gray-100 disabled:opacity-50">Editar</button>
                    <button type="button" disabled={busyId !== null} onClick={() => remove(payment)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">Eliminar</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
