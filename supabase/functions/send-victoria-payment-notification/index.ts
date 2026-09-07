import { createClient } from 'npm:@supabase/supabase-js@2.112.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const victoriaProperties = new Set([
  'Casa 2', 'Casa 3', 'Casa 5', 'Casa 6',
  'Dpto 105', 'Dpto 106', 'Dpto 202', 'Dpto 306',
])

type PaymentData = {
  id: number
  amount: number
  currency: 'USD' | 'PEN'
  payment_date: string
  reservations: {
    reservation_number: string
    total_price: number
    amount_paid: number
    tenant_full_name: string | null
    properties: { name: string } | { name: string }[] | null
  } | null
}

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function escapeHtml(value: string | number | null) {
  return String(value ?? '—')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function money(value: number) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function date(value: string) {
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

function propertyName(payment: PaymentData) {
  const properties = payment.reservations?.properties
  return Array.isArray(properties) ? properties[0]?.name : properties?.name
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return response({ error: 'Método no permitido.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const recipient = Deno.env.get('VICTORIA_PAYMENT_EMAIL')?.trim()
  const authorization = request.headers.get('Authorization')

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !resendApiKey || !recipient) {
    console.error('Falta configuración para la notificación de pagos.')
    return response({ error: 'Servicio no configurado.' }, 500)
  }

  if (!authorization) return response({ error: 'No autorizado.' }, 401)

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: userError } = await caller.auth.getUser()
  if (userError) return response({ error: 'No autorizado.' }, 401)

  let body: unknown
  try { body = await request.json() } catch { return response({ error: 'Solicitud inválida.' }, 400) }

  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !('payment_id' in body) ||
      !Number.isSafeInteger(body.payment_id) || Number(body.payment_id) <= 0) {
    return response({ error: 'payment_id inválido.' }, 400)
  }

  const paymentId = Number(body.payment_id)
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const claimedAt = new Date().toISOString()
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString()

  const { data, error } = await admin
    .from('payments')
    .update({ victoria_email_claimed_at: claimedAt })
    .eq('id', paymentId)
    .is('victoria_email_sent_at', null)
    .or(`victoria_email_claimed_at.is.null,victoria_email_claimed_at.lt.${staleBefore}`)
    .select(`
      id, amount, currency, payment_date,
      reservations!inner (
        reservation_number, total_price, amount_paid, tenant_full_name,
        properties!inner (name)
      )
    `)
    .maybeSingle()

  if (error) {
    console.error('No se pudo consultar el pago:', error.message)
    return response({ error: 'No se pudo procesar el aviso.' }, 500)
  }
  if (!data) return response({ ok: true, already_processed: true })

  const payment = data as unknown as PaymentData
  const house = propertyName(payment)
  if (!house || !victoriaProperties.has(house)) {
    await admin.from('payments').update({ victoria_email_claimed_at: null }).eq('id', paymentId)
    return response({ ok: true, not_victoria: true })
  }

  const reservation = payment.reservations!
  const symbol = payment.currency === 'PEN' ? 'S/' : 'US$'
  const remaining = Math.max(Number(reservation.total_price) - Number(reservation.amount_paid), 0)
  const subject = `Pago registrado - ${house} - ${reservation.reservation_number}`
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827"><div style="padding:32px 16px"><div style="max-width:600px;margin:auto;background:white;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden"><div style="padding:26px 30px;background:#111827;color:white"><strong style="letter-spacing:1.4px">PAOLA PROPIEDADES</strong><h1 style="font-size:24px;margin:10px 0 0">Nuevo pago registrado</h1></div><div style="padding:26px 30px"><h2>${escapeHtml(house)}</h2><p><b>Reserva:</b> ${escapeHtml(reservation.reservation_number)}</p><p><b>Inquilino:</b> ${escapeHtml(reservation.tenant_full_name)}</p><p><b>Fecha del pago:</b> ${escapeHtml(date(payment.payment_date))}</p><p><b>Monto recibido:</b> ${symbol} ${escapeHtml(money(payment.amount))}</p><hr style="border:0;border-top:1px solid #e5e7eb;margin:22px 0"><p><b>Total de la reserva:</b> ${symbol} ${escapeHtml(money(reservation.total_price))}</p><p><b>Total pagado:</b> ${symbol} ${escapeHtml(money(reservation.amount_paid))}</p><p><b>Saldo pendiente:</b> ${symbol} ${escapeHtml(money(remaining))}</p></div></div></div></body></html>`

  let resend: Response
  try {
    resend = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `victoria-payment/${paymentId}`,
      },
      body: JSON.stringify({
        from: 'Paola Propiedades <reservas@paolapropiedades.com>',
        to: [recipient], subject, html,
      }),
    })
  } catch (sendError) {
    console.error('No se pudo conectar con Resend:', sendError)
    await admin.from('payments').update({ victoria_email_claimed_at: null }).eq('id', paymentId)
    return response({ error: 'No se pudo enviar el correo.' }, 502)
  }

  if (!resend.ok) {
    console.error(`Resend respondió ${resend.status}: ${await resend.text()}`)
    await admin.from('payments').update({ victoria_email_claimed_at: null }).eq('id', paymentId)
    return response({ error: 'No se pudo enviar el correo.' }, 502)
  }

  const { error: markError } = await admin
    .from('payments')
    .update({ victoria_email_sent_at: new Date().toISOString(), victoria_email_claimed_at: null })
    .eq('id', paymentId)
    .eq('victoria_email_claimed_at', claimedAt)
    .is('victoria_email_sent_at', null)

  if (markError) {
    console.error('No se pudo marcar el aviso como enviado:', markError.message)
    return response({ error: 'No se pudo finalizar el aviso.' }, 500)
  }

  return response({ ok: true })
})
