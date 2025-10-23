import React, { type CSSProperties, useEffect, useState } from "react"
import  { type AItem, clearAItems, getAllAItems, upsertAItems } from "~src/lib/store"
import { ensureATable, getConn, insertRowsAItemsPlain } from "~src/lib/duck"

type Row = AItem

function useDuckReady() {
  const [status, setStatus] = useState<"init" | "ready" | "error">("init")
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    (async () => {
      try {
        await ensureATable()
        await seedFromStoreOnce()
        setStatus("ready")
      } catch (e) {
        console.error(e)
        setError(String(e))
        setStatus("error")
      }
    })()
  }, [])
  // one-time seed helper lives outside component scope
  async function seedFromStoreOnce() {
    const data = await getAllAItems()
    const conn = await getConn()
    await conn.query("DELETE FROM a_items")
    if (data.length) await insertRowsAItemsPlain(data)
  }
  return { status, error }
}

export default function Viewer() {
  const { status, error } = useDuckReady()
  const [keyVal, setKeyVal] = useState("")
  const [title, setTitle] = useState("")
  const [price, setPrice] = useState("")
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const ready = status === "ready"

  const refresh = async () => {
    setBusy(true)
    try {
      const conn = await getConn()
      const res = await conn.query(`SELECT key, title, price FROM a_items ORDER BY key`)
      // @ts-ignore duckdb Result
      setRows(res.toArray())
    } finally { setBusy(false) }
  }

  const syncFromStore = async () => {
    setBusy(true)
    try {
      const data = await getAllAItems()
      const conn = await getConn()
      await conn.query("DELETE FROM a_items")
      if (data.length) await insertRowsAItemsPlain(data)
      await refresh()
    } finally { setBusy(false) }
  }

  const insertRow = async () => {
    if (!keyVal.trim()) return alert("Please enter key")
    const num = price.trim() === "" ? null : Number(price)
    if (price.trim() !== "" && Number.isNaN(num)) return alert("Price must be a number")

    setBusy(true)
    try {
      const row: Row = { key: keyVal.trim(), title: title || null, price: num }
      // persist canonically in IndexedDB
      await upsertAItems([row])
      // reflect into current DuckDB session
      await insertRowsAItemsPlain([row])
      setKeyVal(""); setTitle(""); setPrice("")
      await refresh()
    } finally { setBusy(false) }
  }

  const insertDemo = async () => {
    setBusy(true)
    try {
      const demo: Row[] = [
        { key: "SKU-1", title: "Sample A", price: 10.5 },
        { key: "SKU-2", title: "Sample B", price: 12.0 },
        { key: "SKU-3", title: "Sample C", price: null }
      ]
      await upsertAItems(demo)
      await insertRowsAItemsPlain(demo)
      await refresh()
    } finally { setBusy(false) }
  }

  const clearAll = async () => {
    if (!confirm("Clear DuckDB table AND persistent store?")) return
    setBusy(true)
    try {
      const conn = await getConn()
      await conn.query("DELETE FROM a_items")
      await clearAItems()
      await refresh()
    } finally { setBusy(false) }
  }

  useEffect(() => { if (ready) void refresh() }, [ready])

  return (
    <div style={wrap}>
      <header style={header}>
        <div>
          <h2 style={{ margin: 0 }}>DuckDB Viewer</h2>
          <div style={{ color: "#666", fontSize: 12 }}>Status: {status}{error ? ` — ${error}` : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={ghostBtn} onClick={() => window.close()}>Close</button>
        </div>
      </header>

      <section style={card}>
        <div style={grid3}>
          <button style={btn} onClick={refresh} disabled={!ready || busy}>Refresh</button>
          <button style={btn} onClick={syncFromStore} disabled={!ready || busy}>Sync from Store</button>
          <button style={{ ...btn, background: "#b91c1c" }} onClick={clearAll} disabled={!ready || busy}>Clear All</button>
          <div style={{ color: "#666", fontSize: 12 }}>
            Persistent store: IndexedDB (Dexie). Each viewer loads from it.
          </div>
        </div>
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Insert Row</h3>
        <div style={grid3}>
          <label style={label}>key</label>
          <input style={input} value={keyVal} onChange={(e) => setKeyVal(e.target.value)} placeholder="SKU-123" />
          <label style={label}>title</label>
          <input style={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Item name" />
          <label style={label}>price</label>
          <input style={input} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="12.34" />
          <button style={btn} onClick={insertRow} disabled={!ready || busy}>Insert</button>
          <button style={ghostBtn} onClick={insertDemo} disabled={!ready || busy}>Insert demo</button>
        </div>
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Rows ({rows.length})</h3>
        {rows.length === 0 ? (
          <div style={{ color: "#777" }}>empty</div>
        ) : (
          <div style={{ overflow: "auto", maxHeight: 420 }}>
            <table style={table}>
              <thead>
              <tr>
                <th>key</th>
                <th>title</th>
                <th style={{ textAlign: "right" }}>price</th>
              </tr>
            </thead>
            <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.key}</td>
                <td>{r.title ?? ""}</td>
                <td style={{ textAlign: "right" }}>{r.price ?? ""}</td>
              </tr>
            ))}
            </tbody>
          </table>
          </div>
          )}
      </section>
    </div>
  )
}

// styles
const wrap: CSSProperties = { padding: 16, fontFamily: "system-ui, Segoe UI, Roboto, Arial, sans-serif", color: "#111" }
const header: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }
const card: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 12, background: "#fff" }
const grid3: CSSProperties = { display: "grid", gridTemplateColumns: "80px 1fr 80px 1fr 80px 1fr auto auto", gap: 8, alignItems: "center" }
const label: CSSProperties = { fontSize: 12, color: "#555" }
const input: CSSProperties = { padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 10, outline: "none" }
const btn: CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer" }
const ghostBtn: CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", color: "#111", cursor: "pointer" }
const table: CSSProperties = { width: "100%", borderCollapse: "collapse" }

const styleEl2 = document.createElement("style")
styleEl2.textContent = `
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #eee; padding: 6px 8px; }
  thead th { position: sticky; top: 0; background: #fafafa; }
`
document.head.appendChild(styleEl2)
