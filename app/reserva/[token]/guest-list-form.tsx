'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Guest = {
  full_name: string
  dni: string
  age: string
}

type GuestListData = {
  max_guests: number
  submission_deadline: string
  submitted_at: string | null
  guests: Array<{
    full_name: string
    dni: string
    age: number
  }>
  vehicle_plates: string[]
}

const emptyGuest = (): Guest => ({
  full_name: '',
  dni: '',
  age: '',
})

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-PE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

function todayInLima() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''

  return `${getPart('year')}-${getPart('month')}-${getPart('day')}`
}

export function GuestListForm({ token }: { token: string }) {
  const [metadata, setMetadata] = useState<GuestListData | null>(null)
  const [guests, setGuests] = useState<Guest[]>([emptyGuest()])
  const [plates, setPlates] = useState(['', ''])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const loadGuestList = useCallback(async () => {
    const { data, error } = await supabase
      .rpc('get_guest_list_by_token', {
        p_confirmation_token: token,
      })
      .maybeSingle()

    if (error || !data) {
      console.error(error)
      setErrorMessage('No pudimos cargar la lista de huéspedes.')
      setLoading(false)
      return
    }

    const guestList = data as GuestListData
    setMetadata(guestList)

    if (guestList.guests.length > 0) {
      setGuests(
        guestList.guests.map((guest) => ({
          full_name: guest.full_name,
          dni: guest.dni,
          age: String(guest.age),
        }))
      )
    }

    setPlates([
      guestList.vehicle_plates[0] ?? '',
      guestList.vehicle_plates[1] ?? '',
    ])
    setLoading(false)
  }, [token])

  useEffect(() => {
    // Initial synchronization with the token-limited RPC.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadGuestList()
  }, [loadGuestList])

  function updateGuest(index: number, field: keyof Guest, value: string) {
    setGuests((current) =>
      current.map((guest, guestIndex) =>
        guestIndex === index ? { ...guest, [field]: value } : guest
      )
    )
  }

  function addGuest() {
    if (!metadata || guests.length >= metadata.max_guests) return
    setGuests((current) => [...current, emptyGuest()])
  }

  function removeGuest(index: number) {
    if (guests.length === 1) return
    setGuests((current) =>
      current.filter((_, guestIndex) => guestIndex !== index)
    )
  }

  async function saveGuestList() {
    setMessage('')
    setErrorMessage('')

    if (
      guests.some((guest) => {
        const age = Number(guest.age)
        return (
          !guest.full_name.trim() ||
          !guest.dni.trim() ||
          !Number.isInteger(age) ||
          age < 0 ||
          age > 120
        )
      })
    ) {
      setErrorMessage(
        'Completa nombre, DNI y una edad válida para cada huésped.'
      )
      return
    }

    setSaving(true)

    const { data, error } = await supabase.rpc(
      'save_guest_list_by_token',
      {
        p_confirmation_token: token,
        p_guests: guests.map((guest) => ({
          full_name: guest.full_name.trim(),
          dni: guest.dni.trim(),
          age: Number(guest.age),
        })),
        p_vehicle_plates: plates.map((plate) => plate.trim()),
      }
    )

    if (error || data !== true) {
      console.error(error)
      setErrorMessage('No pudimos guardar la lista. Intenta nuevamente.')
      setSaving(false)
      return
    }

    setMessage('Lista guardada correctamente.')
    setSaving(false)
    await loadGuestList()
  }

  if (loading) {
    return (
      <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm font-medium text-gray-600">
        Cargando lista de huéspedes...
      </div>
    )
  }

  if (!metadata) {
    return (
      <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
        {errorMessage}
      </div>
    )
  }

  const isLate = metadata.submission_deadline < todayInLima()

  return (
    <section className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-5 text-left">
      <h4 className="text-lg font-bold text-gray-950">
        Lista de huéspedes y vehículos
      </h4>

      <p className="mt-2 text-sm font-medium text-gray-700">
        Envíala hasta el{' '}
        <strong>{formatDate(metadata.submission_deadline)}</strong>, una semana
        antes del ingreso.
      </p>

      <p className={`mt-2 text-sm font-bold ${isLate ? 'text-red-700' : 'text-blue-800'}`}>
        {metadata.submitted_at
          ? 'Lista recibida. Puedes actualizarla si es necesario.'
          : isLate
            ? 'La fecha límite venció, pero aún puedes enviarla.'
            : `Pendiente: máximo ${metadata.max_guests} huéspedes y 2 vehículos.`}
      </p>

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="mt-4 rounded-lg bg-gray-950 px-4 py-3 text-sm font-bold text-white hover:bg-gray-800"
      >
        {open
          ? 'Cerrar formulario'
          : metadata.submitted_at
            ? 'Editar lista'
            : 'Completar lista'}
      </button>

      {open && (
        <div className="mt-6 border-t border-blue-200 pt-6">
          <div className="space-y-4">
            {guests.map((guest, index) => (
              <div key={index} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <h5 className="font-bold text-gray-950">
                    Huésped {index + 1}
                  </h5>

                  {guests.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeGuest(index)}
                      className="text-xs font-bold text-red-700 hover:text-red-900"
                    >
                      Quitar
                    </button>
                  )}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    maxLength={200}
                    value={guest.full_name}
                    onChange={(event) =>
                      updateGuest(index, 'full_name', event.target.value)
                    }
                    placeholder="Nombre completo"
                    aria-label={`Nombre del huésped ${index + 1}`}
                    className="rounded-lg border border-gray-300 p-3 text-gray-950"
                  />

                  <input
                    type="text"
                    maxLength={50}
                    value={guest.dni}
                    onChange={(event) =>
                      updateGuest(index, 'dni', event.target.value)
                    }
                    placeholder="DNI / Documento"
                    aria-label={`DNI del huésped ${index + 1}`}
                    className="rounded-lg border border-gray-300 p-3 text-gray-950"
                  />

                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={guest.age}
                    onChange={(event) =>
                      updateGuest(index, 'age', event.target.value)
                    }
                    placeholder="Edad"
                    aria-label={`Edad del huésped ${index + 1}`}
                    className="rounded-lg border border-gray-300 p-3 text-gray-950 sm:col-span-2"
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addGuest}
            disabled={guests.length >= metadata.max_guests}
            className="mt-4 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-800 hover:bg-gray-50 disabled:opacity-40"
          >
            + Agregar huésped ({guests.length}/{metadata.max_guests})
          </button>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {plates.map((plate, index) => (
              <input
                key={index}
                type="text"
                maxLength={20}
                value={plate}
                onChange={(event) =>
                  setPlates((current) =>
                    current.map((value, plateIndex) =>
                      plateIndex === index ? event.target.value : value
                    )
                  )
                }
                placeholder={`Placa vehículo ${index + 1} (opcional)`}
                aria-label={`Placa del vehículo ${index + 1}`}
                className="rounded-lg border border-gray-300 bg-white p-3 text-gray-950"
              />
            ))}
          </div>

          {errorMessage && (
            <p className="mt-4 rounded-lg bg-red-100 p-3 text-sm font-bold text-red-800">
              {errorMessage}
            </p>
          )}

          {message && (
            <p className="mt-4 rounded-lg bg-green-100 p-3 text-sm font-bold text-green-800">
              {message}
            </p>
          )}

          <button
            type="button"
            onClick={saveGuestList}
            disabled={saving}
            className="mt-5 w-full rounded-lg bg-blue-700 px-5 py-3 font-bold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar lista'}
          </button>
        </div>
      )}
    </section>
  )
}
