'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { LogoutButton } from '@/app/components/logout-button'

type Property = {
  id: number
  number: number
  name: string
  active: boolean
}

type Reservation = {
  id: number
  property_id: number
  check_in: string
  check_out: string
  reservation_status: string
  confirmation_token: string
  tenant_full_name: string | null
  tenant_phone: string | null
  tenant_email: string | null
  tenant_dni: string | null
  tenant_address: string | null
  total_price: number
  amount_paid: number
  payment_status: string
}

type Payment = {
  id: number
  reservation_id: number
  amount: number
  payment_date: string
  created_at: string
}

export default function Home() {
  const [properties, setProperties] = useState<Property[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [payments, setPayments] = useState<Payment[]>([])

  const [currentDate, setCurrentDate] = useState(new Date())
  const [showModal, setShowModal] = useState(false)

  const [propertyId, setPropertyId] = useState('')
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [totalPriceInput, setTotalPriceInput] = useState('')

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [createdReservationLink, setCreatedReservationLink] =
    useState('')

  const [selectedReservation, setSelectedReservation] =
    useState<Reservation | null>(null)

  const [cancelling, setCancelling] = useState(false)

  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split('T')[0]
  )

  const [registeringPayment, setRegisteringPayment] =
    useState(false)

  const [paymentMessage, setPaymentMessage] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: propertiesData, error: propertiesError } =
      await supabase
        .from('properties')
        .select('*')
        .order('number')

    if (propertiesError) {
      console.error('Properties error:', propertiesError)
    }

    const { data: reservationsData, error: reservationsError } =
      await supabase
        .from('reservations')
        .select(`
          id,
          property_id,
          check_in,
          check_out,
          reservation_status,
          confirmation_token,
          tenant_full_name,
          tenant_phone,
          tenant_email,
          tenant_dni,
          tenant_address,
          total_price,
          amount_paid,
          payment_status
        `)
        .neq('reservation_status', 'cancelled')

    if (reservationsError) {
      console.error('Reservations error:', reservationsError)
    }

    setProperties(propertiesData ?? [])
    setReservations(reservationsData ?? [])
  }

  async function loadPayments(reservationId: number) {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('reservation_id', reservationId)
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Payments error:', error)
      return
    }

    setPayments(data ?? [])
  }

  async function openReservation(reservation: Reservation) {
    setSelectedReservation(reservation)
    setPaymentAmount('')
    setPaymentMessage('')
    setPaymentDate(new Date().toISOString().split('T')[0])

    await loadPayments(reservation.id)
  }

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const days = Array.from(
    { length: daysInMonth },
    (_, i) => i + 1
  )

  const monthName = new Intl.DateTimeFormat('es-PE', {
    month: 'long',
    year: 'numeric',
  }).format(currentDate)

  const nights =
    checkIn && checkOut
      ? Math.max(
          0,
          Math.round(
            (new Date(checkOut).getTime() -
              new Date(checkIn).getTime()) /
              86400000
          )
        )
      : 0

  const totalPrice = Number(totalPriceInput) || 0

  function previousMonth() {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  function getReservation(
    selectedPropertyId: number,
    day: number
  ) {
    const date = new Date(year, month, day)

    return reservations.find((reservation) => {
      if (reservation.property_id !== selectedPropertyId) {
        return false
      }

      const start = new Date(
        reservation.check_in + 'T00:00:00'
      )

      const end = new Date(
        reservation.check_out + 'T00:00:00'
      )

      return date >= start && date < end
    })
  }

  function getReservationColor(status?: string) {
    if (status === 'pending') {
      return 'bg-amber-300 hover:bg-amber-400'
    }

    if (status === 'confirmed') {
      return 'bg-green-500 hover:bg-green-600'
    }

    if (status === 'blocked') {
      return 'bg-gray-500 hover:bg-gray-600'
    }

    return 'bg-white hover:bg-gray-100'
  }

  function isReservationStart(
    reservation: Reservation,
    day: number
  ) {
    const start = new Date(
      reservation.check_in + 'T00:00:00'
    )

    return (
      start.getFullYear() === year &&
      start.getMonth() === month &&
      start.getDate() === day
    )
  }

  function getTooltip(reservation?: Reservation) {
    if (!reservation) {
      return 'Disponible'
    }

    if (reservation.reservation_status === 'confirmed') {
      return `${
        reservation.tenant_full_name ?? 'Reserva confirmada'
      } | ${reservation.check_in} → ${reservation.check_out}`
    }

    if (reservation.reservation_status === 'pending') {
      return `Reserva pendiente | ${reservation.check_in} → ${reservation.check_out}`
    }

    return 'Fecha bloqueada'
  }

  function formatDate(date: string) {
    return new Intl.DateTimeFormat('es-PE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`))
  }

  function formatMoney(value: number) {
    return Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  function getPropertyName(reservation: Reservation) {
    return (
      properties.find(
        (property) => property.id === reservation.property_id
      )?.name ?? 'Propiedad'
    )
  }

  function getPaymentStatus(reservation: Reservation) {
    const total = Number(reservation.total_price)
    const paid = Number(reservation.amount_paid || 0)

    if (paid >= total && total > 0) {
      return 'Pagada'
    }

    if (paid > 0) {
      return 'Pago parcial'
    }

    return 'No pagada'
  }

  async function createReservation() {
    setMessage('')
    setCreatedReservationLink('')

    if (
      !propertyId ||
      !checkIn ||
      !checkOut ||
      !totalPriceInput
    ) {
      setMessage('Completa todos los campos.')
      return
    }

    if (nights <= 0) {
      setMessage(
        'El check-out debe ser posterior al check-in.'
      )
      return
    }

    if (totalPrice <= 0) {
      setMessage(
        'El monto total debe ser mayor a US$ 0.'
      )
      return
    }

    setSaving(true)

    const reservationNumber =
      'PP-' + Date.now().toString().slice(-8)

    const confirmationToken = crypto.randomUUID()

    const { error } = await supabase
      .from('reservations')
      .insert({
        reservation_number: reservationNumber,
        property_id: Number(propertyId),
        check_in: checkIn,
        check_out: checkOut,
        nights,

        // Ya no usamos precio por noche.
        price_per_night: null,

        // Este es el monto final ingresado por el admin.
        total_price: totalPrice,

        amount_paid: 0,
        reservation_status: 'pending',
        payment_status: 'unpaid',
        confirmation_token: confirmationToken,
      })

    if (error) {
      console.error(error)

      if (error.code === '23P01') {
        setMessage(
          'Estas fechas ya están ocupadas para esta casa.'
        )
      } else {
        setMessage(
          'Error al crear la reserva: ' + error.message
        )
      }

      setSaving(false)
      return
    }

    await loadData()

    const link =
      `${window.location.origin}` +
      `/reserva/${confirmationToken}`

    setCreatedReservationLink(link)
    setSaving(false)
  }

  async function copyReservationLink() {
    if (!createdReservationLink) return

    try {
      await navigator.clipboard.writeText(
        createdReservationLink
      )

      setMessage('✓ Link copiado al portapapeles')
    } catch {
      setMessage(
        'No se pudo copiar automáticamente.'
      )
    }
  }

  function closeModal() {
    setShowModal(false)
    setPropertyId('')
    setCheckIn('')
    setCheckOut('')
    setTotalPriceInput('')
    setMessage('')
    setCreatedReservationLink('')
  }

  async function registerPayment() {
    if (!selectedReservation) return

    setPaymentMessage('')

    const amount = Number(paymentAmount)
    const total = Number(selectedReservation.total_price)
    const alreadyPaid =
      Number(selectedReservation.amount_paid || 0)

    const remaining =
      Math.max(0, total - alreadyPaid)

    if (!amount || amount <= 0) {
      setPaymentMessage(
        'Ingresa un monto mayor a US$ 0.'
      )
      return
    }

    if (!paymentDate) {
      setPaymentMessage(
        'Selecciona la fecha del pago.'
      )
      return
    }

    if (amount > remaining) {
      setPaymentMessage(
        `El monto supera el saldo pendiente de US$ ${formatMoney(
          remaining
        )}.`
      )
      return
    }

    setRegisteringPayment(true)

    const { error } = await supabase.rpc(
      'register_payment',
      {
        p_reservation_id: selectedReservation.id,
        p_amount: amount,
        p_payment_date: paymentDate,
      }
    )

    if (error) {
      console.error(error)

      setPaymentMessage(
        'No se pudo registrar el pago: ' +
          error.message
      )

      setRegisteringPayment(false)
      return
    }

    const newPaid = alreadyPaid + amount

    const updatedReservation: Reservation = {
      ...selectedReservation,
      amount_paid: newPaid,
      payment_status:
        newPaid >= total ? 'paid' : 'partial',
    }

    setSelectedReservation(updatedReservation)

    setReservations((current) =>
      current.map((reservation) =>
        reservation.id === updatedReservation.id
          ? updatedReservation
          : reservation
      )
    )

    setPaymentAmount('')

    setPaymentMessage(
      '✓ Pago registrado correctamente.'
    )

    await loadPayments(selectedReservation.id)
    await loadData()

    setRegisteringPayment(false)
  }

  async function cancelReservation() {
    if (!selectedReservation) return

    const confirmed = window.confirm(
      '¿Seguro que deseas cancelar esta reserva? Las fechas volverán a quedar disponibles.'
    )

    if (!confirmed) return

    setCancelling(true)

    const { error } = await supabase
      .from('reservations')
      .update({
        reservation_status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', selectedReservation.id)

    if (error) {
      console.error(error)

      alert(
        'No se pudo cancelar la reserva: ' +
          error.message
      )

      setCancelling(false)
      return
    }

    setSelectedReservation(null)
    setPayments([])

    await loadData()

    setCancelling(false)
  }

  const selectedTotal =
    Number(selectedReservation?.total_price || 0)

  const selectedPaid =
    Number(selectedReservation?.amount_paid || 0)

  const selectedRemaining =
    Math.max(0, selectedTotal - selectedPaid)

  return (
    <main className="min-h-screen bg-gray-50">

      <div className="mx-auto max-w-[1600px] p-8">

        {/* HEADER */}

        <div className="flex items-center justify-between gap-4">

          <div>
            <h1 className="text-3xl font-bold text-gray-950">
              Paola Propiedades
            </h1>

            <p className="mt-1 font-medium text-gray-700">
              Administración de propiedades
            </p>
          </div>

          <div className="flex gap-3">

            <LogoutButton />

            <Link
              href="/reservas"
              className="rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-100"
            >
              Ver reservas
            </Link>

            <button
              onClick={() => {
                setMessage('')
                setCreatedReservationLink('')
                setShowModal(true)
              }}
              className="rounded-lg bg-gray-950 px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800"
            >
              + Nueva reserva
            </button>

          </div>

        </div>


        {/* CALENDARIO */}

        <div className="mt-10 overflow-hidden rounded-xl border border-gray-300 bg-white shadow-sm">

          <div className="flex items-center justify-between border-b border-gray-300 p-5">

            <div>
              <h2 className="text-lg font-bold text-gray-950">
                Disponibilidad
              </h2>

              <p className="mt-1 capitalize font-medium text-gray-700">
                {monthName}
              </p>
            </div>

            <div className="flex gap-2">

              <button
                onClick={previousMonth}
                className="rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-900 hover:bg-gray-100"
              >
                ←
              </button>

              <button
                onClick={() =>
                  setCurrentDate(new Date())
                }
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100"
              >
                Hoy
              </button>

              <button
                onClick={nextMonth}
                className="rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-900 hover:bg-gray-100"
              >
                →
              </button>

            </div>

          </div>


          <div className="overflow-x-auto">

            <div
              className="min-w-max"
              style={{
                display: 'grid',
                gridTemplateColumns:
                  `150px repeat(${daysInMonth}, 48px)`,
              }}
            >

              <div className="sticky left-0 z-20 border-b border-r border-gray-300 bg-gray-100 p-3 font-bold text-gray-950">
                Propiedad
              </div>

              {days.map((day) => {
                const date = new Date(year, month, day)

                const weekday =
                  new Intl.DateTimeFormat('es-PE', {
                    weekday: 'short',
                  }).format(date)

                return (
                  <div
                    key={day}
                    className="border-b border-r border-gray-300 bg-gray-100 py-2 text-center"
                  >
                    <div className="text-xs font-bold text-gray-800">
                      {weekday}
                    </div>

                    <div className="mt-0.5 font-medium text-gray-600">
                      {day}
                    </div>
                  </div>
                )
              })}

              {properties.map((property) => (

                <div
                  key={property.id}
                  style={{ display: 'contents' }}
                >

                  <div className="sticky left-0 z-10 flex items-center border-b border-r border-gray-300 bg-white px-4 font-semibold text-gray-950">
                    {property.name}
                  </div>

                  {days.map((day) => {
                    const reservation =
                      getReservation(property.id, day)

                    const showName =
                      reservation &&
                      reservation.reservation_status ===
                        'confirmed' &&
                      reservation.tenant_full_name &&
                      isReservationStart(
                        reservation,
                        day
                      )

                    return (
                      <div
                        key={`${property.id}-${day}`}
                        title={getTooltip(reservation)}
                        onClick={() => {
                          if (reservation) {
                            openReservation(reservation)
                          }
                        }}
                        className={`relative flex h-14 items-center border-b border-r border-gray-200 ${
                          reservation
                            ? 'cursor-pointer'
                            : ''
                        } ${getReservationColor(
                          reservation?.reservation_status
                        )}`}
                      >

                        {showName && (
                          <span className="absolute left-2 z-20 whitespace-nowrap rounded-md bg-green-800 px-2 py-1 text-xs font-bold text-white shadow">
                            {reservation.tenant_full_name}
                          </span>
                        )}

                      </div>
                    )
                  })}

                </div>

              ))}

            </div>

          </div>


          {/* LEYENDA */}

          <div className="flex flex-wrap gap-6 border-t border-gray-300 p-5 text-sm font-medium text-gray-800">

            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full border border-gray-400 bg-white" />
              Disponible
            </div>

            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-amber-300" />
              Pendiente
            </div>

            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-green-500" />
              Confirmada
            </div>

            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-gray-500" />
              Bloqueada
            </div>

          </div>

        </div>

      </div>


      {/* NUEVA RESERVA */}

      {showModal && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">

            <div className="flex items-center justify-between">

              <h2 className="text-xl font-bold text-gray-950">
                Nueva reserva
              </h2>

              <button
                onClick={closeModal}
                className="text-2xl text-gray-600 hover:text-gray-950"
              >
                ×
              </button>

            </div>


            {!createdReservationLink && (

              <div className="mt-6">

                <label className="text-sm font-semibold text-gray-900">
                  Propiedad
                </label>

                <select
                  value={propertyId}
                  onChange={(e) =>
                    setPropertyId(e.target.value)
                  }
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-950"
                >
                  <option value="">
                    Selecciona una casa
                  </option>

                  {properties.map((property) => (
                    <option
                      key={property.id}
                      value={property.id}
                    >
                      {property.name}
                    </option>
                  ))}
                </select>


                <div className="mt-5 grid grid-cols-2 gap-4">

                  <div>
                    <label className="text-sm font-semibold text-gray-900">
                      Check-in
                    </label>

                    <input
                      type="date"
                      value={checkIn}
                      onChange={(e) =>
                        setCheckIn(e.target.value)
                      }
                      className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-950"
                    />
                  </div>


                  <div>
                    <label className="text-sm font-semibold text-gray-900">
                      Check-out
                    </label>

                    <input
                      type="date"
                      value={checkOut}
                      onChange={(e) =>
                        setCheckOut(e.target.value)
                      }
                      className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-950"
                    />
                  </div>

                </div>


                {/* MONTO TOTAL */}

                <div className="mt-5">

                  <label className="text-sm font-semibold text-gray-900">
                    Monto total de la reserva (US$)
                  </label>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={totalPriceInput}
                    onChange={(e) =>
                      setTotalPriceInput(e.target.value)
                    }
                    placeholder="3500.00"
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-950 placeholder:text-gray-500"
                  />

                  <p className="mt-2 text-xs font-medium text-gray-500">
                    Ingresa directamente el precio final acordado.
                  </p>

                </div>


                {/* RESUMEN */}

                <div className="mt-6 rounded-xl bg-gray-100 p-4">

                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">
                      Noches
                    </span>

                    <strong className="text-gray-950">
                      {nights}
                    </strong>
                  </div>

                  <div className="mt-3 flex justify-between border-t border-gray-300 pt-3">
                    <span className="font-semibold text-gray-800">
                      Monto total
                    </span>

                    <strong className="text-lg text-gray-950">
                      US$ {formatMoney(totalPrice)}
                    </strong>
                  </div>

                </div>


                {message && (
                  <p className="mt-4 text-sm font-medium text-red-700">
                    {message}
                  </p>
                )}


                <button
                  onClick={createReservation}
                  disabled={saving}
                  className="mt-6 w-full rounded-lg bg-gray-950 px-5 py-3 font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {saving
                    ? 'Creando...'
                    : 'Crear reserva'}
                </button>

              </div>

            )}


            {/* RESERVA CREADA */}

            {createdReservationLink && (

              <div className="mt-6">

                <div className="rounded-xl border border-green-200 bg-green-50 p-5">

                  <h3 className="text-lg font-bold text-green-900">
                    ✓ Reserva creada
                  </h3>

                  <p className="mt-2 text-sm font-medium text-green-800">
                    Las fechas quedaron bloqueadas como pendientes.
                  </p>

                </div>

                <label className="mt-5 block text-sm font-semibold text-gray-900">
                  Link para el tenant
                </label>

                <input
                  readOnly
                  value={createdReservationLink}
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-gray-100 p-3 text-sm text-gray-900"
                />

                <button
                  onClick={copyReservationLink}
                  className="mt-4 w-full rounded-lg border border-gray-300 px-5 py-3 font-semibold text-gray-900 hover:bg-gray-100"
                >
                  Copiar link
                </button>

                {message && (
                  <p className="mt-3 text-center text-sm font-semibold text-green-800">
                    {message}
                  </p>
                )}

                <button
                  onClick={closeModal}
                  className="mt-4 w-full rounded-lg bg-gray-950 px-5 py-3 font-semibold text-white"
                >
                  Cerrar
                </button>

              </div>

            )}

          </div>

        </div>

      )}


      {/* DETALLE DE RESERVA */}

      {selectedReservation && (

        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">

          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">

            <div className="flex items-start justify-between">

              <div>

                <p className="text-sm font-semibold text-gray-600">
                  Detalle de reserva
                </p>

                <h2 className="mt-1 text-2xl font-bold text-gray-950">
                  {selectedReservation.tenant_full_name ??
                    'Reserva pendiente'}
                </h2>

                <p className="mt-1 font-semibold text-gray-700">
                  {getPropertyName(selectedReservation)}
                </p>

              </div>

              <button
                onClick={() => {
                  setSelectedReservation(null)
                  setPayments([])
                }}
                className="text-2xl text-gray-500 hover:text-gray-950"
              >
                ×
              </button>

            </div>


            {/* FECHAS */}

            <div className="mt-6 rounded-xl bg-gray-100 p-4">

              <div className="flex justify-between">
                <span className="text-gray-700">
                  Check-in
                </span>

                <strong className="text-gray-950">
                  {formatDate(
                    selectedReservation.check_in
                  )}
                </strong>
              </div>

              <div className="mt-2 flex justify-between">
                <span className="text-gray-700">
                  Check-out
                </span>

                <strong className="text-gray-950">
                  {formatDate(
                    selectedReservation.check_out
                  )}
                </strong>
              </div>

            </div>


            {/* TENANT */}

            {selectedReservation.tenant_full_name && (

              <div className="mt-6 grid grid-cols-2 gap-4">

                <div>
                  <p className="text-xs font-bold uppercase text-gray-500">
                    DNI
                  </p>

                  <p className="mt-1 font-semibold text-gray-950">
                    {selectedReservation.tenant_dni || '—'}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-gray-500">
                    Celular
                  </p>

                  <p className="mt-1 font-semibold text-gray-950">
                    {selectedReservation.tenant_phone || '—'}
                  </p>
                </div>

                <div className="col-span-2">
                  <p className="text-xs font-bold uppercase text-gray-500">
                    Correo
                  </p>

                  <p className="mt-1 font-semibold text-gray-950">
                    {selectedReservation.tenant_email || '—'}
                  </p>
                </div>

                <div className="col-span-2">
                  <p className="text-xs font-bold uppercase text-gray-500">
                    Dirección
                  </p>

                  <p className="mt-1 font-semibold text-gray-950">
                    {selectedReservation.tenant_address || '—'}
                  </p>
                </div>

              </div>

            )}


            {/* PAGOS */}

            <div className="mt-7 border-t border-gray-200 pt-6">

              <div className="flex items-center justify-between">

                <h3 className="text-lg font-bold text-gray-950">
                  Pagos
                </h3>

                <span
                  className={`rounded-full px-3 py-1 text-sm font-bold ${
                    selectedPaid >= selectedTotal &&
                    selectedTotal > 0
                      ? 'bg-green-100 text-green-800'
                      : selectedPaid > 0
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-red-100 text-red-800'
                  }`}
                >
                  {getPaymentStatus(selectedReservation)}
                </span>

              </div>


              <div className="mt-4 rounded-xl bg-gray-100 p-4">

                <div className="flex justify-between">
                  <span className="text-gray-700">
                    Total
                  </span>

                  <strong className="text-gray-950">
                    US$ {formatMoney(selectedTotal)}
                  </strong>
                </div>

                <div className="mt-2 flex justify-between">
                  <span className="text-gray-700">
                    Pagado
                  </span>

                  <strong className="text-green-700">
                    US$ {formatMoney(selectedPaid)}
                  </strong>
                </div>

                <div className="mt-2 flex justify-between border-t border-gray-300 pt-2">
                  <span className="font-semibold text-gray-800">
                    Pendiente
                  </span>

                  <strong className="text-gray-950">
                    US$ {formatMoney(selectedRemaining)}
                  </strong>
                </div>

              </div>


              {/* REGISTRAR PAGO */}

              {selectedRemaining > 0 && (

                <div className="mt-5 rounded-xl border border-gray-300 p-4">

                  <h4 className="font-bold text-gray-950">
                    Registrar nuevo pago
                  </h4>

                  <div className="mt-4 grid grid-cols-2 gap-3">

                    <div>

                      <label className="text-sm font-semibold text-gray-800">
                        Monto (US$)
                      </label>

                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        max={selectedRemaining}
                        value={paymentAmount}
                        onChange={(e) =>
                          setPaymentAmount(e.target.value)
                        }
                        placeholder="500.00"
                        className="mt-2 w-full rounded-lg border border-gray-300 p-3 text-gray-950"
                      />

                    </div>

                    <div>

                      <label className="text-sm font-semibold text-gray-800">
                        Fecha
                      </label>

                      <input
                        type="date"
                        value={paymentDate}
                        onChange={(e) =>
                          setPaymentDate(e.target.value)
                        }
                        className="mt-2 w-full rounded-lg border border-gray-300 p-3 text-gray-950"
                      />

                    </div>

                  </div>


                  {paymentMessage && (

                    <p
                      className={`mt-3 text-sm font-semibold ${
                        paymentMessage.startsWith('✓')
                          ? 'text-green-700'
                          : 'text-red-700'
                      }`}
                    >
                      {paymentMessage}
                    </p>

                  )}


                  <button
                    onClick={registerPayment}
                    disabled={registeringPayment}
                    className="mt-4 w-full rounded-lg bg-gray-950 px-5 py-3 font-bold text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {registeringPayment
                      ? 'Registrando...'
                      : 'Registrar pago'}
                  </button>

                </div>

              )}


              {selectedRemaining === 0 && (

                <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4 text-center font-bold text-green-800">
                  ✓ Reserva pagada en su totalidad
                </div>

              )}


              {/* HISTORIAL */}

              <div className="mt-6">

                <h4 className="font-bold text-gray-950">
                  Historial de pagos
                </h4>

                {payments.length === 0 ? (

                  <p className="mt-3 text-sm font-medium text-gray-600">
                    Todavía no hay pagos registrados.
                  </p>

                ) : (

                  <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">

                    {payments.map((payment) => (

                      <div
                        key={payment.id}
                        className="flex items-center justify-between border-b border-gray-200 p-3 last:border-b-0"
                      >
                        <span className="text-sm font-medium text-gray-700">
                          {formatDate(payment.payment_date)}
                        </span>

                        <strong className="text-gray-950">
                          US$ {formatMoney(payment.amount)}
                        </strong>
                      </div>

                    ))}

                  </div>

                )}

              </div>

            </div>


            {/* CANCELAR */}

            <div className="mt-7 border-t border-gray-200 pt-6">

              <button
                onClick={cancelReservation}
                disabled={cancelling}
                className="w-full rounded-lg bg-red-600 px-5 py-3 font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {cancelling
                  ? 'Cancelando...'
                  : 'Cancelar reserva'}
              </button>

              <button
                onClick={() => {
                  setSelectedReservation(null)
                  setPayments([])
                }}
                className="mt-3 w-full rounded-lg border border-gray-300 px-5 py-3 font-semibold text-gray-900 hover:bg-gray-100"
              >
                Cerrar
              </button>

            </div>

          </div>

        </div>

      )}

    </main>
  )
}
