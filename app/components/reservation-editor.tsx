"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

export type EditableReservation = {
  id: number;
  property_id: number;
  check_in: string;
  check_out: string;
  total_price: number;
  amount_paid: number;
  currency: "USD" | "PEN";
  payment_schedule: Array<{ due_date: string; amount: number }>;
  guarantee_amount: number;
  internal_alias: string | null;
  tenant_full_name: string | null;
  tenant_dni: string | null;
  tenant_address: string | null;
  tenant_phone: string | null;
  tenant_email: string | null;
};

type PropertyOption = { id: number; name: string };
type InstallmentInput = { due_date: string; amount: string };

function decimalIsValid(value: string) {
  return /^\d+(\.\d{1,2})?$/.test(value);
}

function ReservationEditorForm({
  reservation,
  properties,
  onSaved,
  onCancel,
}: {
  reservation: EditableReservation;
  properties: PropertyOption[];
  onSaved: (updated: Partial<EditableReservation>) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [alias, setAlias] = useState(reservation.internal_alias ?? "");
  const [propertyId, setPropertyId] = useState(String(reservation.property_id));
  const [checkIn, setCheckIn] = useState(reservation.check_in);
  const [checkOut, setCheckOut] = useState(reservation.check_out);
  const [total, setTotal] = useState(String(Number(reservation.total_price)));
  const [guarantee, setGuarantee] = useState(
    String(Number(reservation.guarantee_amount || 0)),
  );
  const [currency, setCurrency] = useState<"USD" | "PEN">(reservation.currency);
  const [fullName, setFullName] = useState(reservation.tenant_full_name ?? "");
  const [dni, setDni] = useState(reservation.tenant_dni ?? "");
  const [address, setAddress] = useState(reservation.tenant_address ?? "");
  const [phone, setPhone] = useState(reservation.tenant_phone ?? "");
  const [email, setEmail] = useState(reservation.tenant_email ?? "");
  const [schedule, setSchedule] = useState<InstallmentInput[]>(
    (reservation.payment_schedule ?? []).map((installment) => ({
      due_date: installment.due_date,
      amount: String(Number(installment.amount)),
    })),
  );

  const scheduleTotal = useMemo(
    () =>
      schedule.reduce(
        (sum, installment) => sum + Number(installment.amount || 0),
        0,
      ),
    [schedule],
  );

  async function save() {
    setMessage("");
    const normalizedAlias = alias.trim();
    const normalizedEmail = email.trim();
    const totalNumber = Number(total);
    const guaranteeNumber = Number(guarantee || 0);
    const amountPaid = Number(reservation.amount_paid || 0);

    if (!propertyId) return setMessage("Selecciona una propiedad.");
    if (!checkIn || !checkOut || checkOut <= checkIn)
      return setMessage("El check-out debe ser posterior al check-in.");
    if (normalizedAlias.length > 100)
      return setMessage("El alias puede tener hasta 100 caracteres.");
    if (!decimalIsValid(total) || totalNumber <= 0)
      return setMessage("Ingresa un total válido con hasta dos decimales.");
    if (totalNumber < amountPaid)
      return setMessage(
        `El total no puede ser menor que lo ya pagado (${currency === "PEN" ? "S/" : "US$"} ${amountPaid.toFixed(2)}).`,
      );
    if (!decimalIsValid(guarantee || "0") || guaranteeNumber < 0)
      return setMessage("Ingresa una garantía válida con hasta dos decimales.");
    if (currency !== reservation.currency && amountPaid > 0)
      return setMessage(
        "No puedes cambiar la moneda porque la reserva ya tiene pagos.",
      );
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
      return setMessage("Ingresa un correo válido.");
    if (
      fullName.trim().length > 150 ||
      address.trim().length > 300 ||
      phone.trim().length > 50 ||
      dni.trim().length > 30
    )
      return setMessage("Uno de los datos del cliente es demasiado largo.");
    if (schedule.length > 24)
      return setMessage("El cronograma admite hasta 24 cuotas.");
    if (
      schedule.some(
        (installment) =>
          !installment.due_date ||
          !decimalIsValid(installment.amount) ||
          Number(installment.amount) <= 0,
      )
    )
      return setMessage("Completa la fecha y un monto válido para cada cuota.");
    if (
      schedule.length > 0 &&
      Math.round(scheduleTotal * 100) !== Math.round(totalNumber * 100)
    )
      return setMessage(
        `Las cuotas deben sumar exactamente ${currency === "PEN" ? "S/" : "US$"} ${totalNumber.toFixed(2)}.`,
      );

    setSaving(true);
    const payload = {
      internal_alias: normalizedAlias || null,
      property_id: Number(propertyId),
      check_in: checkIn,
      check_out: checkOut,
      total_price: totalNumber,
      guarantee_amount: guaranteeNumber,
      currency,
      payment_schedule: schedule.map((installment) => ({
        due_date: installment.due_date,
        amount: Number(installment.amount),
      })),
      tenant_full_name: fullName.trim() || null,
      tenant_dni: dni.trim() || null,
      tenant_address: address.trim() || null,
      tenant_phone: phone.trim() || null,
      tenant_email: normalizedEmail || null,
    };

    const { data, error } = await supabase
      .from("reservations")
      .update(payload)
      .eq("id", reservation.id)
      .select(
        `
        property_id, check_in, check_out, nights, total_price, amount_paid,
        currency, payment_schedule, guarantee_amount, internal_alias,
        tenant_full_name, tenant_dni, tenant_address, tenant_phone, tenant_email
      `,
      )
      .single();

    if (error) {
      console.error("Reservation edit error:", error);
      setMessage(
        error.code === "23P01"
          ? "Las nuevas fechas se cruzan con otra reserva de esta propiedad."
          : `No se pudo guardar: ${error.message}`,
      );
      setSaving(false);
      return;
    }

    await onSaved(data as Partial<EditableReservation>);
    setSaving(false);
  }

  return (
    <section
      className="mt-5 rounded-xl border-2 border-gray-300 bg-gray-50 p-4"
      aria-label="Editar reserva"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-950">Editar reserva</h3>
          <p className="mt-1 text-xs text-gray-600">
            El enlace, los pagos y la lista de huéspedes se conservarán.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 px-3 font-bold text-gray-700"
        >
          Cancelar
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <label
            htmlFor={`edit-alias-${reservation.id}`}
            className="text-sm font-semibold text-gray-900"
          >
            Alias privado
          </label>
          <input
            id={`edit-alias-${reservation.id}`}
            value={alias}
            maxLength={100}
            onChange={(event) => setAlias(event.target.value)}
            placeholder="Ej. Familia López - Año Nuevo"
            className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3"
          />
          <p className="mt-1 text-xs text-gray-600">
            Solo aparece en el área administrativa.
          </p>
        </div>

        <div>
          <label className="text-sm font-semibold text-gray-900">
            Propiedad
          </label>
          <select
            value={propertyId}
            onChange={(event) => setPropertyId(event.target.value)}
            className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3"
          >
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold text-gray-900">
            Check-in
            <input
              type="date"
              value={checkIn}
              onChange={(event) => setCheckIn(event.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3"
            />
          </label>
          <label className="text-sm font-semibold text-gray-900">
            Check-out
            <input
              type="date"
              value={checkOut}
              onChange={(event) => setCheckOut(event.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-semibold text-gray-900">
            Moneda
            <select
              value={currency}
              onChange={(event) =>
                setCurrency(event.target.value as "USD" | "PEN")
              }
              disabled={Number(reservation.amount_paid) > 0}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 disabled:bg-gray-100"
            >
              <option value="USD">Dólares</option>
              <option value="PEN">Soles</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-gray-900">
            Total
            <input
              type="text"
              inputMode="decimal"
              value={total}
              onChange={(event) => setTotal(event.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3"
            />
          </label>
          <label className="text-sm font-semibold text-gray-900">
            Garantía
            <input
              type="text"
              inputMode="decimal"
              value={guarantee}
              onChange={(event) => setGuarantee(event.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3"
            />
          </label>
        </div>

        <div className="rounded-xl border border-gray-300 bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-bold">Cronograma de pagos</h4>
            <button
              type="button"
              onClick={() =>
                setSchedule((current) => [
                  ...current,
                  { due_date: "", amount: "" },
                ])
              }
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-bold"
            >
              + Cuota
            </button>
          </div>
          {schedule.length === 0 ? (
            <p className="mt-3 text-sm text-gray-600">
              Sin cronograma definido.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {schedule.map((installment, index) => (
                <div
                  key={index}
                  className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                >
                  <input
                    aria-label={`Fecha cuota ${index + 1}`}
                    type="date"
                    value={installment.due_date}
                    onChange={(event) =>
                      setSchedule((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, due_date: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className="rounded-lg border border-gray-300 p-2"
                  />
                  <input
                    aria-label={`Monto cuota ${index + 1}`}
                    type="text"
                    inputMode="decimal"
                    value={installment.amount}
                    onChange={(event) =>
                      setSchedule((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, amount: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="Monto"
                    className="rounded-lg border border-gray-300 p-2"
                  />
                  <button
                    type="button"
                    aria-label={`Quitar cuota ${index + 1}`}
                    onClick={() =>
                      setSchedule((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    className="min-h-11 rounded-lg border border-red-200 px-3 font-bold text-red-700"
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs font-semibold text-gray-600">
            Total programado: {currency === "PEN" ? "S/" : "US$"}{" "}
            {scheduleTotal.toFixed(2)}
          </p>
        </div>

        <div className="rounded-xl border border-gray-300 bg-white p-3">
          <h4 className="font-bold">Datos del cliente</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              Nombre
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                maxLength={150}
                className="mt-1 w-full rounded-lg border border-gray-300 p-2"
              />
            </label>
            <label className="text-sm font-semibold">
              DNI
              <input
                value={dni}
                onChange={(event) => setDni(event.target.value)}
                maxLength={30}
                className="mt-1 w-full rounded-lg border border-gray-300 p-2"
              />
            </label>
            <label className="text-sm font-semibold">
              Celular
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                maxLength={50}
                className="mt-1 w-full rounded-lg border border-gray-300 p-2"
              />
            </label>
            <label className="text-sm font-semibold">
              Correo
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 p-2"
              />
            </label>
            <label className="text-sm font-semibold sm:col-span-2">
              Dirección
              <textarea
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                maxLength={300}
                rows={2}
                className="mt-1 w-full rounded-lg border border-gray-300 p-2"
              />
            </label>
          </div>
        </div>
      </div>

      {message && (
        <p role="alert" className="mt-4 text-sm font-semibold text-red-700">
          {message}
        </p>
      )}
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-4 w-full rounded-lg bg-gray-950 px-5 py-3 font-bold text-white disabled:opacity-50"
      >
        {saving ? "Guardando..." : "Guardar cambios"}
      </button>
    </section>
  );
}

export function ReservationEditor({
  reservation,
  properties,
  onSaved,
}: {
  reservation: EditableReservation;
  properties: PropertyOption[];
  onSaved: (updated: Partial<EditableReservation>) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-5 w-full rounded-lg border border-gray-400 bg-white px-5 py-3 font-bold text-gray-950 hover:bg-gray-100"
      >
        Editar reserva
      </button>
    );
  }

  return (
    <ReservationEditorForm
      key={`${reservation.id}-${reservation.check_in}-${reservation.check_out}-${reservation.total_price}-${reservation.internal_alias ?? ""}`}
      reservation={reservation}
      properties={properties}
      onCancel={() => setEditing(false)}
      onSaved={async (updated) => {
        await onSaved(updated);
        setEditing(false);
      }}
    />
  );
}
