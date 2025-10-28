import type { PlasmoCSConfig } from "plasmo"
import { useEffect, useState, type CSSProperties } from "react"

import type { NetEvent } from "../utils/XhrRequestInterceptor"
import { tryCheckedCast } from "~src/utils/runtimeCheckedCast"
import  { type CostviserChecksResponse, isCostviserChecksResponse } from "~src/utils/isCostviserChecksResponse"
import { mapCostviserToCheques } from "~src/utils/mapCheques"
import { useCostviserListener } from "~src/utils/useCostviserListener"
// import { parseCheques } from "~src/lib/cheque-parser.platformaofd" // если понадобится

export const config: PlasmoCSConfig = {
  matches: [
    "https://costviser.ru/*",
    "https://*.costviser.ru/*"
  ],
  run_at: "document_idle"
}

const isChecksRoute = () => location.hash.startsWith("#/checks")

const QueryXhrForCheques = () => {
  const [readyToParse, setReadyToParse] = useState(false)
  const [active, setActive] = useState(isChecksRoute())

  useEffect(() => {
    const onRoute = () => setActive(isChecksRoute())

    window.addEventListener("hashchange", onRoute)
    window.addEventListener("locationchange", onRoute as EventListener)
    window.addEventListener("popstate", onRoute)

    // синхронизация на момент маунта
    onRoute()

    return () => {
      window.removeEventListener("hashchange", onRoute)
      window.removeEventListener("locationchange", onRoute as EventListener)
      window.removeEventListener("popstate", onRoute)
    }
  }, [])

  const { parsed } = useCostviserListener(readyToParse)

  const onStopParse = () => {
    setReadyToParse(false)
  }

  if (!active) return null

  return (
    <div
      style={{
        padding: 8,
        background: "#999",
        position: "fixed",
        top: 10,
        right: 10,
        zIndex: 2147483647
      }}>
      {
        readyToParse ?
          <div>
            <button style={btn} onClick={onStopParse}>Stop parse</button>
            <div>parsed: {parsed}</div>
          </div>
          :
          <div>
            <button style={btn} onClick={() => {setReadyToParse(true)}}>Start parse</button>
          </div>
      }

    </div>
  )
}

const btn: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600
}

export default QueryXhrForCheques
