// ===== Types =====

export interface CostviserChecksResponse {
  items: CheckItem[]
}

export interface CheckItem {
  actions: Actions
  id: number
  code: string
  check_type: string
  created_at: string // ISO
  num: number
  quantity: number
  discount: number
  total: number
  error: string | null
  comment: string | null
  shift: number
  fields: { KKT: KKT }
  change: number
  total_payments: number
  payment_source: string
  employee_ids: number[]
  turn_id: number
  cashbox_id: number
  cashier_id: number
  device_id: number
  department_id: number
  card_id: number | null
  check_id: number | null
  card: unknown | null
  cashier: Cashier
  vat_amount: number
}

export interface Actions {
  read: boolean
  edit: boolean
  destroy: boolean
}

export interface Cashier {
  id: number
  name: string
}

export interface KKT {
  fn: string
  inn: string
  num: number
  sno: string
  date: string // ISO
  flag: string
  total: number
  kkt_rn: string
  "Сумма НДС": string
}

// ===== Type guards =====

export const isCostviserChecksResponse = (
  v: unknown
): v is CostviserChecksResponse =>
  isObject(v) &&
  Array.isArray((v as any).items) &&
  (v as any).items.every(isCheckItem)

export const isCheckItem = (v: unknown): v is CheckItem => {
  if (!isObject(v)) return false
  return (
    isActions((v as any).actions) &&
    isNumber((v as any).id) &&
    isString((v as any).code) &&
    isString((v as any).check_type) &&
    isString((v as any).created_at) &&
    isNumber((v as any).num) &&
    isNumber((v as any).quantity) &&
    isNumber((v as any).discount) &&
    isNumber((v as any).total) &&
    isNullableString((v as any).error) &&
    isNullableString((v as any).comment) &&
    isNumber((v as any).shift) &&
    isObject((v as any).fields) &&
    isKKT((v as any).fields?.KKT) &&
    isNumber((v as any).change) &&
    isNumber((v as any).total_payments) &&
    isString((v as any).payment_source) &&
    Array.isArray((v as any).employee_ids) &&
    (v as any).employee_ids.every(isNumber) &&
    isNumber((v as any).turn_id) &&
    isNumber((v as any).cashbox_id) &&
    isNumber((v as any).cashier_id) &&
    isNumber((v as any).device_id) &&
    isNumber((v as any).department_id) &&
    isNullableNumber((v as any).card_id) &&
    isNullableNumber((v as any).check_id) &&
    (isObject((v as any).card) || (v as any).card === null) &&
    isCashier((v as any).cashier) &&
    isNumber((v as any).vat_amount)
  )
}

export const isActions = (v: unknown): v is Actions =>
  isObject(v) &&
  typeof (v as any).read === "boolean" &&
  typeof (v as any).edit === "boolean" &&
  typeof (v as any).destroy === "boolean"

export const isCashier = (v: unknown): v is Cashier =>
  isObject(v) &&
  isNumber((v as any).id) &&
  isString((v as any).name)

export const isKKT = (v: unknown): v is KKT =>
  isObject(v) &&
  isString((v as any).fn) &&
  isString((v as any).inn) &&
  isNumber((v as any).num) &&
  isString((v as any).sno) &&
  isString((v as any).date) &&
  isString((v as any).flag) &&
  isNumber((v as any).total) &&
  isString((v as any).kkt_rn) &&
  isString((v as any)["Сумма НДС"])

// ===== Small helpers =====

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object"

const isNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v)

const isString = (v: unknown): v is string => typeof v === "string"

const isNullableString = (v: unknown): v is string | null =>
  v === null || typeof v === "string"

const isNullableNumber = (v: unknown): v is number | null =>
  v === null || (typeof v === "number" && Number.isFinite(v))
