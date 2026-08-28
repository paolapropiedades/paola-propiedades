import { createClient } from 'npm:@supabase/supabase-js@2.112.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const jsonHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json',
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type ReservationForEmail = {
  id: number | string
  reservation_number: string
  check_in: string
  check_out: string
  nights: number
  total_price: number
  tenant_full_name: string | null
  tenant_dni: string | null
  tenant_address: string | null
  tenant_phone: string | null
  tenant_email: string | null
  properties: { name: string }[] | { name: string } | null
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  })
}

function escapeHtml(value: string | number | null) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function getPropertyName(reservation: ReservationForEmail) {
  if (Array.isArray(reservation.properties)) {
    return reservation.properties[0]?.name ?? 'Propiedad'
  }

  return reservation.properties?.name ?? 'Propiedad'
}

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

function buildEmailHtml(
  reservation: ReservationForEmail,
  propertyName: string
) {
  const rows = [
    ['Número de reserva', reservation.reservation_number],
    ['Casa', propertyName],
    ['Check-in', formatDate(reservation.check_in)],
    ['Check-out', formatDate(reservation.check_out)],
    ['Noches', reservation.nights],
    ['Monto total', `US$ ${formatMoney(reservation.total_price)}`],
  ]

  const tenantRows = [
    ['Nombre', reservation.tenant_full_name],
    ['DNI', reservation.tenant_dni],
    ['Dirección', reservation.tenant_address],
    ['Celular', reservation.tenant_phone],
    ['Correo', reservation.tenant_email],
  ]

  const renderRows = (
    values: Array<[string, string | number | null]>
  ) =>
    values
      .map(
        ([label, value]) => `
          <tr>
            <td style="padding:8px 12px;color:#6b7280;font-size:14px;vertical-align:top;">${escapeHtml(label)}</td>
            <td style="padding:8px 12px;color:#111827;font-size:14px;font-weight:600;vertical-align:top;">${escapeHtml(value)}</td>
          </tr>`
      )
      .join('')

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
    <div style="padding:32px 16px;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
        <div style="padding:26px 30px;background:#111827;color:#ffffff;">
          <div style="font-size:13px;font-weight:700;letter-spacing:1.4px;">PAOLA PROPIEDADES</div>
          <h1 style="margin:10px 0 0;font-size:24px;line-height:1.3;">Nueva reserva confirmada</h1>
        </div>

        <div style="padding:26px 18px;">
          <h2 style="margin:0 12px 14px;font-size:19px;">${escapeHtml(propertyName)}</h2>
          <table role="presentation" style="width:100%;border-collapse:collapse;">${renderRows(rows)}</table>

          <div style="height:1px;background:#e5e7eb;margin:24px 12px;"></div>

          <h2 style="margin:0 12px 14px;font-size:15px;letter-spacing:.8px;">DATOS DEL TENANT</h2>
          <table role="presentation" style="width:100%;border-collapse:collapse;">${renderRows(tenantRows)}</table>
        </div>

        <div style="padding:18px 30px;background:#f9fafb;color:#6b7280;font-size:12px;">
          Notificación automática de Paola Propiedades.
        </div>
      </div>
    </div>
  </body>
</html>`
}

function buildEmailText(
  reservation: ReservationForEmail,
  propertyName: string
) {
  return [
    'PAOLA PROPIEDADES',
    'Nueva reserva confirmada',
    '',
    `Número de reserva: ${reservation.reservation_number}`,
    `Casa: ${propertyName}`,
    `Check-in: ${formatDate(reservation.check_in)}`,
    `Check-out: ${formatDate(reservation.check_out)}`,
    `Noches: ${reservation.nights}`,
    `Monto total: US$ ${formatMoney(reservation.total_price)}`,
    '',
    'DATOS DEL TENANT',
    `Nombre: ${reservation.tenant_full_name}`,
    `DNI: ${reservation.tenant_dni}`,
    `Dirección: ${reservation.tenant_address}`,
    `Celular: ${reservation.tenant_phone}`,
    `Correo: ${reservation.tenant_email}`,
  ].join('\n')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método no permitido.' }, 405)
  }

  let requestBody: unknown

  try {
    requestBody = await request.json()
  } catch {
    return jsonResponse({ error: 'Solicitud inválida.' }, 400)
  }

  if (
    !requestBody ||
    typeof requestBody !== 'object' ||
    Array.isArray(requestBody) ||
    Object.keys(requestBody).length !== 1 ||
    !('confirmation_token' in requestBody) ||
    typeof requestBody.confirmation_token !== 'string' ||
    !uuidPattern.test(requestBody.confirmation_token)
  ) {
    return jsonResponse({ error: 'confirmation_token inválido.' }, 400)
  }

  const confirmationToken = requestBody.confirmation_token
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const adminEmail = Deno.env.get('ADMIN_EMAIL')
  const fromEmail =
    Deno.env.get('RESEND_FROM_EMAIL') ??
    'Paola Propiedades <onboarding@resend.dev>'

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !resendApiKey ||
    !adminEmail
  ) {
    console.error('Faltan secrets requeridos para enviar el correo.')
    return jsonResponse({ error: 'Servicio no configurado.' }, 500)
  }

  const supabaseAdmin = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  )

  const claimedAt = new Date().toISOString()
  const staleClaimBefore = new Date(
    Date.now() - 5 * 60 * 1000
  ).toISOString()

  const { data: claimedReservation, error: claimError } =
    await supabaseAdmin
      .from('reservations')
      .update({ confirmation_email_claimed_at: claimedAt })
      .eq('confirmation_token', confirmationToken)
      .eq('reservation_status', 'confirmed')
      .is('confirmation_email_sent_at', null)
      .or(
        `confirmation_email_claimed_at.is.null,confirmation_email_claimed_at.lt.${staleClaimBefore}`
      )
      .select(`
        id,
        reservation_number,
        check_in,
        check_out,
        nights,
        total_price,
        tenant_full_name,
        tenant_dni,
        tenant_address,
        tenant_phone,
        tenant_email,
        properties (
          name
        )
      `)
      .maybeSingle()

  if (claimError) {
    console.error('No se pudo reclamar el envío:', claimError.message)
    return jsonResponse({ error: 'No se pudo procesar el envío.' }, 500)
  }

  if (!claimedReservation) {
    const { data: currentReservation, error: lookupError } =
      await supabaseAdmin
        .from('reservations')
        .select(`
          reservation_status,
          confirmation_email_sent_at,
          confirmation_email_claimed_at
        `)
        .eq('confirmation_token', confirmationToken)
        .maybeSingle()

    if (lookupError) {
      console.error('No se pudo verificar el envío:', lookupError.message)
      return jsonResponse({ error: 'No se pudo procesar el envío.' }, 500)
    }

    if (!currentReservation) {
      return jsonResponse({ error: 'Reserva no encontrada.' }, 404)
    }

    if (currentReservation.reservation_status !== 'confirmed') {
      return jsonResponse({ error: 'La reserva no está confirmada.' }, 409)
    }

    if (currentReservation.confirmation_email_sent_at) {
      return jsonResponse({ ok: true, already_sent: true })
    }

    return jsonResponse({ ok: true, email_pending: true }, 202)
  }

  const reservation =
    claimedReservation as unknown as ReservationForEmail

  const requiredTenantData = [
    reservation.tenant_full_name,
    reservation.tenant_dni,
    reservation.tenant_address,
    reservation.tenant_phone,
    reservation.tenant_email,
  ]

  if (requiredTenantData.some((value) => !value?.trim())) {
    await supabaseAdmin
      .from('reservations')
      .update({ confirmation_email_claimed_at: null })
      .eq('id', reservation.id)
      .eq('confirmation_email_claimed_at', claimedAt)

    return jsonResponse({ error: 'La reserva no tiene datos completos.' }, 422)
  }

  const propertyName = getPropertyName(reservation)
  const subject = sanitizeHeader(
    `Nueva reserva confirmada - ${propertyName} - ${reservation.tenant_full_name}`
  )

  let resendResponse: Response

  try {
    resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key':
          `reservation-confirmed/${reservation.id}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [adminEmail],
        subject,
        html: buildEmailHtml(reservation, propertyName),
        text: buildEmailText(reservation, propertyName),
      }),
    })
  } catch (error) {
    console.error('No se pudo conectar con Resend:', error)

    await supabaseAdmin
      .from('reservations')
      .update({ confirmation_email_claimed_at: null })
      .eq('id', reservation.id)
      .eq('confirmation_email_claimed_at', claimedAt)

    return jsonResponse({ error: 'No se pudo enviar el correo.' }, 502)
  }

  if (!resendResponse.ok) {
    const resendError = await resendResponse.text()
    console.error(
      `Resend respondió ${resendResponse.status}: ${resendError}`
    )

    await supabaseAdmin
      .from('reservations')
      .update({ confirmation_email_claimed_at: null })
      .eq('id', reservation.id)
      .eq('confirmation_email_claimed_at', claimedAt)

    return jsonResponse({ error: 'No se pudo enviar el correo.' }, 502)
  }

  const { error: markSentError } = await supabaseAdmin
    .from('reservations')
    .update({
      confirmation_email_sent_at: new Date().toISOString(),
      confirmation_email_claimed_at: null,
    })
    .eq('id', reservation.id)
    .eq('confirmation_email_claimed_at', claimedAt)
    .is('confirmation_email_sent_at', null)

  if (markSentError) {
    console.error(
      'El correo se envió, pero no se pudo marcar como enviado:',
      markSentError.message
    )
    return jsonResponse({ error: 'No se pudo finalizar el envío.' }, 500)
  }

  return jsonResponse({ ok: true })
})
