import type { Metadata } from 'next'
import Link from 'next/link'
import { BrandLogo } from '@/app/components/brand-logo'

export const metadata: Metadata = {
  title: 'Términos y Condiciones de Arrendamiento',
  description:
    'Términos y Condiciones de Arrendamiento de Paola Cornejo – Propiedades en la playa.',
}

const sections = [
  {
    title: '1. Objeto',
    paragraphs: [
      'Los presentes Términos y Condiciones regulan el arrendamiento temporal del inmueble identificado en la reserva realizada con Paola Cornejo – Propiedades en la playa, en adelante, “EL ARRENDADOR”.',
      'La persona que confirma la reserva será denominada “EL ARRENDATARIO”.',
      'Al confirmar electrónicamente la reserva, EL ARRENDATARIO declara haber leído, comprendido y aceptado estos Términos y Condiciones.',
    ],
  },
  {
    title: '2. Reserva y período de arrendamiento',
    paragraphs: [
      'El inmueble, fechas de ingreso y salida, precio total y demás condiciones particulares serán las indicadas en la confirmación de cada reserva.',
      'EL ARRENDATARIO se obliga a desocupar y entregar el inmueble en la fecha y hora acordadas.',
    ],
  },
  {
    title: '3. Uso del inmueble',
    paragraphs: [
      'El inmueble será utilizado exclusivamente como casa habitación durante el período reservado.',
      'EL ARRENDATARIO no podrá subarrendar total o parcialmente el inmueble, ceder la reserva o su posición contractual a terceros, ni realizar modificaciones en el inmueble sin autorización previa del ARRENDADOR.',
    ],
  },
  {
    title: '4. Huéspedes y capacidad',
    paragraphs: [
      'Solo podrán pernoctar en el inmueble las personas autorizadas e incluidas en la lista de huéspedes correspondiente.',
      'En ningún caso podrá superarse la capacidad máxima establecida para el inmueble reservado.',
      'Los invitados que no formen parte de la lista autorizada no podrán pernoctar en el inmueble, salvo autorización previa.',
    ],
  },
  {
    title: '5. Precio y pagos',
    paragraphs: [
      'EL ARRENDATARIO se obliga a pagar el precio total y las cuotas correspondientes en los montos y fechas acordados para su reserva.',
      'Los pagos realizados serán registrados como parte de la contraprestación correspondiente al arrendamiento.',
      'El incumplimiento de las obligaciones de pago podrá dar lugar a la cancelación o resolución de la reserva de acuerdo con las condiciones particulares comunicadas al ARRENDATARIO.',
    ],
  },
  {
    title: '6. Servicios',
    paragraphs: [
      'Salvo que se indique algo diferente en las condiciones particulares de la reserva, el arrendamiento comprende los servicios y conceptos expresamente indicados por EL ARRENDADOR.',
      'Los servicios adicionales solicitados por EL ARRENDATARIO podrán generar cargos adicionales.',
    ],
  },
  {
    title: '7. Depósito de garantía',
    paragraphs: [
      'Cuando corresponda, EL ARRENDATARIO deberá entregar el depósito de garantía indicado para su reserva.',
      'Este depósito podrá ser utilizado para cubrir daños o deterioros imputables al ARRENDATARIO, así como otros conceptos expresamente acordados.',
      'El saldo que corresponda será devuelto después de la finalización del arrendamiento y de la revisión del inmueble.',
    ],
  },
  {
    title: '8. Estado, cuidado y conservación del inmueble',
    paragraphs: [
      'EL ARRENDATARIO se obliga a utilizar diligentemente el inmueble, sus instalaciones, muebles, equipos y demás bienes.',
      'Será responsable de pagar, reparar, sustituir o reemplazar aquellos bienes que resulten dañados por causas que le sean imputables, incluyendo los daños ocasionados por sus familiares o invitados.',
      'Los deterioros derivados del uso normal, vicios ocultos, caso fortuito o fuerza mayor no serán imputables al ARRENDATARIO.',
    ],
  },
  {
    title: '9. Entrega del inmueble',
    paragraphs: [
      'Al finalizar la reserva, EL ARRENDATARIO deberá devolver el inmueble en la fecha y hora acordadas, entregar las llaves y dejarlo limpio, sin desperdicios y en condiciones razonables considerando su uso normal.',
    ],
  },
  {
    title: '10. Retraso en la devolución',
    paragraphs: [
      'EL ARRENDATARIO deberá entregar el inmueble puntualmente al finalizar el período reservado.',
      'De acuerdo con las condiciones utilizadas por EL ARRENDADOR, el retraso en la devolución podrá generar una penalidad de US$300.00 por cada día de retraso, hasta la efectiva devolución del inmueble.',
    ],
  },
  {
    title: '11. Normas del condominio',
    paragraphs: [
      'EL ARRENDATARIO declara que deberá respetar las normas de convivencia, seguridad y administración correspondientes al condominio en el que se encuentre el inmueble.',
      'Esta obligación se extiende a sus familiares, huéspedes e invitados.',
      'Las multas, sanciones u otras consecuencias generadas por el incumplimiento de dichas normas serán responsabilidad de EL ARRENDATARIO cuando correspondan a actos realizados durante su estadía.',
      'Un incumplimiento grave de las normas del condominio podrá dar lugar a la resolución del arrendamiento.',
    ],
  },
  {
    title: '12. Bienes personales',
    paragraphs: [
      'EL ARRENDATARIO será responsable de sus objetos personales y de los pertenecientes a sus huéspedes o invitados.',
      'Después de la devolución del inmueble, EL ARRENDADOR no será responsable por la pérdida, deterioro o sustracción de bienes dejados en su interior.',
    ],
  },
  {
    title: '13. Incumplimiento',
    paragraphs: [
      'El incumplimiento de las obligaciones esenciales asumidas por EL ARRENDATARIO, incluyendo las obligaciones de pago, uso autorizado del inmueble y cumplimiento de las normas del condominio, podrá dar lugar a la resolución del arrendamiento conforme a las condiciones aplicables y a la legislación peruana.',
    ],
  },
  {
    title: '14. Legislación aplicable',
    paragraphs: [
      'Los presentes Términos y Condiciones y el arrendamiento correspondiente se rigen por las leyes de la República del Perú.',
      'Para cualquier controversia relacionada con el arrendamiento, las partes se someten a la jurisdicción correspondiente de Lima, conforme a lo establecido en las condiciones del arrendamiento.',
    ],
  },
  {
    title: '15. Aceptación electrónica',
    paragraphs: [
      'Al marcar la casilla “He leído y acepto los Términos y Condiciones de Arrendamiento” y confirmar la reserva, EL ARRENDATARIO manifiesta expresamente su aceptación.',
      'El sistema podrá registrar la fecha y hora de aceptación, la versión de los Términos y Condiciones aceptada y la reserva asociada a dicha aceptación.',
      'Esta aceptación forma parte del proceso de confirmación de la reserva.',
    ],
  },
]

export default async function TermsAndConditionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    returnTo?: string | string[]
  }>
}) {
  const requestedReturnTo = (await searchParams).returnTo
  const returnTo =
    typeof requestedReturnTo === 'string' &&
    /^\/reserva\/[A-Za-z0-9_-]{32,128}$/.test(requestedReturnTo)
      ? requestedReturnTo
      : '/'

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-10">
      <article className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-10">
        <header className="border-b border-gray-200 pb-8 text-center">
          <BrandLogo
            className="mx-auto h-auto w-96 max-w-full"
            priority
          />

          <h1 className="mt-5 text-2xl font-bold text-gray-950 sm:text-3xl">
            Términos y Condiciones de Arrendamiento
          </h1>

          <p className="mt-3 text-sm font-semibold text-gray-600">
            Versión 2026-08-28
          </p>
        </header>

        <div className="mt-8 space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-bold text-gray-950">
                {section.title}
              </h2>

              <div className="mt-3 space-y-3 text-sm leading-7 text-gray-700 sm:text-base">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-10 border-t border-gray-200 pt-6 text-center">
          <Link
            href={returnTo}
            className="font-bold text-gray-700 underline underline-offset-4 hover:text-gray-950"
          >
            {returnTo === '/'
              ? 'Ir al inicio'
              : 'Volver a la reserva'}
          </Link>
        </footer>
      </article>
    </main>
  )
}
