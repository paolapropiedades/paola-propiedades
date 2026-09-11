'use client'

import { useEffect, useRef, type ReactNode } from 'react'

export function AdminDialog({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    const previousOverflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
    }
  }, [])
  return <dialog ref={ref} aria-label={label} onCancel={(event) => { event.preventDefault(); onClose() }} className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto overscroll-contain rounded-2xl bg-white p-4 text-gray-950 shadow-xl backdrop:bg-black/50 sm:p-6">
    {children}
  </dialog>
}
