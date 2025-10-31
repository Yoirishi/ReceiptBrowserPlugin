export function parseAmountRu(input: string | number | null | undefined): number {
  if (typeof input === "number") return Number.isFinite(input) ? input : 0
  if (!input) return 0

  // убираем все пробелы (в т.ч. NBSP/узкие)
  const s = String(input).replace(/[\s\u00A0\u202F\u2009]/gu, "")
  // берём число вида 1234 или 1234,56 / 1234.56 (с минусом тоже)
  const m = s.match(/-?\d+(?:[.,]\d+)?/u)
  if (!m) return 0

  const n = parseFloat(m[0].replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

export const parseAmountRuOr = (v: unknown, fallback = 0) =>
  (n => (Number.isFinite(n) ? n : fallback))(parseAmountRu(String(v)))
