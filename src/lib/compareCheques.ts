import type { UIRow } from "~src/lib/receiptRows"

export interface UnmatchedCheque {
  row: UIRow
  reason: string
}

export interface ChequeComparison {
  pairs: { left: UIRow; right: UIRow }[]
  onlyLeft: UnmatchedCheque[]
  onlyRight: UnmatchedCheque[]
}

const normalize = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru")

export function amountInKopecks(value: string): number | null {
  const cleaned = value.replace(/\s/g, "").replace(/(?:₽|руб\.?|р\.?)$/iu, "")
  if (!/^[+-]?\d+(?:[.,]\d{1,2})?$/.test(cleaned)) return null
  const negative = cleaned.startsWith("-")
  const [whole, fraction = ""] = cleaned
    .replace(/^[+-]/, "")
    .replace(",", ".")
    .split(".")
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  return Number.isSafeInteger(cents) ? (negative ? -cents : cents) : null
}

function dateToMinute(value: string): string | null {
  const trimmed = value.trim()
  const ru = trimmed.match(
    /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::\d{2})?$/
  )
  const iso = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/
  )
  if (!ru && !iso) return null
  const [y, m, d, h, minute] = ru
    ? [ru[3], ru[2], ru[1], ru[4], ru[5]].map(Number)
    : iso!.slice(1, 6).map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, h, minute))
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d ||
    h > 23 ||
    minute > 59
  )
    return null
  return `${y}-${m}-${d} ${h}:${minute}`
}

function matchInfo(row: UIRow): { key: string | null; reason: string } {
  const date = dateToMinute(row.date)
  const amount = amountInKopecks(row.amount)
  const shift = normalize(row.shift).replace(/^0+(?=\d)/, "")
  const sign = normalize(row.sign)
  const payment = normalize(row.paymentType)
  const missing: string[] = []
  if (!date) missing.push("дата/время")
  if (amount === null) missing.push("сумма")
  if (!shift) missing.push("смена")
  if (!sign) missing.push("операция")
  if (!payment) missing.push("оплата")
  return missing.length
    ? { key: null, reason: `Не распознаны поля: ${missing.join(", ")}` }
    : {
        key: JSON.stringify([date, amount, shift, sign, payment]),
        reason: "Пара не найдена"
      }
}

// Multiset comparison: one row can be used in exactly one pair. IDs and source
// names belong to separate systems and do not identify a shared receipt.
export function compareCheques(
  left: UIRow[],
  right: UIRow[]
): ChequeComparison {
  const rightInfo = right.map(matchInfo)
  const buckets = new Map<string, { indices: number[]; used: number }>()
  rightInfo.forEach(({ key }, index) => {
    if (key === null) return
    const bucket = buckets.get(key) ?? { indices: [], used: 0 }
    bucket.indices.push(index)
    buckets.set(key, bucket)
  })
  const usedRight = new Set<number>()
  const result: ChequeComparison = { pairs: [], onlyLeft: [], onlyRight: [] }
  for (const row of left) {
    const { key, reason } = matchInfo(row)
    const bucket = key === null ? undefined : buckets.get(key)
    if (bucket && bucket.used < bucket.indices.length) {
      const index = bucket.indices[bucket.used++]
      usedRight.add(index)
      result.pairs.push({ left: row, right: right[index] })
    } else result.onlyLeft.push({ row, reason })
  }
  right.forEach((row, index) => {
    if (!usedRight.has(index))
      result.onlyRight.push({ row, reason: rightInfo[index].reason })
  })
  return result
}

export function summarizeCheques(rows: UIRow[]) {
  return rows.reduce(
    (summary, row) => {
      const cents = amountInKopecks(row.amount)
      if (cents === null) {
        summary.invalidAmounts++
        return summary
      }
      summary.total += cents
      const payment = normalize(row.paymentType)
      if (payment === "оплата картой") summary.card += cents
      if (payment === "наличными") summary.cash += cents
      return summary
    },
    { count: rows.length, total: 0, card: 0, cash: 0, invalidAmounts: 0 }
  )
}

export function receiptDetailsUrl(row: UIRow): string | null {
  if (!row.detailsUrl) return null
  try {
    const url =
      row.source === "PlatformaOFD"
        ? new URL(row.detailsUrl, "https://lk.platformaofd.ru")
        : new URL(row.detailsUrl)
    return ["http:", "https:"].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}
