import type { DatasetRow } from "~src/lib/datasetsRepo"

export type UIRow = {
  id: string
  date: string
  deviceName: string
  amount: string
  sign: string
  paymentType: string
  fnsStatus: string
  crptStatus: string
  sale: string
  shift: string
  detailsUrl: string
  ts: number
  source?: string
  batch?: string
}

const text = (value: unknown) => (value == null ? "" : String(value))

export function rowFromDatasetRow(row: DatasetRow): UIRow {
  const data = row.data || {}
  return {
    id: text(data.id ?? data.key),
    date: text(data.date),
    deviceName: text(data.deviceName),
    amount: text(data.amount),
    sign: text(data.sign),
    paymentType: text(data.paymentType),
    fnsStatus: text(data.fnsStatus),
    crptStatus: text(data.crptStatus),
    sale: text(data.sale),
    shift: text(data.shift),
    detailsUrl: text(data.detailsUrl),
    ts: row.ts || 0,
    source: row.source,
    batch: row.batch
  }
}
