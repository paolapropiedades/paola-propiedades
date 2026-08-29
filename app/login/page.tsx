'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BrandLogo } from '@/app/components/brand-logo'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    setLoading(true)
    setErrorMessage('')

    const { error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      })

    if (error) {
      console.error(error)

      setErrorMessage(
        'Correo o contraseña incorrectos.'
      )

      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-6">

      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-lg">

        <div className="text-center">

          <BrandLogo
            className="mx-auto h-auto w-80 max-w-full"
            priority
          />

          <p className="mt-2 font-medium text-gray-600">
            Panel de administración
          </p>

        </div>


        <form
          onSubmit={handleLogin}
          className="mt-8"
        >

          <div>

            <label className="text-sm font-semibold text-gray-900">
              Correo
            </label>

            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              placeholder="admin@correo.com"
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-950 placeholder:text-gray-400 focus:border-gray-600 focus:outline-none"
            />

          </div>


          <div className="mt-5">

            <label className="text-sm font-semibold text-gray-900">
              Contraseña
            </label>

            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              placeholder="••••••••"
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-950 placeholder:text-gray-400 focus:border-gray-600 focus:outline-none"
            />

          </div>


          {errorMessage && (

            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3">

              <p className="text-sm font-semibold text-red-700">
                {errorMessage}
              </p>

            </div>

          )}


          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-lg bg-gray-950 px-5 py-3 font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? 'Ingresando...'
              : 'Ingresar'}
          </button>

        </form>


        <p className="mt-6 text-center text-xs font-medium text-gray-500">
          Acceso exclusivo para administración
        </p>

      </div>

    </main>
  )
}
