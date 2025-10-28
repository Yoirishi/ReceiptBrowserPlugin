import type { PlasmoCSConfig } from "plasmo";
import { useEffect, useState, type CSSProperties } from "react";



import type { NetEvent } from "../utils/XhrRequestInterceptor";
import { parseCheques } from "~src/lib/cheque-parser.platformaofd"
import { usePlatformaOfdListener } from "~src/utils/usePlatformaOfdListener"


export const config: PlasmoCSConfig = {
  matches: ["https://lk.platformaofd.ru/web/auth/cheques/search*"],
  run_at: "document_idle",
};


const QueryXhrForCheques = () => {

  const [readyToParse, setReadyToParse] = useState(false)

  const {parsed} = usePlatformaOfdListener(readyToParse)

  const onStopParse = () => {
    setReadyToParse(false)
  }

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
