import { useEffect, useState, type CSSProperties } from "react"

import { isReceiptPage, type ReceiptSource } from "~src/lib/receiptProtocol"
import { useReceiptParser } from "~src/utils/useReceiptParser"

export default function ParserPanel({ source }: { source: ReceiptSource }) {
  const parser = useReceiptParser(source)
  const [active, setActive] = useState(isReceiptPage(source, location.href))
  const [copyMessage, setCopyMessage] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const check = () => setActive(isReceiptPage(source, location.href))
    window.addEventListener("hashchange", check)
    window.addEventListener("popstate", check)
    // pushState/replaceState don't cross JS worlds as custom browser events.
    const timer = setInterval(check, 1000)
    return () => {
      clearInterval(timer)
      window.removeEventListener("hashchange", check)
      window.removeEventListener("popstate", check)
    }
  }, [source])

  if (!active && !parser.status.running) return null
  const toggle = async () => {
    setBusy(true)
    try {
      if (parser.status.running) parser.stop()
      else await parser.start()
    } finally {
      setBusy(false)
    }
  }
  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(parser.status, null, 2)
      )
      setCopyMessage("Журнал скопирован")
    } catch {
      setCopyMessage("Не удалось скопировать. Выделите текст журнала ниже")
    }
  }

  return (
    <aside style={panel} aria-label="Receipt Parser">
      <strong>
        Receipt Parser · {source === "Costviser" ? "Trade" : "Платформа ОФД"}
      </strong>
      <div style={{ margin: "8px 0" }}>
        <button style={button} onClick={toggle} disabled={busy}>
          {busy
            ? "Подключение…"
            : parser.status.running
              ? "Остановить сбор"
              : "Начать сбор"}
        </button>
      </div>
      <div>
        Перехватчик:{" "}
        {parser.status.interceptorReady ? "подключён" : "нет связи"}
      </div>
      <div>
        Ответов API: {parser.status.responses} · Сохранено:{" "}
        {parser.status.saved}
      </div>
      <p role="status" style={{ margin: "8px 0", overflowWrap: "anywhere" }}>
        {parser.status.message}
      </p>
      <details>
        <summary style={{ cursor: "pointer" }}>
          Диагностика ({parser.status.logs.length})
        </summary>
        <button style={{ ...button, margin: "8px 0" }} onClick={copyLogs}>
          Копировать журнал
        </button>
        {copyMessage && <div>{copyMessage}</div>}
        <pre
          style={{
            maxHeight: 240,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            userSelect: "text",
            fontSize: 11
          }}>
          {parser.status.logs
            .map((entry) => `${entry.time} [${entry.level}] ${entry.message}`)
            .join("\n")}
        </pre>
      </details>
    </aside>
  )
}

const panel: CSSProperties = {
  position: "fixed",
  top: 12,
  right: 12,
  zIndex: 2147483647,
  width: 320,
  padding: 14,
  borderRadius: 12,
  background: "#fff",
  color: "#111827",
  boxShadow: "0 4px 24px #0003",
  border: "1px solid #d1d5db",
  font: "13px/1.5 system-ui, sans-serif"
}
const button: CSSProperties = {
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
  cursor: "pointer"
}
