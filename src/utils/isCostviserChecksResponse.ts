// Validate only fields used by the mapper, not optional cashier/VAT metadata.
export interface CostviserChecksResponse {
  items: CheckItem[]
}

export interface CheckItem {
  id: number | string
  num?: number | string
  check_type: string
  created_at?: string
  quantity?: number | string
  total: number | string
  shift: number | string
  payment_source: string
  device_id?: number | string
  fields?: { KKT?: { date?: string; kkt_rn?: string } | null } | null
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
const isNumberLike = (value: unknown) =>
  (typeof value === "number" && Number.isFinite(value)) ||
  (typeof value === "string" &&
    value.trim() !== "" &&
    Number.isFinite(Number(value)))

export function checkItemErrors(value: unknown): string[] {
  if (!isObject(value)) return ["item: ожидался объект"]
  const errors: string[] = []
  if (
    !(typeof value.id === "string" && value.id.trim()) &&
    !isNumberLike(value.id)
  )
    errors.push("id")
  for (const field of ["total", "shift"] as const) {
    if (!isNumberLike(value[field])) errors.push(field)
  }
  for (const field of ["check_type", "payment_source"] as const) {
    if (typeof value[field] !== "string") errors.push(field)
  }
  if (value.fields != null && !isObject(value.fields)) errors.push("fields")
  const fields = isObject(value.fields) ? value.fields : null
  if (fields?.KKT != null && !isObject(fields.KKT)) errors.push("fields.KKT")
  const kkt = isObject(fields?.KKT) ? fields.KKT : null
  if (kkt?.date != null && typeof kkt.date !== "string")
    errors.push("fields.KKT.date")
  if (kkt?.kkt_rn != null && typeof kkt.kkt_rn !== "string")
    errors.push("fields.KKT.kkt_rn")
  if (typeof value.created_at !== "string" && typeof kkt?.date !== "string")
    errors.push("created_at / fields.KKT.date")
  return errors
}

export const isCheckItem = (value: unknown): value is CheckItem =>
  checkItemErrors(value).length === 0
export const isCostviserChecksResponse = (
  value: unknown
): value is CostviserChecksResponse =>
  isObject(value) &&
  Array.isArray(value.items) &&
  value.items.every(isCheckItem)

export function parseCostviserResponse(
  payload: string
): CostviserChecksResponse {
  let value: unknown
  try {
    value = JSON.parse(payload)
  } catch {
    throw new Error("Ответ Trade не является JSON (возможна страница входа)")
  }
  if (!isObject(value) || !Array.isArray(value.items)) {
    throw new Error("Изменился формат Trade: ожидался объект с массивом items")
  }
  for (let index = 0; index < value.items.length; index++) {
    const errors = checkItemErrors(value.items[index])
    if (errors.length)
      throw new Error(
        `Trade: items[${index}], некорректные поля: ${errors.join(", ")}`
      )
  }
  return value as unknown as CostviserChecksResponse
}
