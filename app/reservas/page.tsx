'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { utils, writeFileXLSX } from 'xlsx'
import { BrandLogo } from '@/app/components/brand-logo'
import { LogoutButton } from '@/app/components/logout-button'
import { AdminMobileNav } from '@/app/components/admin-mobile-nav'

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
}

type GuestList = {
  reservation_id: number
  guests: Array<{
    full_name: string
    dni: string
    age: number
  }>
  vehicle_plates: string[]
  submitted_at: string
  updated_at: string
}

type ReservationPeriod = 'upcoming' | 'history'

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
        created_at
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
    deadline.setUTCDate(deadline.getUTCDate() - 7)
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
      filteredReservations.length === 0
    ) {
      alert(
        'No hay reservas para exportar con los filtros seleccionados.'
      )

      return
    }

    const rows =
      filteredReservations.map(
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
      `Paola_Propiedades_Reservas_${today}.xlsx`,
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

            <button
              onClick={downloadExcel}
              disabled={
                filteredReservations.length ===
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
              US$ {formatMoney(
                summary.totalValue
              )}
            </p>

          </div>


          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">

            <p className="text-sm font-semibold text-gray-600">
              Pagado
            </p>

            <p className="mt-2 text-2xl font-bold text-green-700">
              US$ {formatMoney(
                summary.totalPaid
              )}
            </p>

          </div>


          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">

            <p className="text-sm font-semibold text-gray-600">
              Por cobrar
            </p>

            <p className="mt-2 text-2xl font-bold text-red-700">
              US$ {formatMoney(
                summary.remaining
              )}
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
            <div className="divide-y divide-gray-200 md:hidden">

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
                      className="space-y-4 p-5"
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
                            US$ {formatMoney(total)}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-gray-500">
                            Pagado
                          </dt>
                          <dd className="mt-1 font-bold text-green-700">
                            US$ {formatMoney(paid)}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-gray-500">
                            Pendiente
                          </dt>
                          <dd className="mt-1 font-bold text-gray-950">
                            {isCancelled
                              ? '—'
                              : `US$ ${formatMoney(
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
                              onClick={() =>
                                downloadGuestList(
                                  reservation,
                                  guestList
                                )
                              }
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

            <div className="hidden w-full md:block">

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
                          className="border-t border-gray-200 hover:bg-gray-50"
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
                            US${' '}
                            {formatMoney(
                              total
                            )}
                          </td>


                          <td className="p-2 text-right font-bold text-green-700">
                            US${' '}
                            {formatMoney(
                              paid
                            )}
                          </td>


                          <td className="p-2 text-right font-bold text-gray-950">
                            {isCancelled
                              ? '—'
                              : `US$ ${formatMoney(
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
                                  onClick={() =>
                                    downloadGuestList(
                                      reservation,
                                      guestList
                                    )
                                  }
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

    </main>
  )
}
