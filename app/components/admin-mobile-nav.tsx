'use client'

import Link from 'next/link'

type AdminMobileNavProps = {
  current: 'calendar' | 'reservations'
  onNewReservation?: () => void
}

export function AdminMobileNav({
  current,
  onNewReservation,
}: AdminMobileNavProps) {
  const itemClass =
    'flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-[11px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-950'

  return (
    <nav
      aria-label="Navegación administrativa"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur md:hidden"
    >
      <div className="mx-auto flex max-w-md gap-2">
        <Link
          href="/"
          aria-current={current === 'calendar' ? 'page' : undefined}
          className={`${itemClass} ${
            current === 'calendar'
              ? 'bg-gray-950 text-white'
              : 'text-gray-600'
          }`}
        >
          <span aria-hidden="true" className="text-base">▦</span>
          Calendario
        </Link>

        <Link
          href="/reservas"
          aria-current={current === 'reservations' ? 'page' : undefined}
          className={`${itemClass} ${
            current === 'reservations'
              ? 'bg-gray-950 text-white'
              : 'text-gray-600'
          }`}
        >
          <span aria-hidden="true" className="text-base">☰</span>
          Reservas
        </Link>

        {onNewReservation && (
          <button
            type="button"
            onClick={onNewReservation}
            className={`${itemClass} bg-blue-700 text-white`}
          >
            <span aria-hidden="true" className="text-base">＋</span>
            Nueva
          </button>
        )}
      </div>
    </nav>
  )
}
