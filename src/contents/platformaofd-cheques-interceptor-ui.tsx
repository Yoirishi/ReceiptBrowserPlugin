import type { PlasmoCSConfig } from "plasmo"
import type { CSSProperties } from "react"


export const config: PlasmoCSConfig = {
  matches: ["https://lk.platformaofd.ru/web/auth/cheques/search*"],
  run_at: "document_idle",
};

window.addEventListener("ext:net", event => {
  // @ts-ignore
  console.log(event.detail)
}, false);

const QueryXhrForCheques = () => {

  return (<div
    style={{
      padding: 8,
      background: "#999",
      position: "fixed",
      top: 10,
      right: 10
    }}>
    <button style={btn} onClick={() => {}}>Query!</button>
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
