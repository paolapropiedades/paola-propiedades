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


  return (

    <main className="min-h-screen bg-gray-100 px-4 py-10">

      <div className="mx-auto max-w-xl">


        {/* HEADER */}

        <div className="text-center">

          <BrandLogo
            className="mx-auto h-auto w-80 max-w-full"
            priority
          />

          <p className="mt-2 font-medium text-gray-700">
            {success ? 'Tu reserva' : 'Confirma tu reserva'}
          </p>

        </div>


        {/* TARJETA */}

        <div className="mt-8 rounded-2xl border border-gray-300 bg-white p-6 shadow-sm">


          {success && (
            <section role="status" className="mb-6 border-b border-gray-200 pb-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-800">
                ✓
              </div>

              <h3 className="mt-5 text-2xl font-bold text-gray-950">
                Reserva confirmada
              </h3>

              <p className="mt-2 font-medium text-gray-700">
                Tus datos fueron registrados correctamente.
              </p>

              <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 font-semibold text-green-900">
                ¡Gracias!
              </div>

            </section>
          )}

          {/* RESUMEN */}

          <div className="border-b border-gray-200 pb-6">

            <p className="text-sm font-medium text-gray-600">
              Propiedad
            </p>

            <h2 className="mt-1 text-2xl font-bold text-gray-950">

              {reservation.property_name ??
                'Propiedad'}

            </h2>


            <div className="mt-6 grid grid-cols-2 gap-4">


              {/* CHECK IN */}

              <div>

                <p className="text-xs font-bold uppercase tracking-wide text-gray-600">
                  Check-in
                </p>

                <p className="mt-1 font-semibold text-gray-950">

                  {formatDate(
                    reservation.check_in
                  )}

                </p>

              </div>


              {/* CHECK OUT */}

              <div>

                <p className="text-xs font-bold uppercase tracking-wide text-gray-600">
                  Check-out
                </p>

                <p className="mt-1 font-semibold text-gray-950">

                  {formatDate(
                    reservation.check_out
                  )}

                </p>

              </div>

            </div>


            {/* TOTAL */}

            <div className="mt-6 rounded-xl bg-gray-100 p-4">

              <div className="flex justify-between">

                <span className="font-medium text-gray-700">
                  Noches
                </span>

                <strong className="text-gray-950">
                  {reservation.nights}
                </strong>

              </div>


              <div className="mt-2 flex justify-between">

                <span className="font-medium text-gray-700">
                  Total
                </span>

                <strong className="text-lg text-gray-950">

                  {reservation.currency === 'PEN' ? 'S/' : 'US$'}{' '}

                  {Number(
                    reservation.total_price
                  ).toLocaleString(
                    'en-US',
                    {
                      minimumFractionDigits:
                        2,

                      maximumFractionDigits:
                        2,
                    }
                  )}

                </strong>

              </div>

            </div>

            {reservation.payment_schedule.length > 0 && (
              <div className="mt-6">
                <h3 className="font-bold text-gray-950">Cronograma de pagos</h3>
                <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">
                  {reservation.payment_schedule.map((installment, index) => (
                    <div
                      key={`${installment.due_date}-${index}`}
                      className="flex items-center justify-between border-b border-gray-200 p-3 last:border-b-0"
                    >
                      <span className="text-sm font-medium text-gray-700">
                        Cuota {index + 1} · {formatDate(installment.due_date)}
                      </span>
                      <strong className="text-gray-950">
                        {reservation.currency === 'PEN' ? 'S/' : 'US$'}{' '}
                        {Number(installment.amount).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Number(reservation.guarantee_amount) > 0 && (
              <section className="mt-6 rounded-xl border border-gray-200 p-4">
                <h3 className="font-bold text-gray-950">Depósito de garantía</h3>
                <p className="mt-2 font-semibold text-gray-950">
                  {reservation.currency === 'PEN' ? 'S/' : 'US$'}{' '}
                  {Number(reservation.guarantee_amount).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                <p className="mt-1 text-sm text-gray-700">
                  Se entrega por separado del pago del alquiler.
                </p>
                <p className="mt-2 text-sm font-semibold text-gray-700">
                  {reservation.guarantee_received_on
                    ? `Recibida el ${formatDate(reservation.guarantee_received_on)}`
                    : 'Pendiente de entrega'}
                </p>
              </section>
            )}



            {paymentAccount && (
              <div className="mt-6 rounded-xl border border-sky-200 bg-sky-50 p-4 sm:p-5">
                <h3 className="font-bold text-gray-950">
                  Información para pagos
                </h3>
                <p className="mt-1 text-sm text-gray-700">
                  Cuenta BCP en {paymentAccount.currencyName}
                </p>

                <dl className="mt-4 space-y-3 text-sm">
                  <div>
                    <dt className="font-medium text-gray-600">Titular</dt>
                    <dd className="mt-0.5 font-semibold text-gray-950">
                      {paymentAccount.accountHolder}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-600">
                      Número de cuenta
                    </dt>
                    <dd className="mt-0.5 break-all font-mono font-semibold tracking-wide text-gray-950">
                      {paymentAccount.accountNumber}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-600">
                      Cuenta interbancaria (CCI)
                    </dt>
                    <dd className="mt-0.5 break-all font-mono font-semibold tracking-wide text-gray-950">
                      {paymentAccount.interbankNumber}
                    </dd>
                  </div>
                </dl>
              </div>
            )}

          </div>


          {/* SI YA ESTÁ CONFIRMADA */}

          {success ? (

            <div className="py-8 text-center">

              <GuestListForm token={token} />

            </div>

          ) : (

            /* FORMULARIO */

            <div className="pt-6">

              <h3 className="text-xl font-bold text-gray-950">
                Datos del huésped
              </h3>

              <p className="mt-2 text-sm font-medium text-gray-700">
                Completa tus datos para confirmar la reserva.
              </p>


              {/* NOMBRE */}

              <div className="mt-6">

                <label className="text-sm font-semibold text-gray-900">
                  Nombre completo
                </label>

                <input
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

                <label className="text-sm font-semibold text-gray-900">
                  DNI / Documento
                </label>

                <input
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

                <label className="text-sm font-semibold text-gray-900">
                  Dirección
                </label>

                <input
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

                <label className="text-sm font-semibold text-gray-900">
                  Celular
                </label>

                <input
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

                <label className="text-sm font-semibold text-gray-900">
                  Correo electrónico
                </label>

                <input
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
                className="mt-6 w-full rounded-lg bg-gray-950 px-5 py-4 font-bold text-white hover:bg-gray-800 disabled:opacity-50"
              >

                {saving
                  ? 'Confirmando...'
                  : 'Confirmar reserva'}

              </button>

            </div>

          )}

            <section className="mt-6 rounded-xl border border-gray-200 p-4">
              <h3 className="font-bold text-gray-950">Normas de convivencia</h3>
              <p className="mt-1 text-sm text-gray-700">
                Revisa las normas del condominio antes de tu estadía.
              </p>
              <a
                href="/documentos/normas-de-convivencia.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block rounded-lg bg-gray-950 px-4 py-3 text-sm font-bold text-white hover:bg-gray-800"
              >
                Ver normas de convivencia (PDF)
                <span className="sr-only"> · Se abre en una nueva pestaña</span>
              </a>
            </section>

        </div>

      </div>

    </main>

  )
}
