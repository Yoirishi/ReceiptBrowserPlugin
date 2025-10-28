import React, { useEffect, useState, type CSSProperties } from "react"



import { datasetsRepo } from "~src/lib/datasetsRepo";
import { rowFromDatasetRow, type UIRow } from "~src/tabs/viewer";
import useTabBoot from "~src/utils/useTabBoot";





export default function ComparePage() {
  const { status, error, datasetId } = useTabBoot()
  const [rows, setRows] = useState<UIRow[]>([])
  const ready = status === "ready"
  const [busy, setBusy] = useState(false)
  const [platformaCheques, setPlatformaCheques] = useState<UIRow[]>([])

  const refresh = async () => {
    if (!datasetId) return
    setBusy(true)
    try {
      const rs = await datasetsRepo.listRows(datasetId, 100000, 0)
      const ui = rs.map(rowFromDatasetRow).sort((a, b) => b.ts - a.ts || a.id.localeCompare(b.id))
      setRows(ui)
    } finally { setBusy(false) }
  }

  const compare = async () => {

  }

  useEffect(() => {
    if (ready) {
      void refresh()
      void compare()
    }
  }, [ready])

  return (
    <div style={wrap}>
      <header style={header}>
        <div style={{ display: "flex", gap: 12, flexDirection: "row", justifyContent: "flex-end", alignItems: "center"  }}>
          <div>
            <h2 style={{ margin: 0 }}>Cheques Comparator</h2>
            <div style={{ color: "#666", fontSize: 12 }}>
              Status: {status}{error ? ` — ${error}` : ""}{datasetId ? ` — dataset: ${datasetId}` : ""}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8}}>
          <button style={ghostBtn} onClick={() => window.close()}>Close</button>
        </div>
      </header>
    </div>);
}

const wrap: CSSProperties = { padding: 16, fontFamily: "system-ui, Segoe UI, Roboto, Arial, sans-serif", color: "#111" }
const header: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }
const card: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 12, background: "#fff" }
const gridActions: CSSProperties = { display: "grid", gridTemplateColumns: "120px 120px 1fr", gap: 8, alignItems: "center" }
const gridForm: CSSProperties = { display: "grid", gridTemplateColumns: "120px 1fr 120px 1fr", gap: 8, alignItems: "center" }
const label: CSSProperties = { fontSize: 12, color: "#555" }
const input: CSSProperties = { padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 10, outline: "none" }
const btn: CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer" }
const ghostBtn: CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", color: "#111", cursor: "pointer" }
