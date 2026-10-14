const DAY_MS = 86_400_000

export type MaintenanceCalculation = {
  amount: number
  monthlyRate: number
  newYearExempt: boolean
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  )

  return Number.isNaN(date.getTime()) ? null : date
}

function isNewYearStay(checkIn: Date, checkOut: Date) {
  for (
    let year = checkIn.getUTCFullYear() - 1;
    year <= checkOut.getUTCFullYear();
    year += 1
  ) {
    const exemptionStart = new Date(Date.UTC(year, 11, 28))
    const exemptionEnd = new Date(Date.UTC(year + 1, 0, 4))

    if (checkIn < exemptionEnd && checkOut > exemptionStart) return true
  }

  return false
}

export function calculateMaintenance(
  propertyName: string,
  checkInValue: string,
  checkOutValue: string
): MaintenanceCalculation {
  if (!propertyName.trim()) {
    return { amount: 0, monthlyRate: 0, newYearExempt: false }
  }

  const monthlyRate =
    propertyName === 'Dpto 301' || propertyName === 'Dpto 305' ? 450 : 700
  const checkIn = parseDate(checkInValue)
  const checkOut = parseDate(checkOutValue)

  if (!checkIn || !checkOut || checkOut <= checkIn) {
    return { amount: 0, monthlyRate, newYearExempt: false }
  }

  if (isNewYearStay(checkIn, checkOut)) {
    return { amount: 0, monthlyRate, newYearExempt: true }
  }

  let amount = 0
  for (
    let night = new Date(checkIn);
    night < checkOut;
    night = new Date(night.getTime() + DAY_MS)
  ) {
    const daysInMonth = new Date(
      Date.UTC(night.getUTCFullYear(), night.getUTCMonth() + 1, 0)
    ).getUTCDate()
    amount += monthlyRate / daysInMonth
  }

  return {
    amount: Math.round((amount + Number.EPSILON) * 100) / 100,
    monthlyRate,
    newYearExempt: false,
  }
}
