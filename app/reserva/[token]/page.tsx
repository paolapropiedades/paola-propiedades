'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { BrandLogo } from '@/app/components/brand-logo'
import { GuestListForm } from './guest-list-form'

type Reservation = {
  reservation_number: string
  check_in: string
  check_out: string
  nights: number
  total_price: number
  reservation_status: string
  property_name: string
  currency: 'USD' | 'PEN'
  payment_schedule: Array<{ due_date: string; amount: number }>
  guarantee_amount?: number
  guarantee_received_on?: string | null
  guarantee_returned_on?: string | null
}

const PAOLA_PROPERTIES = new Set([
  'Casa 4',
  'Dpto 101',
  'Dpto 201',
  'Dpto 301',
])

const VICTORIA_PROPERTIES = new Set([
  'Casa 2',
  'Casa 3',
  'Casa 5',
  'Casa 6',
  'Dpto 105',
  'Dpto 106',
  'Dpto 202',
  'Dpto 306',
])

const PAYMENT_ACCOUNTS = {
  Paola: {
    accountHolder: 'Paola Cornejo',
    USD: {
      accountNumber: '19393706874105',
      interbankNumber: '00219319370687410519',
    },
    PEN: {
      accountNumber: '19394883469085',
      interbankNumber: '00219319488346908510',
    },
  },
  Victoria: {
    accountHolder: 'Victoria Yrigoyen',
    USD: {
      accountNumber: '19494705364181',
      interbankNumber: '00219419470536418198',
    },
    PEN: {
      accountNumber: '19494705335052',
      interbankNumber: '00219419470533505297',
    },
  },
} as const

function getPaymentAccount(reservation: Reservation) {
  const owner = PAOLA_PROPERTIES.has(reservation.property_name)
    ? 'Paola'
    : VICTORIA_PROPERTIES.has(reservation.property_name)
      ? 'Victoria'
      : null

  if (!owner) return null

  return {
    accountHolder: PAYMENT_ACCOUNTS[owner].accountHolder,
    currencyName: reservation.currency === 'PEN' ? 'Soles' : 'Dólares',
    ...PAYMENT_ACCOUNTS[owner][reservation.currency],
  }
}

export default function ReservationPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = use(params)

  const [reservation, setReservation] =
    useState<Reservation | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [errorMessage, setErrorMessage] =
    useState('')

  const [success, setSuccess] =
    useState(false)

  const [fullName, setFullName] =
    useState('')

  const [dni, setDni] =
    useState('')

  const [address, setAddress] =
    useState('')

  const [phone, setPhone] =
    useState('')

  const [email, setEmail] =
    useState('')

  const [accepted, setAccepted] =
    useState(false)

  const [copyMessage, setCopyMessage] = useState('')
  const [copyingAccount, setCopyingAccount] = useState(false)

  async function copyPaymentAccount(value: string, label: string) {
    setCopyMessage('')
    setCopyingAccount(true)
    try {
      await navigator.clipboard.writeText(value)
      setCopyMessage(`✓ ${label} copiado al portapapeles.`)
    } catch {
      setCopyMessage('No se pudo copiar. Mantén presionado o selecciona el número para copiarlo manualmente.')
    } finally {
      setCopyingAccount(false)
    }
  }

  const paymentAccount = reservation
    ? getPaymentAccount(reservation)
    : null


  useEffect(() => {

    async function loadReservation() {

      const { data, error } =
        await supabase
          .rpc(
            'get_reservation_for_confirmation',
            {
              p_confirmation_token: token,
            }
          )
          .maybeSingle()

      const reservationData =
        data as Reservation | null

      if (error || !reservationData) {

        console.error(error)

        setErrorMessage(
          'No encontramos esta reserva o el link no es válido.'
        )

      } else {

        setReservation(
          reservationData
        )

        if (
          reservationData.reservation_status ===
          'confirmed'
        ) {
          setSuccess(true)
        }

      }

      setLoading(false)
    }

    loadReservation()

  }, [token])


  function formatDate(date: string) {

    return new Intl.DateTimeFormat(
      'es-PE',
      {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }
    ).format(
      new Date(
        `${date}T00:00:00Z`
      )
    )

  }


  async function confirmReservation() {

    setErrorMessage('')

    if (
      !fullName.trim() ||
      !dni.trim() ||
      !address.trim() ||
      !phone.trim() ||
      !email.trim()
    ) {

      setErrorMessage(
        'Por favor completa todos los campos.'
      )

      return
    }


    if (
      !email.includes('@') ||
      !email.includes('.')
    ) {

      setErrorMessage(
        'Ingresa un correo electrónico válido.'
      )

      return
    }


    if (!accepted) {

      setErrorMessage(
        'Debes leer y aceptar los Términos y Condiciones de Arrendamiento para confirmar la reserva.'
      )

      return
    }


    setSaving(true)


    const { data, error } =
      await supabase
        .rpc(
          'confirm_reservation_by_token',
          {
            p_confirmation_token: token,
            p_tenant_full_name:
              fullName.trim(),
            p_tenant_address:
              address.trim(),
            p_tenant_dni: dni.trim(),
            p_tenant_phone: phone.trim(),
            p_tenant_email: email.trim(),
            p_terms_accepted: accepted,
          }
        )


    if (error || data !== true) {

      console.error(error)

      setErrorMessage(
        'No pudimos confirmar la reserva. Intenta nuevamente.'
      )

      setSaving(false)

      return
    }


    setReservation(
      reservation
        ? {
            ...reservation,
            reservation_status:
              'confirmed',
          }
        : null
    )

    setSuccess(true)
    setSaving(false)

    try {
      const { error: emailError } =
        await supabase.functions.invoke(
          'send-reservation-confirmation',
          {
            body: {
              confirmation_token: token,
            },
          }
        )

      if (emailError) {
        console.error(
          'La reserva fue confirmada, pero no se pudo enviar el email:',
          emailError
        )
      }
    } catch (emailError) {
      console.error(
        'La reserva fue confirmada, pero no se pudo enviar el email:',
        emailError
      )
    }

  }


  if (loading) {

    return (

      <main className="flex min-h-screen items-center justify-center bg-gray-100 p-6">

        <p className="font-medium text-gray-700">
          Cargando reserva...
        </p>

      </main>

    )

  }


  if (
    errorMessage &&
    !reservation
  ) {

    return (

      <main className="flex min-h-screen items-center justify-center bg-gray-100 p-6">

        <div className="w-full max-w-md rounded-2xl border border-gray-300 bg-white p-8 text-center shadow-sm">

          <BrandLogo className="mx-auto h-auto w-72 max-w-full" />

          <p className="mt-5 font-medium text-red-700">
            {errorMessage}
          </p>

        </div>

      </main>

    )

  }


  if (!reservation) {
    return null
  }


  const money = (amount: number) => `${reservation.currency === 'PEN' ? 'S/' : 'US$'} ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <main className="min-h-screen bg-[#f3f8fa] px-3 py-5 text-slate-900 sm:px-6 sm:py-6 lg:py-8">
      <article className="mx-auto max-w-4xl rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
        <header className="px-5 pt-6 pb-3 sm:px-8">
          <BrandLogo className="mx-auto h-auto w-56 max-w-full sm:w-60" priority />
        </header>
        <div className="px-5 pt-3 pb-6 sm:px-8 sm:pb-8">
          <section className="border-b border-slate-200 pb-6 text-center" aria-labelledby="reservation-title">
            {success && <div aria-hidden="true" className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">✓</div>}
            <h1 id="reservation-title" className="text-2xl font-bold tracking-tight text-[#16364b] sm:text-[28px]">
              {success ? '¡Tu reserva está confirmada!' : 'Confirma tu reserva'}
            </h1>
            <p className="mt-2 break-words text-lg font-semibold text-[#16364b]">
              {success ? 'Te esperamos en ' : ''}{reservation.property_name ?? 'Propiedad'}
            </p>
            <dl className="mx-auto mt-5 grid max-w-2xl grid-cols-2 gap-4 rounded-xl bg-[#f3f8fa] p-4 text-sm sm:grid-cols-3 sm:gap-4">
              <div><dt className="text-slate-500">Ingreso</dt><dd className="mt-1 font-semibold">{formatDate(reservation.check_in)}</dd></div>
              <div><dt className="text-slate-500">Salida</dt><dd className="mt-1 font-semibold">{formatDate(reservation.check_out)}</dd></div>
              <div className="col-span-2 border-t border-slate-200 pt-3 sm:col-span-1 sm:border-t-0 sm:pt-0"><dt className="text-slate-500">Estadía</dt><dd className="mt-1 font-semibold">{reservation.nights} noches</dd></div>
            </dl>
          </section>

          <div className="mt-7 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-7">
            <div className="min-w-0 space-y-7">
              {success && <GuestListForm token={token} />}
              <section aria-labelledby="summary-title">
                <h2 id="summary-title" className="text-lg font-bold text-[#16364b]">Resumen de tu reserva</h2>
                <dl className="mt-3 divide-y divide-slate-100">
                  <div className="flex flex-wrap justify-between gap-2 py-3"><dt>Alquiler</dt><dd className="font-bold tabular-nums">{money(reservation.total_price)}</dd></div>
                  {Number(reservation.guarantee_amount) > 0 && <div className="flex flex-wrap justify-between gap-2 py-3"><dt>Depósito de garantía</dt><dd className="font-bold tabular-nums">{money(Number(reservation.guarantee_amount))}</dd></div>}
                </dl>
                {Number(reservation.guarantee_amount) > 0 && <div className="mt-2 text-sm leading-6 text-slate-600"><p>La garantía se entrega por separado del alquiler.</p><p>{reservation.guarantee_returned_on ? `Devuelta el ${formatDate(reservation.guarantee_returned_on)}` : reservation.guarantee_received_on ? `Recibida el ${formatDate(reservation.guarantee_received_on)}` : 'Garantía pendiente de entrega'}</p></div>}
              </section>
              {reservation.payment_schedule.length > 0 && <section>
                <h2 className="text-lg font-bold text-[#16364b]">Cronograma de pagos</h2>
                <div className="mt-3 divide-y divide-slate-100">
                  {reservation.payment_schedule.map((installment, index) => <div key={`${installment.due_date}-${index}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <span className="text-slate-600">Cuota {index + 1} · {formatDate(installment.due_date)}</span>
                    <strong className="tabular-nums">{money(installment.amount)}</strong>
                  </div>)}
                </div>
              </section>}
              {!success && (
            <div className="border-t border-slate-200 pt-6">

              <h3 className="text-xl font-bold text-gray-950">
                Datos del huésped
              </h3>

              <p className="mt-2 text-sm font-medium text-gray-700">
                Completa tus datos para confirmar la reserva.
              </p>


              {/* NOMBRE */}

              <div className="mt-6">

                <label htmlFor="tenant-fullName" className="text-sm font-semibold text-gray-900">
                  Nombre completo
                </label>

                <input
                  id="tenant-fullName"
                  autoComplete="name"
                  type="text"
                  maxLength={200}
                  value={fullName}
                  onChange={(e) =>
                    setFullName(
                      e.target.value
                    )
                  }
                  placeholder="Nombre y apellidos"
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-950 placeholder:text-gray-500"
                />

              </div>


              {/* DNI */}

              <div className="mt-5">

                <label htmlFor="tenant-dni" className="text-sm font-semibold text-gray-900">
                  DNI / Documento
                </label>

                <input
                  id="tenant-dni"
                  autoComplete="off"
                  type="text"
                  maxLength={50}
                  value={dni}
                  onChange={(e) =>
                    setDni(
                      e.target.value
                    )
                  }
                  placeholder="Número de documento"
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-950 placeholder:text-gray-500"
                />

              </div>


              {/* DIRECCIÓN */}

              <div className="mt-5">

                <label htmlFor="tenant-address" className="text-sm font-semibold text-gray-900">
                  Dirección
                </label>

                <input
                  id="tenant-address"
                  autoComplete="street-address"
                  type="text"
                  maxLength={500}
                  value={address}
                  onChange={(e) =>
                    setAddress(
                      e.target.value
                    )
                  }
                  placeholder="Dirección completa"
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-950 placeholder:text-gray-500"
                />

              </div>


              {/* CELULAR */}

              <div className="mt-5">

                <label htmlFor="tenant-phone" className="text-sm font-semibold text-gray-900">
                  Celular
                </label>

                <input
                  id="tenant-phone"
                  autoComplete="tel"
                  type="tel"
                  maxLength={50}
                  value={phone}
                  onChange={(e) =>
                    setPhone(
                      e.target.value
                    )
                  }
                  placeholder="999 999 999"
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-950 placeholder:text-gray-500"
                />

              </div>


              {/* EMAIL */}

              <div className="mt-5">

                <label htmlFor="tenant-email" className="text-sm font-semibold text-gray-900">
                  Correo electrónico
                </label>

                <input
                  id="tenant-email"
                  autoComplete="email"
                  type="email"
                  maxLength={320}
                  value={email}
                  onChange={(e) =>
                    setEmail(
                      e.target.value
                    )
                  }
                  placeholder="correo@ejemplo.com"
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-950 placeholder:text-gray-500"
                />

              </div>


              {/* CONFIRMACIÓN */}

              <div className="mt-6 flex items-start gap-3 rounded-xl bg-gray-100 p-4">

                <input
                  id="terms-accepted"
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) =>
                    setAccepted(
                      e.target.checked
                    )
                  }
                  className="mt-1 h-4 w-4"
                />

                <span
                  id="terms-accepted-label"
                  className="text-sm font-medium text-gray-800"
                >
                  <label htmlFor="terms-accepted" className="cursor-pointer">
                    He leído y acepto los{' '}
                  </label>

                  <Link
                    href={{
                      pathname: '/terminos-y-condiciones',
                      query: {
                        returnTo: `/reserva/${token}`,
                      },
                    }}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-gray-950 underline underline-offset-2 hover:text-gray-700"
                  >
                    Términos y Condiciones de Arrendamiento
                  </Link>
                  .
                </span>

              </div>


              {/* ERROR */}

              {errorMessage && (

                <div className="mt-5 rounded-lg bg-red-50 p-4 text-sm font-semibold text-red-800">

                  {errorMessage}

                </div>

              )}


              {/* BOTÓN */}

              <button
                onClick={
                  confirmReservation
                }
                disabled={saving}
                className="mt-6 w-full rounded-lg bg-[#237e9e] px-5 py-4 font-bold text-white hover:bg-[#19627c] disabled:opacity-50"
              >

                {saving
                  ? 'Confirmando...'
                  : 'Confirmar reserva'}

              </button>

            </div>

              )}
            </div>
            {paymentAccount && <aside className="min-w-0 border-t border-slate-200 pt-7 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8" aria-labelledby="payments-title">
              <h2 id="payments-title" className="text-lg font-bold text-[#16364b]">Información para pagos</h2>
              <p className="mt-3 font-semibold">BCP · {paymentAccount.currencyName}</p>
              <p className="mt-1 text-sm text-slate-600">Titular: {paymentAccount.accountHolder}</p>
              <dl className="mt-6 divide-y divide-slate-100">
                {[{ label: 'Número de cuenta', value: paymentAccount.accountNumber, button: 'Copiar cuenta' }, { label: 'CCI', value: paymentAccount.interbankNumber, button: 'Copiar CCI' }].map((account) => <div key={account.label} className="py-4 first:pt-0">
                  <dt className="text-sm text-slate-600">{account.label}</dt>
                  <dd className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-3">
                    <span className="min-w-0 select-all break-all font-mono text-base font-semibold">{account.value}</span>
                    <button type="button" disabled={copyingAccount} onClick={() => copyPaymentAccount(account.value, account.label)} className="min-h-11 rounded-lg border border-[#237e9e] px-4 py-2 text-sm font-semibold text-[#19627c] hover:bg-sky-50 disabled:opacity-50">{account.button}</button>
                  </dd>
                </div>)}
              </dl>
              <p role="status" className="mt-3 text-sm font-medium text-slate-600">{copyMessage}</p>
            </aside>}
          </div>
          <section className="mt-8 flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="font-bold text-[#16364b]">Normas de convivencia</h2><p className="mt-1 text-sm leading-6 text-slate-600">Revisa las normas del condominio antes de tu estadía.</p></div>
            <a href="/documentos/normas-de-convivencia.pdf" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 shrink-0 items-center gap-2 font-semibold text-[#19627c] underline underline-offset-4">Ver documento PDF <span aria-hidden="true">↗</span><span className="sr-only"> · Se abre en una nueva pestaña</span></a>
          </section>
        </div>
      </article>
    </main>
  )
}
