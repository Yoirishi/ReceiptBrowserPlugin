import React from "react";



import {
  ensureATable,
  getConn,
  insertRowsAItemsPlain
} from "~src/lib/duck"





type Row = { key: string; title?: string; price?: number | null }

function useDuckReady() {
  const [status, setStatus] = React.useState<"init" | "ready" | "error">("init")
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    (async () => {
      await ensureATable()
      try {
        const conn = await getConn()
        await conn.query(`CREATE TABLE IF NOT EXISTS a_items(
                                                              key TEXT,
                                                              title TEXT,
                                                              price DOUBLE
                          )`)
        setStatus("ready")
      } catch (e) {
        console.error(e)
        setError(String(e))
        setStatus("error")
      }
    })()
  }, [])

  return { status, error }
}

export default function Viewer() {
  const { status, error } = useDuckReady()

  const [tableName, setTableName] = React.useState("a_items")
  const [keyVal, setKeyVal] = React.useState("")
  const [title, setTitle] = React.useState("")
  const [price, setPrice] = React.useState("")
  const [rows, setRows] = React.useState<Row[]>([])
  const [busy, setBusy] = React.useState(false)
  const ready = status === "ready"

  const refresh = async () => {
    try {
      setBusy(true)
      const conn = await getConn()
      const res = await conn.query(`SELECT key, title, price FROM ${tableName} ORDER BY key`)
      // @ts-ignore duckdb-wasm Result has toArray()
      const list = (res.toArray()) as Row[]
      setRows(list)
    } catch (e) {
      console.error(e)
      alert("Refresh failed: " + e)
    } finally {
      setBusy(false)
    }
  }

  const insertRow = async () => {
    if (!keyVal.trim()) return alert("Please enter key")
    const num = price.trim() === "" ? null : Number(price)
    if (price.trim() !== "" && Number.isNaN(num)) return alert("Price must be a number")
    setBusy(true)
    try {
      await insertRowsAItemsPlain([{ key: keyVal.trim(), title: title || null, price: num }])
      setKeyVal(""); setTitle(""); setPrice("")
      await refresh()
    } finally { setBusy(false) }
  }

  const insertDemo = async () => {
    setBusy(true)
    try {
      await insertRowsAItemsPlain([
        { key: "SKU-1", title: "Sample A", price: 10.5 },
        { key: "SKU-2", title: "Sample B", price: 12.0 },
        { key: "SKU-3", title: "Sample C", price: null }
      ])
      await refresh()
    } finally { setBusy(false) }
  }

  const clearTable = async () => {
    if (!confirm(`Delete all rows from ${tableName}?`)) return
    try {
      setBusy(true)
      const conn = await getConn()
      await conn.query(`DELETE FROM ${tableName}`)
      await refresh()
    } catch (e) {
      console.error(e)
      alert("Clear failed: " + e)
    } finally {
      setBusy(false)
    }
  }

  const exportCsv = () => {
    const csv = toCSV(rows)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${tableName}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  React.useEffect(() => {
    if (ready) void refresh()

  }, [ready, tableName])

  return (
    <div style={wrap}>
      <header style={header}>
        <div>
          <h2 style={{ margin: 0 }}>DuckDB Viewer</h2>
          <div style={{ color: "#666", fontSize: 12 }}>
            Status: {status}{error ? ` — ${error}` : ""}
          </div>
        </div>
        <button style={ghostBtn} onClick={() => window.close()}>Close</button>
      </header>

      <section style={card}>
        <div style={row}>
          <label style={label}>Table</label>
          <input style={input} value={tableName} onChange={(e) => setTableName(e.target.value)} />
          <button style={btn} onClick={refresh} disabled={!ready || busy}>Refresh</button>
          <button style={btn} onClick={exportCsv} disabled={!ready || rows.length === 0}>Export CSV</button>
          <button style={{...btn, background: "#b91c1c"}} onClick={clearTable} disabled={!ready || busy}>Clear</button>
        </div>
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Insert Row</h3>
        <div style={row}>
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

const wrap: React.CSSProperties = { padding: 16, fontFamily: "system-ui, Segoe UI, Roboto, Arial, sans-serif", color: "#111" }
const header: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }
const card: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 12, background: "#fff" }
const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "80px 1fr 80px 1fr 80px 1fr auto auto", gap: 8, alignItems: "center" }
const label: React.CSSProperties = { fontSize: 12, color: "#555" }
const input: React.CSSProperties = { padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 10, outline: "none" }
const btn: React.CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer" }
const ghostBtn: React.CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", color: "#111", cursor: "pointer" }
const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
}
Object.assign(table, {
  // @ts-ignore
  '--tbl-border': '#eee'
})


const styleEl = document.createElement("style")
styleEl.textContent = `
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #eee; padding: 6px 8px; }
  thead th { position: sticky; top: 0; background: #fafafa; }
`
document.head.appendChild(styleEl)

function toCSV(rows: Row[]): string {
  if (!rows || rows.length === 0) return ""
  const headers = Object.keys(rows[0]) as (keyof Row)[]
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h as keyof Row])).join(","))
  ]
  return lines.join("\n")
}
