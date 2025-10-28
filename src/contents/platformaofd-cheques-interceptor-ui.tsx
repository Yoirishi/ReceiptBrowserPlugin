import type { PlasmoCSConfig } from "plasmo";
import { useEffect, useState, type CSSProperties } from "react";



import type { NetEvent } from "../utils/XhrRequestInterceptor";
import { parseCheques } from "~src/lib/cheque-parser.platformaofd"


export const config: PlasmoCSConfig = {
  matches: ["https://lk.platformaofd.ru/web/auth/cheques/search*"],
  run_at: "document_idle",
};


const QueryXhrForCheques = () => {

  const [parsed, setParsed] = useState(0)

  const chequesHandler = async (event: { detail: NetEvent }) => {
    const rows = parseCheques(event.detail.body ?? "")
    setParsed(rows.length)
    await chrome.runtime.sendMessage({
      type: "save-cheques",
      rows,
      meta: { source: "PlatformaOFD" }
    })
  }



  useEffect(() => {
    window.addEventListener("ext:net", event => {
      // @ts-ignore
      chequesHandler(event)
    }, false);

    return window.removeEventListener("ext:net", event => {
      // @ts-ignore
      chequesHandler(event)
    }, false);
  }, [])

  return (<div
    style={{
      padding: 8,
      background: "#999",
      position: "fixed",
      top: 10,
      right: 10
    }}>
    <button style={btn} onClick={() => {}}>parsed: {parsed}</button>
  </div>)
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
