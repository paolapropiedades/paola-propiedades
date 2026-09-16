'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { utils, writeFileXLSX } from 'xlsx'
import { BrandLogo } from '@/app/components/brand-logo'
import { LogoutButton } from '@/app/components/logout-button'
import { AdminMobileNav } from '@/app/components/admin-mobile-nav'
import { AdminDialog } from '@/app/components/admin-dialog'
import { ReservationGuarantee } from '@/app/components/reservation-guarantee'

type Property = {
  id: number
  number: number
  name: string
}

type Reservation = {
  id: number
  reservation_number: string
  property_id: number
  check_in: string
  check_out: string
  nights: number
  price_per_night: number
  total_price: number
  amount_paid: number
  reservation_status: string
  payment_status: string
  tenant_full_name: string | null
  tenant_dni: string | null
  tenant_address: string | null
  tenant_phone: string | null
  tenant_email: string | null
  created_at: string
  currency: 'USD' | 'PEN'
  payment_schedule: Array<{
    due_date: string
    amount: number
  }>
  guarantee_amount: number
  guarantee_received_on: string | null
  guarantee_returned_on: string | null
}

type GuestList = {
  reservation_id: number
  guests: Array<{
    full_name: string
    dni: string
    age: number
  }>
  vehicle_plates: string[]
  pets: Array<{ name: string; size: string }>
  submitted_at: string
  updated_at: string
}

type Payment = {
  id: number
  reservation_id: number
  amount: number
  payment_date: string
  created_at: string
  currency: 'USD' | 'PEN'
}

type ReservationPeriod = 'upcoming' | 'history'
type OwnerFilter = 'all' | 'Paola' | 'Victoria'

const PROPERTY_OWNERS: Record<string, Exclude<OwnerFilter, 'all'>> = {
  'Casa 4': 'Paola',
  'Dpto 101': 'Paola',
  'Dpto 201': 'Paola',
  'Dpto 301': 'Paola',
  'Casa 2': 'Victoria',
  'Casa 3': 'Victoria',
  'Casa 5': 'Victoria',
  'Casa 6': 'Victoria',
  'Dpto 105': 'Victoria',
  'Dpto 106': 'Victoria',
  'Dpto 202': 'Victoria',
  'Dpto 306': 'Victoria',
}

function getTodayInLima() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  return `${year}-${month}-${day}`
}

export default function ReservationsPage() {
  const [properties, setProperties] = useState<Property[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [guestLists, setGuestLists] = useState<GuestList[]>([])

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const [propertyFilter, setPropertyFilter] = useState('all')
  const [reservationStatusFilter, setReservationStatusFilter] =
    useState('all')
  const [paymentStatusFilter, setPaymentStatusFilter] =
    useState('all')
  const [reservationPeriod, setReservationPeriod] =
    useState<ReservationPeriod>('upcoming')

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [search, setSearch] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [exportOwner, setExportOwner] = useState<OwnerFilter>('all')
  const [selectedReservation, setSelectedReservation] =
    useState<Reservation | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [registeringPayment, setRegisteringPayment] = useState(false)
  const [paymentMessage, setPaymentMessage] = useState('')
  const [cancelling, setCancelling] = useState(false)

  const loadData = useCallback(async () => {
    const {
      data: propertiesData,
      error: propertiesError,
    } = await supabase
      .from('properties')
      .select('id, number, name')
      .order('number')

    if (propertiesError) {
      console.error(propertiesError)

      setErrorMessage(
        'No se pudieron cargar las propiedades.'
      )
    }

    const {
      data: reservationsData,
      error: reservationsError,
    } = await supabase
      .from('reservations')
      .select(`
        id,
        reservation_number,
        property_id,
        check_in,
        check_out,
        nights,
        price_per_night,
        total_price,
        amount_paid,
        reservation_status,
        payment_status,
        tenant_full_name,
        tenant_dni,
        tenant_address,
        tenant_phone,
        tenant_email,
        created_at,
        currency,
        payment_schedule,
        guarantee_amount,
        guarantee_received_on,
        guarantee_returned_on
      `)
      .order('check_in', {
        ascending: false,
      })

    if (reservationsError) {
      console.error(reservationsError)

      setErrorMessage(
        'No se pudieron cargar las reservas.'
      )
    }

    const {
      data: guestListsData,
      error: guestListsError,
    } = await supabase
      .from('reservation_guest_lists')
      .select(`
        reservation_id,
        guests,
        vehicle_plates,
        pets,
        submitted_at,
        updated_at
      `)

    if (guestListsError) {
      console.error(guestListsError)

      setErrorMessage(
        'No se pudieron cargar las listas de huéspedes.'
      )
    }

    setProperties(propertiesData ?? [])
    setReservations(reservationsData ?? [])
    setGuestLists((guestListsData ?? []) as GuestList[])

    setLoading(false)
  }, [])

  useEffect(() => {
    // Initial data synchronization with Supabase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
  }, [loadData])

  async function openReservation(reservation: Reservation) {
    setSelectedReservation(reservation)
    setPayments([])
    setPaymentAmount('')
    setPaymentMessage('')
    setPaymentDate(new Date().toISOString().split('T')[0])

    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('reservation_id', reservation.id)
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Payments error:', error)
      return
    }

    setPayments((data ?? []) as Payment[])
  }

  function closeReservation() {
    setSelectedReservation(null)
    setPayments([])
    setPaymentMessage('')
  }

  async function registerPayment() {
    if (!selectedReservation) return

    setPaymentMessage('')
    const amount = Number(paymentAmount)
    const total = Number(selectedReservation.total_price)
    const alreadyPaid = Number(selectedReservation.amount_paid || 0)
    const remaining = Math.max(0, total - alreadyPaid)

    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentMessage(`Ingresa un monto mayor a ${currencyLabel(selectedReservation.currency)} 0.`)
      return
    }
    if (!paymentDate) {
      setPaymentMessage('Selecciona la fecha del pago.')
      return
    }
    if (amount > remaining) {
      setPaymentMessage(`El monto supera el saldo pendiente de ${currencyLabel(selectedReservation.currency)} ${formatMoney(remaining)}.`)
      return
    }

    setRegisteringPayment(true)
    const { data: paymentId, error } = await supabase.rpc(
      'register_payment_in_currency',
      {
        p_reservation_id: selectedReservation.id,
        p_amount: amount,
        p_payment_date: paymentDate,
        p_currency: selectedReservation.currency,
      }
    )

    if (error) {
      console.error(error)
      setPaymentMessage(`No se pudo registrar el pago: ${error.message}`)
      setRegisteringPayment(false)
      return
    }

    const updatedReservation = {
      ...selectedReservation,
      amount_paid: alreadyPaid + amount,
      payment_status: alreadyPaid + amount >= total ? 'paid' : 'partial',
    }
    setSelectedReservation(updatedReservation)
    setReservations((current) => current.map((reservation) =>
      reservation.id === updatedReservation.id ? updatedReservation : reservation
    ))
    setPaymentAmount('')
    setPaymentMessage('✓ Pago registrado correctamente.')

    try {
      const { error: emailError } = await supabase.functions.invoke(
        'send-victoria-payment-notification',
        { body: { payment_id: Number(paymentId) } }
      )
      if (emailError) console.error('No se pudo enviar el aviso de pago:', emailError)
    } catch (emailError) {
      console.error('No se pudo enviar el aviso de pago:', emailError)
    }

    await openReservation(updatedReservation)
    await loadData()
    setPaymentMessage('✓ Pago registrado correctamente.')
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
      alert(`No se pudo cancelar la reserva: ${error.message}`)
      setCancelling(false)
      return
    }

    closeReservation()
    await loadData()
    setCancelling(false)
  }

  const getPropertyName = useCallback((propertyId: number) => {
    return (
      properties.find(
        (property) =>
          property.id === propertyId
      )?.name ?? `Casa ${propertyId}`
    )
  }, [properties])

  function formatMoney(value: number | null | undefined) {
    return Number(value || 0).toLocaleString(
      'en-US',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    )
  }

  function currencyLabel(currency: 'USD' | 'PEN') {
    return currency === 'PEN' ? 'S/' : 'US$'
  }

  function formatDate(date: string) {
    if (!date) return '—'

    return new Intl.DateTimeFormat(
      'es-PE',
      {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC',
      }
    ).format(
      new Date(`${date}T00:00:00Z`)
    )
  }

  function getGuestListDeadline(checkIn: string) {
    const deadline = new Date(`${checkIn}T00:00:00Z`)
    deadline.setUTCDate(deadline.getUTCDate() - 1)
    return deadline.toISOString().split('T')[0]
  }

  function getPaymentStatus(
    reservation: Reservation
  ) {
    const total =
      Number(reservation.total_price || 0)

    const paid =
      Number(reservation.amount_paid || 0)

    if (total > 0 && paid >= total) {
      return 'paid'
    }

    if (paid > 0) {
      return 'partial'
    }

    return 'unpaid'
  }

  function paymentStatusText(
    reservation: Reservation
  ) {
    const status =
      getPaymentStatus(reservation)

    if (status === 'paid') {
      return 'Pagada'
    }

    if (status === 'partial') {
      return 'Pago parcial'
    }

    return 'No pagada'
  }

  function reservationStatusText(
    status: string
  ) {
    if (status === 'confirmed') {
      return 'Confirmada'
    }

    if (status === 'pending') {
      return 'Pendiente'
    }

    if (status === 'cancelled') {
      return 'Cancelada'
    }

    if (status === 'blocked') {
      return 'Bloqueada'
    }

    return status
  }

  const filteredReservations = useMemo(() => {
    const today = getTodayInLima()

    return reservations.filter(
      (reservation) => {
        const isPast = reservation.check_out < today

        if (
          (reservationPeriod === 'upcoming' && isPast) ||
          (reservationPeriod === 'history' && !isPast)
        ) {
          return false
        }

        /*
         * CASA
         */

        if (
          propertyFilter !== 'all' &&
          reservation.property_id !==
            Number(propertyFilter)
        ) {
          return false
        }

        /*
         * ESTADO RESERVA
         */

        if (reservationStatusFilter === 'cancelled') {
          if (reservation.reservation_status !== 'cancelled') {
            return false
          }
        } else {
          if (reservation.reservation_status === 'cancelled') {
            return false
          }

          if (
            reservationStatusFilter !== 'all' &&
            reservation.reservation_status !==
              reservationStatusFilter
          ) {
            return false
          }
        }

        /*
         * ESTADO PAGO
         */

        if (
          paymentStatusFilter !== 'all' &&
          getPaymentStatus(reservation) !==
            paymentStatusFilter
        ) {
          return false
        }

        /*
         * FECHA DESDE
         */

        if (
          dateFrom &&
          reservation.check_out < dateFrom
        ) {
          return false
        }

        /*
         * FECHA HASTA
         */

        if (
          dateTo &&
          reservation.check_in > dateTo
        ) {
          return false
        }

        /*
         * BUSCADOR
         */

        if (search.trim()) {
          const searchText =
            search
              .trim()
              .toLowerCase()

          const haystack = [
            reservation.reservation_number,
            reservation.tenant_full_name,
            reservation.tenant_dni,
            reservation.tenant_phone,
            reservation.tenant_email,
            getPropertyName(
              reservation.property_id
            ),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()

          if (
            !haystack.includes(searchText)
          ) {
            return false
          }
        }

        return true
      }
    )
  }, [
    reservations,
    getPropertyName,
    reservationPeriod,
    propertyFilter,
    reservationStatusFilter,
    paymentStatusFilter,
    dateFrom,
    dateTo,
    search,
  ])

  const summary = useMemo(() => {
    const activeReservations =
      filteredReservations.filter(
        (reservation) =>
          reservation.reservation_status !==
          'cancelled'
      )

    const totalValue =
      activeReservations.reduce(
        (sum, reservation) =>
          sum +
          Number(
            reservation.total_price || 0
          ),
        0
      )

    const totalPaid =
      activeReservations.reduce(
        (sum, reservation) =>
          sum +
          Number(
            reservation.amount_paid || 0
          ),
        0
      )

    const remaining =
      activeReservations.reduce(
        (sum, reservation) => {
          const total = Number(
            reservation.total_price || 0
          )
          const paid = Number(
            reservation.amount_paid || 0
          )

          return sum + Math.max(total - paid, 0)
        },
        0
      )

    return {
      count: activeReservations.length,
      totalValue,
      totalPaid,
      remaining,
    }
  }, [filteredReservations])

  const exportReservations = useMemo(
    () =>
      filteredReservations.filter((reservation) => {
        if (exportOwner === 'all') return true

        const propertyName = getPropertyName(reservation.property_id)
        return PROPERTY_OWNERS[propertyName] === exportOwner
      }),
    [filteredReservations, exportOwner, getPropertyName]
  )

  const summaryByCurrency = useMemo(() => {
    const initial = {
      USD: { total: 0, paid: 0, remaining: 0 },
      PEN: { total: 0, paid: 0, remaining: 0 },
    }

    return filteredReservations
      .filter((reservation) => reservation.reservation_status !== 'cancelled')
      .reduce((totals, reservation) => {
        const currency = reservation.currency ?? 'USD'
        const total = Number(reservation.total_price || 0)
        const paid = Number(reservation.amount_paid || 0)
        totals[currency].total += total
        totals[currency].paid += paid
        totals[currency].remaining += Math.max(total - paid, 0)
        return totals
      }, initial)
  }, [filteredReservations])

  const alerts = useMemo(() => {
    const today = getTodayInLima()
    const nextWeek = new Date(`${today}T00:00:00Z`)
    nextWeek.setUTCDate(nextWeek.getUTCDate() + 7)
    const nextWeekDate = nextWeek.toISOString().split('T')[0]
    const active = reservations.filter(
      (reservation) => reservation.reservation_status !== 'cancelled'
    )

    return {
      pendingConfirmation: active.filter(
        (reservation) => reservation.reservation_status === 'pending'
      ).length,
      pendingPayment: active.filter(
        (reservation) =>
          Number(reservation.amount_paid || 0) <
          Number(reservation.total_price || 0)
      ).length,
      upcomingCheckIns: active.filter(
        (reservation) =>
          reservation.check_in >= today &&
          reservation.check_in <= nextWeekDate
      ).length,
      missingGuestLists: active.filter(
        (reservation) =>
          reservation.reservation_status === 'confirmed' &&
          getGuestListDeadline(reservation.check_in) <= today &&
          !guestLists.some(
            (list) => list.reservation_id === reservation.id
          )
      ).length,
    }
  }, [reservations, guestLists])

  function clearFilters() {
    setReservationPeriod('upcoming')
    setPropertyFilter('all')
    setReservationStatusFilter('all')
    setPaymentStatusFilter('all')
    setDateFrom('')
    setDateTo('')
    setSearch('')
  }

  function downloadExcel() {
    if (
      exportReservations.length === 0
    ) {
      alert(
        'No hay reservas para exportar con los filtros seleccionados.'
      )

      return
    }

    const rows =
      exportReservations.map(
        (reservation) => {
          const total =
            Number(
              reservation.total_price || 0
            )

          const paid =
            Number(
              reservation.amount_paid || 0
            )

          const remaining =
            reservation.reservation_status ===
            'cancelled'
              ? 'Cancelada'
              : Math.max(0, total - paid)

          return {
            'N° Reserva':
              reservation.reservation_number,

            Casa:
              getPropertyName(
                reservation.property_id
              ),

            Propietaria:
              PROPERTY_OWNERS[
                getPropertyName(reservation.property_id)
              ] ?? '',

            'Check-in':
              formatDate(
                reservation.check_in
              ),

            'Check-out':
              formatDate(
                reservation.check_out
              ),

            Noches:
              reservation.nights,

            'Nombre completo':
              reservation.tenant_full_name ??
              '',

            DNI:
              reservation.tenant_dni ??
              '',

            Dirección:
              reservation.tenant_address ??
              '',

            Celular:
              reservation.tenant_phone ??
              '',

            Correo:
              reservation.tenant_email ??
              '',

            'Precio por noche':
              Number(
                reservation.price_per_night ||
                  0
              ),

            'Total reserva':
              total,

            Moneda: reservation.currency,

            Pagado:
              paid,

            'Saldo pendiente':
              remaining,

            'Estado de pago':
              paymentStatusText(
                reservation
              ),

            'Estado de reserva':
              reservationStatusText(
                reservation.reservation_status
              ),
          }
        }
      )

    const worksheet =
      utils.json_to_sheet(rows)

    /*
     * ANCHOS DE COLUMNAS
     */

    worksheet['!cols'] = [
      { wch: 16 },
      { wch: 14 },
      { wch: 14 },
      { wch: 13 },
      { wch: 13 },
      { wch: 10 },
      { wch: 28 },
      { wch: 15 },
      { wch: 35 },
      { wch: 18 },
      { wch: 30 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 20 },
      { wch: 20 },
    ]

    const workbook =
      utils.book_new()

    utils.book_append_sheet(
      workbook,
      worksheet,
      'Reservas'
    )

    const today =
      new Date()
        .toISOString()
        .split('T')[0]

    writeFileXLSX(
      workbook,
      `Paola_Propiedades_Reservas_${exportOwner}_${today}.xlsx`,
      {
        compression: true,
      }
    )
  }

  function downloadGuestList(
    reservation: Reservation,
    guestList: GuestList
  ) {
    const propertyName = getPropertyName(reservation.property_id)
    const rows: Array<Array<string | number>> = [
      ['Nombre', 'DNI', 'Edad', 'Propiedad', 'Check-in', 'Check-out'],
      ...guestList.guests.map((guest) => [
        guest.full_name,
        guest.dni,
        guest.age,
        propertyName,
        formatDate(reservation.check_in),
        formatDate(reservation.check_out),
      ]),
      [],
      ['Vehículos'],
      ['Vehículo', 'Placa'],
      ...(guestList.vehicle_plates.length > 0
        ? guestList.vehicle_plates.map((plate, index) => [
            index + 1,
            plate,
          ])
        : [['—', 'Sin vehículos registrados']]),
      [],
      ['Mascotas'],
      ['Mascota', 'Nombre', 'Tamaño'],
      ...(guestList.pets.length > 0
        ? guestList.pets.map((pet, index) => [index + 1, pet.name, pet.size])
        : [['—', 'Sin mascotas registradas', '—']]),
    ]

    const workbook = utils.book_new()
    const worksheet = utils.aoa_to_sheet(rows)

    worksheet['!cols'] = [
      { wch: 32 },
      { wch: 18 },
      { wch: 8 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
    ]

    utils.book_append_sheet(workbook, worksheet, 'Lista')

    writeFileXLSX(
      workbook,
      `Lista_${reservation.reservation_number}_${propertyName.replaceAll(' ', '_')}.xlsx`,
      { compression: true }
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-24 md:pb-0">

      <div className="mx-auto max-w-[1600px] p-4 sm:p-8">

        {/* HEADER */}

        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">

          <div>

            <Link
              href="/"
              className="text-sm font-bold text-gray-600 hover:text-gray-950"
            >
              ← Volver al calendario
            </Link>

            <BrandLogo
              className="mt-3 h-auto w-64 max-w-full"
              priority
            />

            <h1 className="mt-4 text-3xl font-bold text-gray-950">
              Reservas
            </h1>

            <p className="mt-1 font-medium text-gray-700">
              Gestión y reportes
            </p>

          </div>


          <div className="flex flex-wrap gap-3">
            <LogoutButton />

            <label className="min-w-44 text-sm font-semibold text-gray-700">
              Propietaria para Excel
              <select
                value={exportOwner}
                onChange={(event) =>
                  setExportOwner(event.target.value as OwnerFilter)
                }
                className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-gray-950"
              >
                <option value="all">Todas</option>
                <option value="Paola">Solo Paola</option>
                <option value="Victoria">Solo Victoria</option>
              </select>
            </label>

            <button
              onClick={downloadExcel}
              disabled={
                exportReservations.length ===
                0
              }
              className="rounded-lg bg-green-700 px-5 py-3 font-bold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ↓ Descargar Excel
            </button>
          </div>

        </div>


        {/* RESUMEN */}

        <AdminMobileNav current="reservations" />

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">

            <p className="text-sm font-semibold text-gray-600">
              Reservas
            </p>

            <p className="mt-2 text-2xl font-bold text-gray-950">
              {summary.count}
            </p>

          </div>


          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">

            <p className="text-sm font-semibold text-gray-600">
              Valor total
            </p>

            <p className="mt-2 text-2xl font-bold text-gray-950">
              US$ {formatMoney(summaryByCurrency.USD.total)}
              <span className="mt-1 block text-lg">S/ {formatMoney(summaryByCurrency.PEN.total)}</span>
            </p>

          </div>


          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">

            <p className="text-sm font-semibold text-gray-600">
              Pagado
            </p>

            <p className="mt-2 text-2xl font-bold text-green-700">
              US$ {formatMoney(summaryByCurrency.USD.paid)}
              <span className="mt-1 block text-lg">S/ {formatMoney(summaryByCurrency.PEN.paid)}</span>
            </p>

          </div>


          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">

            <p className="text-sm font-semibold text-gray-600">
              Por cobrar
            </p>

            <p className="mt-2 text-2xl font-bold text-red-700">
              US$ {formatMoney(summaryByCurrency.USD.remaining)}
              <span className="mt-1 block text-lg">S/ {formatMoney(summaryByCurrency.PEN.remaining)}</span>
            </p>

          </div>

        </div>

        <section aria-labelledby="alerts-title" className="mt-8">
          <h2 id="alerts-title" className="text-lg font-bold text-gray-950">
            Atención requerida
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['Sin confirmar', alerts.pendingConfirmation, 'bg-amber-50 text-amber-900'],
              ['Pagos pendientes', alerts.pendingPayment, 'bg-red-50 text-red-900'],
              ['Ingresos en 7 días', alerts.upcomingCheckIns, 'bg-blue-50 text-blue-900'],
              ['Listas vencidas', alerts.missingGuestLists, 'bg-orange-50 text-orange-900'],
            ].map(([label, count, color]) => (
              <div key={String(label)} className={`rounded-xl border border-gray-200 p-4 ${color}`}>
                <p className="text-2xl font-bold">{count}</p>
                <p className="mt-1 text-sm font-semibold">{label}</p>
              </div>
            ))}
          </div>
        </section>


        {/* FILTROS */}

        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">

          <div className="flex flex-wrap items-center justify-between gap-4">

            <h2 className="text-lg font-bold text-gray-950">
              Filtros
            </h2>

            <button
              type="button"
              onClick={() => setFiltersOpen((current) => !current)}
              aria-expanded={filtersOpen}
              aria-controls="reservation-filters"
              className="min-h-11 rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-800 md:hidden"
            >
              {filtersOpen ? 'Ocultar filtros' : 'Mostrar filtros'}
              {' · '}
              {[
                propertyFilter !== 'all',
                reservationStatusFilter !== 'all',
                paymentStatusFilter !== 'all',
                Boolean(dateFrom),
                Boolean(dateTo),
                Boolean(search.trim()),
              ].filter(Boolean).length}{' '}
              activos
            </button>

            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-lg border border-gray-300 bg-gray-100 p-1">
                <button
                  type="button"
                  onClick={() => setReservationPeriod('upcoming')}
                  aria-pressed={reservationPeriod === 'upcoming'}
                  className={`rounded-md px-4 py-2 text-sm font-bold transition-colors ${
                    reservationPeriod === 'upcoming'
                      ? 'bg-gray-950 text-white shadow-sm'
                      : 'text-gray-700 hover:bg-white'
                  }`}
                >
                  Próximas
                </button>

                <button
                  type="button"
                  onClick={() => setReservationPeriod('history')}
                  aria-pressed={reservationPeriod === 'history'}
                  className={`rounded-md px-4 py-2 text-sm font-bold transition-colors ${
                    reservationPeriod === 'history'
                      ? 'bg-gray-950 text-white shadow-sm'
                      : 'text-gray-700 hover:bg-white'
                  }`}
                >
                  Historial
                </button>
              </div>

              <button
                onClick={clearFilters}
                className="text-sm font-bold text-gray-600 hover:text-gray-950"
              >
                Limpiar filtros
              </button>
            </div>

          </div>


          <div
            id="reservation-filters"
            className={`${filtersOpen ? 'grid' : 'hidden'} mt-5 gap-4 md:grid md:grid-cols-2 xl:grid-cols-3`}
          >

            {/* BUSCADOR */}

            <div>

              <label className="text-sm font-semibold text-gray-800">
                Buscar
              </label>

              <input
                type="text"
                value={search}
                onChange={(e) =>
                  setSearch(
                    e.target.value
                  )
                }
                placeholder="Nombre, DNI, celular, correo..."
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-950 placeholder:text-gray-500"
              />

            </div>


            {/* CASA */}

            <div>

              <label className="text-sm font-semibold text-gray-800">
                Casa
              </label>

              <select
                value={propertyFilter}
                onChange={(e) =>
                  setPropertyFilter(
                    e.target.value
                  )
                }
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-950"
              >

                <option value="all">
                  Todas las casas
                </option>

                {properties.map(
                  (property) => (

                    <option
                      key={property.id}
                      value={property.id}
                    >
                      {property.name}
                    </option>

                  )
                )}

              </select>

            </div>


            {/* ESTADO RESERVA */}

            <div>

              <label className="text-sm font-semibold text-gray-800">
                Estado de reserva
              </label>

              <select
                value={
                  reservationStatusFilter
                }
                onChange={(e) =>
                  setReservationStatusFilter(
                    e.target.value
                  )
                }
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-950"
              >

                <option value="all">
                  Todos
                </option>

                <option value="confirmed">
                  Confirmadas
                </option>

                <option value="pending">
                  Pendientes
                </option>

                <option value="cancelled">
                  Canceladas
                </option>

              </select>

            </div>


            {/* ESTADO PAGO */}

            <div>

              <label className="text-sm font-semibold text-gray-800">
                Estado de pago
              </label>

              <select
                value={
                  paymentStatusFilter
                }
                onChange={(e) =>
                  setPaymentStatusFilter(
                    e.target.value
                  )
                }
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-950"
              >

                <option value="all">
                  Todos
                </option>

                <option value="unpaid">
                  No pagadas
                </option>

                <option value="partial">
                  Pago parcial
                </option>

                <option value="paid">
                  Pagadas
                </option>

              </select>

            </div>


            {/* DESDE */}

            <div>

              <label className="text-sm font-semibold text-gray-800">
                Desde
              </label>

              <input
                type="date"
                value={dateFrom}
                onChange={(e) =>
                  setDateFrom(
                    e.target.value
                  )
                }
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-950"
              />

            </div>


            {/* HASTA */}

            <div>

              <label className="text-sm font-semibold text-gray-800">
                Hasta
              </label>

              <input
                type="date"
                value={dateTo}
                onChange={(e) =>
                  setDateTo(
                    e.target.value
                  )
                }
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-950"
              />

            </div>

          </div>

        </div>


        {/* TABLA */}

        <div className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">

          <div className="flex items-center justify-between border-b border-gray-200 p-5">

            <div>

              <h2 className="font-bold text-gray-950">
                Resultados
              </h2>

              <p className="mt-1 text-sm font-medium text-gray-600">
                {filteredReservations.length}{' '}
                reserva
                {filteredReservations.length !==
                1
                  ? 's'
                  : ''}
              </p>

            </div>

          </div>


          {loading ? (

            <div className="p-10 text-center font-medium text-gray-600">
              Cargando reservas...
            </div>

          ) : errorMessage ? (

            <div className="p-10 text-center font-medium text-red-700">
              {errorMessage}
            </div>

          ) : filteredReservations.length ===
            0 ? (

            <div className="p-10 text-center">

              <p className="font-bold text-gray-950">
                No encontramos reservas
              </p>

              <p className="mt-1 text-sm text-gray-600">
                Prueba cambiando los filtros.
              </p>

            </div>

          ) : (

            <>
            <div className="divide-y divide-gray-200 xl:hidden">

              {filteredReservations.map(
                (reservation) => {
                  const total = Number(
                    reservation.total_price || 0
                  )
                  const paid = Number(
                    reservation.amount_paid || 0
                  )
                  const remaining = Math.max(
                    0,
                    total - paid
                  )
                  const isCancelled =
                    reservation.reservation_status ===
                    'cancelled'
                  const paymentStatus =
                    getPaymentStatus(reservation)
                  const guestList = guestLists.find(
                    (list) =>
                      list.reservation_id ===
                      reservation.id
                  )
                  const guestListDeadline =
                    getGuestListDeadline(
                      reservation.check_in
                    )

                  return (
                    <article
                      key={reservation.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Ver detalle de la reserva de ${reservation.tenant_full_name ?? getPropertyName(reservation.property_id)}`}
                      onClick={() => openReservation(reservation)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          void openReservation(reservation)
                        }
                      }}
                      className="cursor-pointer space-y-4 p-5 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gray-950"
                    >
                      <div>
                        <p className="text-lg font-bold text-gray-950">
                          {getPropertyName(
                            reservation.property_id
                          )}
                        </p>
                        <p className="mt-1 font-semibold text-gray-900">
                          {reservation.tenant_full_name ??
                            'Pendiente de confirmar'}
                        </p>
                        {reservation.tenant_email && (
                          <p className="mt-1 break-all text-sm text-gray-600">
                            {reservation.tenant_email}
                          </p>
                        )}
                      </div>

                      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                        <div>
                          <dt className="font-medium text-gray-500">
                            Check-in
                          </dt>
                          <dd className="mt-1 font-semibold text-gray-900">
                            {formatDate(
                              reservation.check_in
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-gray-500">
                            Check-out
                          </dt>
                          <dd className="mt-1 font-semibold text-gray-900">
                            {formatDate(
                              reservation.check_out
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-gray-500">
                            Total
                          </dt>
                          <dd className="mt-1 font-bold text-gray-950">
                            {currencyLabel(reservation.currency)} {formatMoney(total)}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-gray-500">
                            Pagado
                          </dt>
                          <dd className="mt-1 font-bold text-green-700">
                            {currencyLabel(reservation.currency)} {formatMoney(paid)}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-gray-500">
                            Pendiente
                          </dt>
                          <dd className="mt-1 font-bold text-gray-950">
                            {isCancelled
                              ? '—'
                              : `${currencyLabel(reservation.currency)} ${formatMoney(
                                  remaining
                                )}`}
                          </dd>
                        </div>
                      </dl>

                      <div className="flex flex-wrap gap-2">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                            paymentStatus === 'paid'
                              ? 'bg-green-100 text-green-800'
                              : paymentStatus ===
                                  'partial'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {paymentStatusText(reservation)}
                        </span>
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                            reservation.reservation_status ===
                            'confirmed'
                              ? 'bg-green-100 text-green-800'
                              : reservation.reservation_status ===
                                  'pending'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-gray-200 text-gray-800'
                          }`}
                        >
                          {reservationStatusText(
                            reservation.reservation_status
                          )}
                        </span>
                      </div>

                      <Link
                        href="/"
                        onClick={(event) => event.stopPropagation()}
                        className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-800 hover:bg-gray-50"
                      >
                        Ver en calendario
                      </Link>

                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Lista de huéspedes
                        </p>
                        {guestList ? (
                          <div className="mt-2 flex items-center justify-between gap-3">
                            <p className="text-sm font-bold text-green-700">
                              Recibida ({guestList.guests.length})
                            </p>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                downloadGuestList(reservation, guestList)
                              }}
                              className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-800 hover:bg-gray-100"
                            >
                              ↓ Descargar
                            </button>
                          </div>
                        ) : (
                          <div className="mt-2">
                            <p className="text-sm font-bold text-amber-700">
                              Pendiente
                            </p>
                            <p className="mt-1 text-sm text-gray-600">
                              Límite:{' '}
                              {formatDate(
                                guestListDeadline
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                    </article>
                  )
                }
              )}

            </div>

            <div className="hidden w-full xl:block">

              <table className="w-full table-fixed border-collapse text-xs xl:text-sm">

                <colgroup>
                  <col className="w-[9%]" />
                  <col className="w-[16%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  <col className="w-[9%]" />
                  <col className="w-[9%]" />
                  <col className="w-[9%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                  <col className="w-[12%]" />
                </colgroup>

                <thead className="bg-gray-100">

                  <tr className="text-left text-[10px] font-bold uppercase tracking-wide text-gray-700 xl:text-xs">

                    <th className="p-2">
                      Casa
                    </th>

                    <th className="p-2">
                      Inquilino
                    </th>

                    <th className="p-2">
                      Check-in
                    </th>

                    <th className="p-2">
                      Check-out
                    </th>

                    <th className="p-2 text-right">
                      Total
                    </th>

                    <th className="p-2 text-right">
                      Pagado
                    </th>

                    <th className="p-2 text-right">
                      Pendiente
                    </th>

                    <th className="p-2">
                      Pago
                    </th>

                    <th className="p-2">
                      Reserva
                    </th>

                    <th className="p-2">
                      Lista de huéspedes
                    </th>

                  </tr>

                </thead>


                <tbody>

                  {filteredReservations.map(
                    (reservation) => {
                      const total =
                        Number(
                          reservation.total_price ||
                            0
                        )

                      const paid =
                        Number(
                          reservation.amount_paid ||
                            0
                        )

                      const remaining =
                        Math.max(
                          0,
                          total - paid
                        )

                      const isCancelled =
                        reservation.reservation_status ===
                        'cancelled'

                      const paymentStatus =
                        getPaymentStatus(
                          reservation
                        )

                      const guestList =
                        guestLists.find(
                          (list) =>
                            list.reservation_id ===
                            reservation.id
                        )

                      const guestListDeadline =
                        getGuestListDeadline(
                          reservation.check_in
                        )

                      return (

                        <tr
                          key={reservation.id}
                          tabIndex={0}
                          onClick={() => openReservation(reservation)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              void openReservation(reservation)
                            }
                          }}
                          className="cursor-pointer border-t border-gray-200 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gray-950"
                        >

                          <td className="break-words p-2 font-bold text-gray-950">
                            {getPropertyName(
                              reservation.property_id
                            )}
                          </td>


                          <td className="min-w-0 break-words p-2">

                            <p className="font-semibold text-gray-950">
                              {reservation.tenant_full_name ??
                                'Pendiente de confirmar'}
                            </p>

                            {reservation.tenant_email && (

                              <p className="mt-1 break-all text-[10px] text-gray-600 xl:text-xs">
                                {
                                  reservation.tenant_email
                                }
                              </p>

                            )}

                          </td>


                          <td className="p-2 font-medium text-gray-800">
                            {formatDate(
                              reservation.check_in
                            )}
                          </td>


                          <td className="p-2 font-medium text-gray-800">
                            {formatDate(
                              reservation.check_out
                            )}
                          </td>


                          <td className="p-2 text-right font-bold text-gray-950">
                            {currencyLabel(reservation.currency)}{' '}
                            {formatMoney(
                              total
                            )}
                          </td>


                          <td className="p-2 text-right font-bold text-green-700">
                            {currencyLabel(reservation.currency)}{' '}
                            {formatMoney(
                              paid
                            )}
                          </td>


                          <td className="p-2 text-right font-bold text-gray-950">
                            {isCancelled
                              ? '—'
                              : `${currencyLabel(reservation.currency)} ${formatMoney(
                                  remaining
                                )}`}
                          </td>


                          <td className="break-words p-2">

                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                                paymentStatus ===
                                'paid'
                                  ? 'bg-green-100 text-green-800'
                                  : paymentStatus ===
                                      'partial'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {paymentStatusText(
                                reservation
                              )}
                            </span>

                          </td>


                          <td className="break-words p-2">

                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                                reservation.reservation_status ===
                                'confirmed'
                                  ? 'bg-green-100 text-green-800'
                                  : reservation.reservation_status ===
                                      'pending'
                                    ? 'bg-amber-100 text-amber-800'
                                    : reservation.reservation_status ===
                                        'cancelled'
                                      ? 'bg-gray-200 text-gray-800'
                                      : 'bg-gray-200 text-gray-800'
                              }`}
                            >
                              {reservationStatusText(
                                reservation.reservation_status
                              )}
                            </span>

                          </td>


                          <td className="break-words p-2">

                            {guestList ? (

                              <div>
                                <p className="text-xs font-bold text-green-700">
                                  Recibida ({guestList.guests.length})
                                </p>

                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    downloadGuestList(reservation, guestList)
                                  }}
                                  className="mt-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold text-gray-800 hover:bg-gray-100"
                                >
                                  ↓ Descargar
                                </button>
                              </div>

                            ) : (

                              <div>
                                <p className="text-xs font-bold text-amber-700">
                                  Pendiente
                                </p>

                                <p className="mt-1 text-xs text-gray-600">
                                  Límite: {formatDate(
                                    guestListDeadline
                                  )}
                                </p>
                              </div>

                            )}

                          </td>

                        </tr>

                      )
                    }
                  )}

                </tbody>

              </table>

            </div>
            </>

          )}

        </div>

      </div>

      {selectedReservation && (() => {
        const total = Number(selectedReservation.total_price || 0)
        const paid = Number(selectedReservation.amount_paid || 0)
        const remaining = Math.max(0, total - paid)
        const guestList = guestLists.find(
          (list) => list.reservation_id === selectedReservation.id
        )
        const schedule = Array.isArray(selectedReservation.payment_schedule)
          ? selectedReservation.payment_schedule
          : []

        return (
          <AdminDialog
            label="Detalle de reserva"
            onClose={closeReservation}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-600">Detalle de reserva</p>
                <h2 className="mt-1 break-words text-2xl font-bold text-gray-950">
                  {selectedReservation.tenant_full_name ?? 'Reserva pendiente'}
                </h2>
                <p className="mt-1 font-semibold text-gray-700">
                  {getPropertyName(selectedReservation.property_id)}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {selectedReservation.reservation_number}
                </p>
              </div>
              <button
                type="button"
                onClick={closeReservation}
                aria-label="Cerrar detalle"
                className="min-h-11 min-w-11 shrink-0 text-2xl text-gray-500 hover:text-gray-950"
              >
                ×
              </button>
            </div>

            <div className="mt-6 rounded-xl bg-gray-100 p-4">
              <div className="flex justify-between gap-4">
                <span className="text-gray-700">Check-in</span>
                <strong className="text-right text-gray-950">{formatDate(selectedReservation.check_in)}</strong>
              </div>
              <div className="mt-2 flex justify-between gap-4">
                <span className="text-gray-700">Check-out</span>
                <strong className="text-right text-gray-950">{formatDate(selectedReservation.check_out)}</strong>
              </div>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs font-bold uppercase text-gray-500">DNI</dt>
                <dd className="mt-1 break-words font-semibold text-gray-950">{selectedReservation.tenant_dni || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase text-gray-500">Celular</dt>
                <dd className="mt-1 break-words font-semibold text-gray-950">{selectedReservation.tenant_phone || '—'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs font-bold uppercase text-gray-500">Correo</dt>
                <dd className="mt-1 break-all font-semibold text-gray-950">{selectedReservation.tenant_email || '—'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs font-bold uppercase text-gray-500">Dirección</dt>
                <dd className="mt-1 break-words font-semibold text-gray-950">{selectedReservation.tenant_address || '—'}</dd>
              </div>
            </dl>

            <section className="mt-7 border-t border-gray-200 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-bold text-gray-950">Estado y pagos</h3>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-bold text-gray-800">
                  {reservationStatusText(selectedReservation.reservation_status)}
                </span>
              </div>
              <div className="mt-3 rounded-xl bg-gray-100 p-4">
                <div className="flex justify-between"><span>Total</span><strong>{currencyLabel(selectedReservation.currency)} {formatMoney(total)}</strong></div>
                <div className="mt-2 flex justify-between"><span>Pagado</span><strong className="text-green-700">{currencyLabel(selectedReservation.currency)} {formatMoney(paid)}</strong></div>
                <div className="mt-2 flex justify-between border-t border-gray-300 pt-2"><span>Pendiente</span><strong>{currencyLabel(selectedReservation.currency)} {formatMoney(remaining)}</strong></div>
              </div>
            </section>

            <section className="mt-7 border-t border-gray-200 pt-6">
              <h3 className="text-lg font-bold text-gray-950">Cronograma acordado</h3>
              {schedule.length > 0 ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">
                  {schedule.map((installment, index) => (
                    <div key={`${installment.due_date}-${index}`} className="flex items-center justify-between gap-4 border-b border-gray-200 p-3 last:border-b-0">
                      <span className="text-sm font-medium text-gray-700">Cuota {index + 1} · {formatDate(installment.due_date)}</span>
                      <strong className="shrink-0 text-gray-950">{currencyLabel(selectedReservation.currency)} {formatMoney(installment.amount)}</strong>
                    </div>
                  ))}
                </div>
              ) : <p className="mt-2 text-sm text-gray-600">No se registró un cronograma de cuotas.</p>}
            </section>

            <ReservationGuarantee
              key={selectedReservation.id}
              reservationId={selectedReservation.id}
              currency={selectedReservation.currency}
            />

            <section className="mt-7 border-t border-gray-200 pt-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-gray-950">Pagos</h3>
                <span className={`rounded-full px-3 py-1 text-sm font-bold ${
                  remaining === 0 && total > 0
                    ? 'bg-green-100 text-green-800'
                    : paid > 0
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-red-100 text-red-800'
                }`}>
                  {paymentStatusText(selectedReservation)}
                </span>
              </div>

              {remaining > 0 ? (
                <div className="mt-5 rounded-xl border border-gray-300 p-4">
                  <h4 className="font-bold text-gray-950">Registrar nuevo pago</h4>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="reservation-payment-amount" className="text-sm font-semibold text-gray-800">
                        Monto ({currencyLabel(selectedReservation.currency)})
                      </label>
                      <input
                        id="reservation-payment-amount"
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]+([.][0-9]{1,2})?"
                        value={paymentAmount}
                        onChange={(event) => setPaymentAmount(event.target.value)}
                        placeholder="500.00"
                        className="mt-2 w-full rounded-lg border border-gray-300 p-3 text-gray-950"
                      />
                    </div>
                    <div>
                      <label htmlFor="reservation-payment-date" className="text-sm font-semibold text-gray-800">Fecha</label>
                      <input
                        id="reservation-payment-date"
                        type="date"
                        value={paymentDate}
                        onChange={(event) => setPaymentDate(event.target.value)}
                        className="mt-2 w-full rounded-lg border border-gray-300 p-3 text-gray-950"
                      />
                    </div>
                  </div>
                  {paymentMessage && (
                    <p role="status" className={`mt-3 text-sm font-semibold ${paymentMessage.startsWith('✓') ? 'text-green-700' : 'text-red-700'}`}>
                      {paymentMessage}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={registerPayment}
                    disabled={registeringPayment}
                    className="mt-4 w-full rounded-lg bg-gray-950 px-5 py-3 font-bold text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {registeringPayment ? 'Registrando...' : 'Registrar pago'}
                  </button>
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4 text-center font-bold text-green-800">
                  ✓ Reserva pagada en su totalidad
                </div>
              )}

              <div className="mt-6">
                <h4 className="font-bold text-gray-950">Historial de pagos</h4>
                {payments.length === 0 ? (
                  <p className="mt-3 text-sm font-medium text-gray-600">Todavía no hay pagos registrados.</p>
                ) : (
                  <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">
                    {payments.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between gap-4 border-b border-gray-200 p-3 last:border-b-0">
                        <span className="text-sm font-medium text-gray-700">{formatDate(payment.payment_date)}</span>
                        <strong className="text-gray-950">{currencyLabel(payment.currency)} {formatMoney(payment.amount)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="mt-7 border-t border-gray-200 pt-6">
              <h3 className="text-lg font-bold text-gray-950">Lista de huéspedes</h3>
              {guestList ? (
                <div className="mt-3 space-y-4">
                  <div>
                    <p className="text-sm font-bold text-green-700">Recibida · {guestList.guests.length} huésped{guestList.guests.length === 1 ? '' : 'es'}</p>
                    <ul className="mt-2 divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200">
                      {guestList.guests.map((guest, index) => (
                        <li key={`${guest.dni}-${index}`} className="p-3 text-sm">
                          <strong className="block text-gray-950">{guest.full_name}</strong>
                          <span className="text-gray-600">DNI {guest.dni} · {guest.age} años</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-sm text-gray-700"><strong>Vehículos:</strong> {guestList.vehicle_plates.length > 0 ? guestList.vehicle_plates.join(', ') : 'Ninguno'}</p>
                  <p className="text-sm text-gray-700"><strong>Mascotas:</strong> {guestList.pets.length > 0 ? guestList.pets.map((pet) => `${pet.name} (${pet.size})`).join(', ') : 'Ninguna'}</p>
                </div>
              ) : (
                <p className="mt-2 text-sm font-semibold text-amber-700">Pendiente · límite {formatDate(getGuestListDeadline(selectedReservation.check_in))}</p>
              )}
            </section>

            <div className="mt-7 border-t border-gray-200 pt-6">
              {selectedReservation.reservation_status !== 'cancelled' && (
                <button
                  type="button"
                  onClick={cancelReservation}
                  disabled={cancelling}
                  className="w-full rounded-lg bg-red-600 px-5 py-3 font-bold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {cancelling ? 'Cancelando...' : 'Cancelar reserva'}
                </button>
              )}
            <button type="button" onClick={closeReservation} className={`${selectedReservation.reservation_status !== 'cancelled' ? 'mt-3' : ''} w-full rounded-lg border border-gray-300 px-5 py-3 font-semibold text-gray-900 hover:bg-gray-100`}>
              Cerrar
            </button>
            </div>
          </AdminDialog>
        )
      })()}

    </main>
  )
}
