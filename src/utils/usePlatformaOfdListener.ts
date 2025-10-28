;
// usePlatformaOfdListener.ts
import { useCallback, useEffect, useRef, useState } from "react"

import { parseCheques, type Cheque } from "~src/lib/cheque-parser.platformaofd"
import type { NetEvent } from "~src/utils/XhrRequestInterceptor";


type Options = {
  sourceName?: string
  onRows?: (rows: Cheque[]) => void
}

export function usePlatformaOfdListener(readyToParse: boolean, opts: Options = {}) {
  const { sourceName = "PlatformaOFD", onRows } = opts

  const [parsed, setParsed] = useState(0)

  // держим актуальные значения в ref, чтобы слушатель был стабильным
  const readyRef = useRef(readyToParse)
  const sourceRef = useRef(sourceName)
  const onRowsRef = useRef(onRows)

  // обновляем refs на каждом рендере (без лишних пересозданий слушателя)
  readyRef.current = readyToParse
  sourceRef.current = sourceName
  onRowsRef.current = onRows

  const listener = useCallback((evt: Event) => {
    if (!readyRef.current) return

    const { detail } = evt as CustomEvent<NetEvent>
    const payload = detail?.body ?? ""

    try {
      const rows = parseCheques(payload) ?? []
      setParsed(Array.isArray(rows) ? rows.length : 0)

      onRowsRef.current?.(rows)

      chrome.runtime.sendMessage({
        type: "save-cheques",
        rows,
        meta: { source: sourceRef.current }
      }).catch(() => { /* noop */ })
    } catch (e) {

      console.warn("PlatformaOFD parse error:", e)
    }
  }, [])

  useEffect(() => {
    window.addEventListener("ext:net", listener as EventListener)
    return () => {
      window.removeEventListener("ext:net", listener as EventListener)
    }
  }, [listener])


  useEffect(() => {
    if (!readyToParse) setParsed(0)
  }, [readyToParse])

  return { parsed }
}
