import {
  BRIDGE_READY,
  BRIDGE_REQUEST,
  isReceiptResponse,
  NET_EVENT,
  type ReceiptSource
} from "~src/lib/receiptProtocol"
import {
  createNetInterceptor,
  type NetEvent
} from "~src/utils/XhrRequestInterceptor"

export function startNetBridge(source: ReceiptSource) {
  const page = window as unknown as Record<string, unknown>
  const guard = `__receiptParserBridge_${source}`
  if (page[guard]) return
  page[guard] = true

  // The first response can arrive before the isolated UI has mounted.
  let latest: NetEvent | null = null
  const send = (event: NetEvent) => {
    window.dispatchEvent(
      new CustomEvent(NET_EVENT, { detail: { source, event } })
    )
  }
  window.addEventListener(BRIDGE_REQUEST, (event) => {
    const request = (event as CustomEvent).detail
    if (request?.source !== source) return
    window.dispatchEvent(new CustomEvent(BRIDGE_READY, { detail: { source } }))
    if (request.replay && latest) send({ ...latest, replayed: true })
  })

  createNetInterceptor({
    maxBodyChars: 5_000_000,
    include: { xhr: true, fetch: true, jquery: false },
    // Filter before cloning/reading bodies; navigation doesn't toggle hooks.
    shouldCapture: (url) => isReceiptResponse(source, url),
    onIgnoredResponse: send,
    onEvent: (event) => {
      latest = event
      send(event)
    }
  })
}
