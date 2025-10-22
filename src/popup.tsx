import { log } from "node:util";
import React from "react";



import ComboBox from "~src/components/ComboBox";
import { selectionsRepo, type Selection } from "~src/lib/selectionsRepo";





// domains where parsing is enabled (tune later)
const SUPPORTED_HOSTS = [
  "platformaofd.ru",
  "costviser.ru"
]

export default function Popup() {
  const [list, setList] = React.useState<Selection[]>([])
  const [active, setActive] = React.useState<Selection | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [hostInfo, setHostInfo] = React.useState<{ host: string | null; supported: boolean; tabId: number | null }>({ host: null, supported: false, tabId: null })

  React.useEffect(() => {
    void refresh()
  }, [])

  async function refresh() {
    const [items, id] = await Promise.all([selectionsRepo.list(), selectionsRepo.getActiveId()])
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
          host = new URL(url).host
          supported = SUPPORTED_HOSTS.some((h) => host === h || host.endsWith("." + h))
        } catch {}
      }
      setHostInfo({ host, supported, tabId: tab?.id ?? null })
    } catch (e) {
      console.warn("detectHost error", e)
      setHostInfo({ host: null, supported: false, tabId: null })
    }
  }

  const onPick = async (s: Selection | null) => {
    await selectionsRepo.setActiveId(s?.id ?? null)
    await refresh()
  }

  const openSelectionsTab = () => chrome.tabs.create({ url: chrome.runtime.getURL("tabs/selections.html") })
  const openViewer = () => chrome.tabs.create({ url: chrome.runtime.getURL("tabs/viewer.html" + (active ? `?sid=${active.id}` : "")) })
  const openCompare = () => chrome.tabs.create({ url: chrome.runtime.getURL("tabs/compare.html") }) // placeholder for future

  const findPlatformaTab = async () => {
    const tabs = await chrome.tabs.query({})
    return tabs.find(t => typeof t.url === "string" && /^https:\/\/lk\.platformaofd\.ru\/web\/auth\/cheques\/search/.test(t.url))
  }

  const startParse = async () => {
    setBusy(true)

    try {
      const tab = await findPlatformaTab()
      if (!tab?.id) {
        console.log("No active Platforma tab")
        throw new Error("Нет активной вкладки")
      }
      console.log("start parse on tab", tab.id, "with selection", active?.id, "active?", active ? "yes" : "no")
      // const res = await chrome.tabs.sendMessage(tab.id, {
      //   type: "START_PARSE",
      //   selectionId: active?.id
      // })
      const res = await chrome.runtime.sendMessage({
        type: "START_PARSE",
      })
      if (!res?.ok) throw new Error("Контент-скрипт не ответил")
    } catch (e) {
      console.error("startParse error", e)
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
        <ComboBox<Selection>
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
          <button style={{ ...btn, width: "100%" }} disabled={!active || busy} onClick={startParse}>
            {busy ? "Parsing…" : active ? `Парсить в «${active.name}»` : "Выбери выборку"}
          </button>
        ) : (
          <div style={{ fontSize: 12, color: "#6B7280" }}>
            Парсер выключен для этого домена. Доступные домены: {SUPPORTED_HOSTS.join(", ")}
          </div>
        )}
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
