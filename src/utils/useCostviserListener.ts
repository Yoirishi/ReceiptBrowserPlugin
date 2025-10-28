import { useEffect, useRef, useState } from "react";
import { isCostviserChecksResponse, type CostviserChecksResponse } from "~src/utils/isCostviserChecksResponse";
import { mapCostviserToCheques } from "~src/utils/mapCheques"
import { tryCheckedCast } from "~src/utils/runtimeCheckedCast"
import type { NetEvent } from "~src/utils/XhrRequestInterceptor"


const tryParseJson = (v: unknown): unknown => {
  if (typeof v !== "string") return v
  try { return JSON.parse(v) } catch { return v }
}

export function useCostviserListener(readyToParse: boolean) {
  const [parsed, setParsed] = useState(0)

  const readyRef = useRef(readyToParse)
  useEffect(() => { readyRef.current = readyToParse }, [readyToParse])

  const listener = (evt: Event) => {
    if (!readyRef.current) return

    const { detail } = evt as CustomEvent<NetEvent>
    const unknownBody = tryParseJson(detail?.body)
    const body = tryCheckedCast<CostviserChecksResponse>(
      unknownBody,
      isCostviserChecksResponse,
      { onFail: (m) => console.warn(m) }
    )
    if (!body) {
      console.log("Could not find costviser details")
      return
    }

    const rows = mapCostviserToCheques(body)
    setParsed(Array.isArray(rows) ? rows.length : 0)

    chrome.runtime.sendMessage({
      type: "save-cheques",
      rows,
      meta: { source: "Costviser" }
    }).catch(() => {/* noop */})
  }

  useEffect(() => {
    window.addEventListener("ext:net", listener as EventListener)
    return () => {
      window.removeEventListener("ext:net", listener as EventListener)
    }
  }, [])

  return { parsed }
}
