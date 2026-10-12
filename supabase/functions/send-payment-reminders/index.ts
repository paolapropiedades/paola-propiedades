import { createClient } from "npm:@supabase/supabase-js@2.112.4";

type Reminder = {
  delivery_id: number;
  reservation_id: number;
  reservation_number: string;
  confirmation_token: string | null;
  tenant_full_name: string | null;
  tenant_email: string;
  property_name: string;
  check_in: string;
  currency: "USD" | "PEN";
  installment_amount: number;
  outstanding_balance: number;
  due_date: string;
  claim_token: string;
};

const paolaProperties = new Set(["Casa 4", "Dpto 101", "Dpto 201", "Dpto 301"]);
const victoriaProperties = new Set([
  "Casa 2",
  "Casa 3",
  "Casa 5",
  "Casa 6",
  "Dpto 105",
  "Dpto 106",
  "Dpto 202",
  "Dpto 306",
]);

const paymentAccounts = {
  Paola: {
    accountHolder: "Paola Cornejo",
    USD: {
      accountNumber: "19393706874105",
      interbankNumber: "00219319370687410519",
    },
    PEN: {
      accountNumber: "19394883469085",
      interbankNumber: "00219319488346908510",
    },
  },
  Victoria: {
    accountHolder: "Victoria Yrigoyen",
    USD: {
      accountNumber: "19494705364181",
      interbankNumber: "00219419470536418198",
    },
    PEN: {
      accountNumber: "19494705335052",
      interbankNumber: "00219419470533505297",
    },
  },
} as const;

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function limaDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const date = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return date.toISOString().slice(0, 10);
}

function paymentAccount(reminder: Reminder) {
  const owner = paolaProperties.has(reminder.property_name)
    ? "Paola"
    : victoriaProperties.has(reminder.property_name)
      ? "Victoria"
      : null;
  if (!owner) return null;
  return {
    holder: paymentAccounts[owner].accountHolder,
    ...paymentAccounts[owner][reminder.currency],
  };
}

function emailHtml(reminder: Reminder) {
  const symbol = reminder.currency === "PEN" ? "S/" : "US$";
  const account = paymentAccount(reminder);
  const greeting = reminder.tenant_full_name
    ? `Hola, ${escapeHtml(reminder.tenant_full_name)}:`
    : "Hola:";
  const dueText = reminder.due_date === limaDate(0)
    ? "hoy vence"
    : "mañana vence";
  const accountHtml = account
    ? `<div style="margin-top:22px;padding:18px;background:#f9fafb;border-radius:10px"><p style="margin:0 0 10px"><b>Cuenta BCP a nombre de ${escapeHtml(account.holder)}</b></p><p style="margin:5px 0">Número de cuenta: ${escapeHtml(account.accountNumber)}</p><p style="margin:5px 0">CCI: ${escapeHtml(account.interbankNumber)}</p></div>`
    : "";

  return `<!doctype html><html lang="es"><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827"><div style="padding:32px 16px"><div style="max-width:620px;margin:auto;background:white;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden"><div style="padding:26px 30px;background:#111827;color:white"><strong style="letter-spacing:1.4px">PAOLA PROPIEDADES</strong><h1 style="font-size:24px;margin:10px 0 0">Recordatorio de pago</h1></div><div style="padding:28px 30px"><p>${greeting}</p><p>Te recordamos que ${dueText} una cuota de tu reserva.</p><div style="margin:22px 0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;padding:14px 0"><p><b>Propiedad:</b> ${escapeHtml(reminder.property_name)}</p><p><b>Reserva:</b> ${escapeHtml(reminder.reservation_number)}</p><p><b>Fecha de vencimiento:</b> ${escapeHtml(formatDate(reminder.due_date))}</p><p><b>Cuota acordada:</b> ${symbol} ${escapeHtml(formatMoney(reminder.installment_amount))}</p><p><b>Saldo pendiente:</b> ${symbol} ${escapeHtml(formatMoney(reminder.outstanding_balance))}</p></div>${accountHtml}<p style="margin-top:24px">Si ya realizaste el depósito, puedes ignorar este mensaje o enviarnos la constancia para registrarlo.</p><p>Gracias,<br><b>Paola Propiedades</b></p></div><div style="padding:18px 30px;background:#f9fafb;color:#6b7280;font-size:12px">Recordatorio automático según el cronograma acordado.</div></div></div></body></html>`;
}

Deno.serve(async (request) => {
  if (request.method !== "POST")
    return response({ error: "Método no permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const cronSecret = Deno.env.get("PAYMENT_REMINDER_CRON_SECRET");

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !cronSecret) {
    console.error("Falta configuración para los recordatorios de pago.");
    return response({ error: "Servicio no configurado." }, 500);
  }

  if (request.headers.get("x-cron-secret") !== cronSecret) {
    return response({ error: "No autorizado." }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const reminders: Reminder[] = [];

  // Tomorrow is the normal 24-hour reminder. Today also retries temporary failures.
  for (const dueDate of [limaDate(1), limaDate(0)]) {
    const claimToken = crypto.randomUUID();
    const { data, error } = await admin.rpc("claim_due_payment_reminders", {
      p_due_date: dueDate,
      p_claim_token: claimToken,
    });
    if (error) {
      console.error("No se pudieron reclamar recordatorios:", error.message);
      return response(
        { error: "No se pudieron preparar los recordatorios." },
        500,
      );
    }
    reminders.push(...((data ?? []) as Reminder[]));
  }

  let sent = 0;
  let failed = 0;

  for (const reminder of reminders) {
    const subject = `Recordatorio de pago - ${reminder.property_name} - ${reminder.reservation_number}`;
    let sendError = "";

    try {
      const resend = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `payment-reminder/${reminder.delivery_id}`,
        },
        body: JSON.stringify({
          from: "Paola Propiedades <reservas@paolapropiedades.com>",
          to: [reminder.tenant_email],
          subject,
          html: emailHtml(reminder),
        }),
      });
      if (!resend.ok)
        sendError = `Resend ${resend.status}: ${await resend.text()}`;
    } catch (error) {
      sendError =
        error instanceof Error
          ? error.message
          : "Error de conexión con Resend.";
    }

    if (sendError) {
      failed += 1;
      console.error(`Falló recordatorio ${reminder.delivery_id}: ${sendError}`);
      await admin
        .from("payment_reminder_deliveries")
        .update({
          claimed_at: null,
          claim_token: null,
          last_error: sendError.slice(0, 1000),
        })
        .eq("id", reminder.delivery_id)
        .eq("claim_token", reminder.claim_token);
      continue;
    }

    const { error: markError } = await admin
      .from("payment_reminder_deliveries")
      .update({
        sent_at: new Date().toISOString(),
        claimed_at: null,
        claim_token: null,
        last_error: null,
      })
      .eq("id", reminder.delivery_id)
      .eq("claim_token", reminder.claim_token)
      .is("sent_at", null);

    if (markError) {
      failed += 1;
      console.error(
        `No se marcó recordatorio ${reminder.delivery_id}: ${markError.message}`,
      );
    } else {
      sent += 1;
    }
  }

  return response(
    { ok: failed === 0, processed: reminders.length, sent, failed },
    failed ? 207 : 200,
  );
});
