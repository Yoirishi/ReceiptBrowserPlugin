import React from "react";
import ComboBox from "~src/components/ComboBox";
import { datasetsRepo, type Dataset } from "~src/lib/datasetsRepo";
import { receiptSource, type ParserReply, type ParserStatus } from "~src/lib/receiptProtocol"


// domains where parsing is enabled (tune later)
const SUPPORTED_HOSTS = [
  "platformaofd.ru",
  "costviser.ru",
  "4ait.ru"
]

export default function Popup() {
  const [list, setList] = React.useState<Dataset[]>([])
  const [active, setActive] = React.useState<Dataset | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const [parserStatus, setParserStatus] = React.useState<ParserStatus | null>(null)
  const [copyMessage, setCopyMessage] = React.useState("")
  const [hostInfo, setHostInfo] = React.useState<{ host: string | null; supported: boolean; tabId: number | null }>({ host: null, supported: false, tabId: null })

  React.useEffect(() => {
    void refresh()
  }, [])

  async function refresh() {
    const ds = await datasetsRepo.ensureScoped();
    const [items, id] = await Promise.all([datasetsRepo.list(), datasetsRepo.getActiveId()])
    setList(items)
    setActive(id ? items.find((x) => x.id === id) ?? null : null)
    await detectHost()
  }

  async function detectHost() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const url = tab?.url || null
      let host: string | null = null
      let supported = false
      if (url) {
        try {
          host = new URL(url).hostname
          supported = receiptSource(url) !== null
        } catch {}
      }
      setHostInfo({ host, supported, tabId: tab?.id ?? null })
      if (supported && tab?.id !== undefined) {
        try {
          const reply: ParserReply = await chrome.tabs.sendMessage(tab.id, { type: "PARSER_STATUS" })
          setParserStatus(reply.status ?? null)
        } catch {
          setError("Нет связи со скриптом страницы. Обновите вкладку после установки или обновления расширения")
        }
      }
    } catch (e) {
      console.warn("detectHost error", e)
      setHostInfo({ host: null, supported: false, tabId: null })
    }
  }

  const onPick = async (s: Dataset | null) => {
    const ds = await datasetsRepo.ensureScoped();
    await datasetsRepo.setActiveId(s?.id ?? null)
    await refresh()
  }

  const openSelectionsTab = () => chrome.tabs.create({ url: chrome.runtime.getURL("tabs/datasets.html") })
  const openViewer = () => chrome.tabs.create({ url: chrome.runtime.getURL("tabs/viewer.html" + (active ? `?sid=${active.id}` : "")) })
  const openCompare = () => chrome.tabs.create({ url: chrome.runtime.getURL("tabs/compare.html") }) // placeholder for future

  const startParse = async () => {
    setBusy(true)
    setError("")
    try {
      if (hostInfo.tabId === null) throw new Error("Нет активной вкладки")
      const res: ParserReply = await chrome.tabs.sendMessage(hostInfo.tabId, {
        type: parserStatus?.running ? "STOP_PARSE" : "START_PARSE",
        datasetId: active?.id
      })
      if (res.status) setParserStatus(res.status)
      if (!res?.ok) throw new Error(res?.error || "Скрипт страницы не ответил")
    } catch (e) {
      const message = e instanceof Error ? e.message : "Ошибка запуска"
      setError(/receiving end|connection|context invalidated/i.test(message)
        ? "Нет связи со скриптом страницы. Обновите вкладку и повторите запуск"
        : message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: 14, width: 340, fontFamily: "system-ui, Segoe UI, Roboto, Arial, sans-serif", color: "#111" }}>
      <h3 style={{ margin: 0, marginBottom: 8 }}>Receipt Parser</h3>

      {/* Active dataset chip */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: "#666" }}>Active dataset:</div>
        <div style={{
          maxWidth: 200,
          padding: "4px 8px",
          borderRadius: 999,
          border: "1px solid #e5e7eb",
          background: "#fff",
          boxShadow: "0 2px 6px rgba(0,0,0,.06)",
          fontSize: 12,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis"
        }} title={active?.name || "None"}>
          {active ? active.name : "None"}
        </div>
      </div>

      {/* Quick switch via ComboBox */}
      <div style={card}>
        <div style={{ marginBottom: 8, color: "#666", fontSize: 12 }}>Switch dataset</div>
        <ComboBox<Dataset>
          items={list}
          getId={(s) => s.id}
          getText={(s) => s.name}
          value={active}
          onChange={onPick}
          searchable
          renderEmpty={(q) => <div style={{ color: "#9CA3AF" }}>Нет выборок для “{q}”</div>}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
          <button style={btn} onClick={openSelectionsTab}>Управление</button>
          <button style={ghostBtn} onClick={openViewer}>Viewer</button>
        </div>
      </div>

      {/* Parsing block (reserved) */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ color: "#666", fontSize: 12 }}>Current page</div>
          <div style={{ fontSize: 12, color: hostInfo.supported ? "#111" : "#9CA3AF", maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={hostInfo.host || "unknown"}>
            {hostInfo.host || "unknown"}
          </div>
        </div>
        {hostInfo.supported ? (
          <button style={{ ...btn, width: "100%" }} disabled={(!active && !parserStatus?.running) || busy} onClick={startParse}>
            {busy ? "Подключение…" : parserStatus?.running ? "Остановить сбор" : active ? `Парсить в «${active.name}»` : "Выбери выборку"}
          </button>
        ) : (
          <div style={{ fontSize: 12, color: "#6B7280" }}>
            Парсер выключен для этого домена. Доступные домены: {SUPPORTED_HOSTS.join(", ")}
          </div>
        )}
        {error && <p role="alert" style={{ color: "#b91c1c", fontSize: 12 }}>{error}</p>}
        {parserStatus && <div style={{ fontSize: 12, marginTop: 8 }}>
          <div>Перехватчик: {parserStatus.interceptorReady ? "подключён" : "нет связи"}</div>
          <div>Ответов API: {parserStatus.responses} · Сохранено: {parserStatus.saved}</div>
          <p>{parserStatus.message}</p>
          <button style={ghostBtn} onClick={async () => {
            try {
              const current: ParserReply = await chrome.tabs.sendMessage(hostInfo.tabId!, { type: "PARSER_STATUS" })
              if (!current.ok || !current.status) throw new Error("Нет связи со страницей")
              setParserStatus(current.status)
              await navigator.clipboard.writeText(JSON.stringify(current.status, null, 2))
              setCopyMessage("Журнал скопирован")
            } catch { setCopyMessage("Не удалось скопировать журнал. Откройте диагностику на странице чеков") }
          }}>Копировать журнал</button>
          {copyMessage && <p>{copyMessage}</p>}
        </div>}
      </div>

      {/* Future: quick compare entry */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button style={ghostBtn} onClick={openCompare}>Сравнить датасеты</button>
        <button style={ghostBtn} onClick={() => chrome.runtime.openOptionsPage?.()}>Опции</button>
      </div>
    </div>
  )
}

// ── styles ──────────────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 10,
  marginBottom: 12,
  background: "#fff",
  boxShadow: "0 2px 6px rgba(0,0,0,.06)"
}
const btn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600
}
const ghostBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "#fff",
  color: "#111",
  cursor: "pointer"
}
