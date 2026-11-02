export type ReceiptSource = "PlatformaOFD" | "Costviser"

export interface DiagnosticEntry {
  time: string
  level: "info" | "warn" | "error"
  message: string
}

export interface ParserStatus {
  source: ReceiptSource
  running: boolean
  interceptorReady: boolean
  datasetId: string | null
  saved: number
  responses: number
  message: string
  logs: DiagnosticEntry[]
}

export type ParserReply = { ok: boolean; error?: string; status?: ParserStatus }

export const NET_EVENT = "receipt-parser:net"
export const BRIDGE_REQUEST = "receipt-parser:bridge-request"
export const BRIDGE_READY = "receipt-parser:bridge-ready"

export function receiptSource(url: string): ReceiptSource | null {
  try {
    const { hostname, protocol } = new URL(url)
    if (protocol !== "https:") return null
    if (hostname === "lk.platformaofd.ru") return "PlatformaOFD"
    if (
      ["costviser.ru", "4ait.ru"].some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
      )
    ) {
      return "Costviser"
    }
  } catch {}
  return null
}

export function isReceiptPage(source: ReceiptSource, url: string): boolean {
  try {
    const parsed = new URL(url)
    return source === "Costviser"
      ? /(?:^|\/)checks(?:[/?#]|$)/i.test(
          parsed.hash.replace(/^#\/?/, "/") || parsed.pathname
        )
      : /\/cheques(?:\/|$)/i.test(parsed.pathname + parsed.hash)
  } catch {
    return false
  }
}

export function isReceiptResponse(
  source: ReceiptSource,
  url?: string
): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url, "https://relative.invalid")
    return source === "Costviser"
      ? /(?:^|\/)checks(?:\.json)?\/?$/i.test(parsed.pathname)
      : /(?:^|\/)cheques(?:\/|\.|$)/i.test(parsed.pathname)
  } catch {
    return false
  }
}

// Query parameters and fragments may contain login tokens or search values.
export function diagnosticUrl(url: string): string {
  try {
    const parsed = new URL(url, "https://relative.invalid")
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return "неизвестный адрес"
  }
}
