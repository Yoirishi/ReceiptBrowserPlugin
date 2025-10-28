// viewer.tsx
import React, { type CSSProperties, useEffect, useState } from "react"
import { datasetsRepo, type DatasetRow } from "~src/lib/datasetsRepo"

// ---------------- types & helpers ----------------
type UIRow = {
  id: string
  date: string
  deviceName: string
  amount: string
  sign: string
  paymentType: string
  fnsStatus: string
  crptStatus: string
  sale: string
  shift: string
  detailsUrl: string
  ts: number
  source?: string
  batch?: string
}

const S = (v: unknown) => (v == null ? "" : String(v))

function rowFromDatasetRow(r: DatasetRow): UIRow {
  const d = (r.data || {}) as Record<string, unknown>
  return {
    id: S(d.id || d.key || ""),
    date: S(d.date),
    deviceName: S(d.deviceName),
    amount: S(d.amount),
    sign: S(d.sign),
    paymentType: S(d.paymentType),
    fnsStatus: S(d.fnsStatus),
    crptStatus: S(d.crptStatus),
    sale: S(d.sale),
    shift: S(d.shift),
    detailsUrl: S(d.detailsUrl),
    ts: r.ts || Date.now(),
    source: r.source ? String(r.source) : "",
    batch: r.batch ? String(r.batch) : ""
  }
}

// ---------------- boot ----------------
function useBoot() {
  const [status, setStatus] = useState<"init" | "ready" | "error">("init")
  const [error, setError] = useState<string | null>(null)
  const [datasetId, setDatasetId] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const ds = await datasetsRepo.ensureScoped()
        setDatasetId(ds.id)
        setStatus("ready")
      } catch (e) {
        console.error(e)
        setError(String(e))
        setStatus("error")
      }
    })()
  }, [])

  return { status, error, datasetId }
}


export default function Viewer() {
  const { status, error, datasetId } = useBoot()
  const [rows, setRows] = useState<UIRow[]>([])
  const [busy, setBusy] = useState(false)
  const ready = status === "ready"

  const parseRuDate = (s?: string): number => {
    if (typeof s !== "string") return Infinity
    const matches = s.match(
      /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/
    )
    if (!matches) return Infinity
    const [, dd, MM, yyyy, HH = "00", mm = "00", ss = "00"] = matches
    return Date.UTC(+yyyy, +MM - 1, +dd, +HH, +mm, +ss)
  }

  const sortedRows = [...rows].sort((a, b) => {
    const ta = parseRuDate(a.date)
    const tb = parseRuDate(b.date)
    return ta - tb || String(a.id).localeCompare(String(b.id))
  })


  const [addRowFormOpen, setAddRowFormOpen] = useState(false)

  const [idVal, setIdVal] = useState("")
  const [date, setDate] = useState("")
  const [deviceName, setDeviceName] = useState("")
  const [amountText, setAmountText] = useState("")
  const [sign, setSign] = useState("")
  const [paymentType, setPaymentType] = useState("")
  const [fnsStatus, setFnsStatus] = useState("")
  const [crptStatus, setCrptStatus] = useState("")
  const [sale, setSale] = useState("")
  const [shift, setShift] = useState("")
  const [detailsUrl, setDetailsUrl] = useState("")

  const refresh = async () => {
    if (!datasetId) return
    setBusy(true)
    try {
      const rs = await datasetsRepo.listRows(datasetId, 100000, 0)
      const ui = rs.map(rowFromDatasetRow).sort((a, b) => b.ts - a.ts || a.id.localeCompare(b.id))
      setRows(ui)
    } finally { setBusy(false) }
  }

  const clearAll = async () => {
    if (!datasetId) return
    if (!confirm("Clear dataset rows?")) return
    setBusy(true)
    try {
      await datasetsRepo.clearRows(datasetId)
      await refresh()
    } finally { setBusy(false) }
  }

  const insertRow = async () => {
    if (!datasetId) return
    if (!idVal.trim()) return alert("Please enter id")

    const data: Record<string, unknown> = {
      id: idVal.trim(),
      date: date.trim(),
      deviceName: deviceName.trim(),
      amount: amountText,
      sign: sign.trim(),
      paymentType: paymentType.trim(),
      fnsStatus: fnsStatus.trim(),
      crptStatus: crptStatus.trim(),
      sale: sale.trim(),
      shift: shift.trim(),
      detailsUrl: detailsUrl.trim()
    }

    setBusy(true)
    try {
      await datasetsRepo.addRows(datasetId, [data], { source: "PlatformaOFD" })
      // очистка формы
      setIdVal(""); setDate(""); setDeviceName(""); setAmountText(""); setSign(""); setPaymentType("")
      setFnsStatus(""); setCrptStatus(""); setSale(""); setShift(""); setDetailsUrl("")
      await refresh()
    } finally { setBusy(false) }
  }

  useEffect(() => { if (ready) void refresh() }, [ready])

  return (
    <div style={wrap}>
      <header style={header}>
        <div style={{ display: "flex", gap: 12, flexDirection: "row", justifyContent: "flex-end", alignItems: "center"  }}>
          <div>
            <h2 style={{ margin: 0 }}>Cheques Viewer</h2>
            <div style={{ color: "#666", fontSize: 12 }}>
              Status: {status}{error ? ` — ${error}` : ""}{datasetId ? ` — dataset: ${datasetId}` : ""}
            </div>
          </div>
          <div style={gridActions}>
            <button style={btn} onClick={refresh} disabled={!ready || busy}>Refresh</button>
            <button style={{ ...btn, background: "#b91c1c" }} onClick={clearAll} disabled={!ready || busy}>Clear All</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8}}>
          <button style={ghostBtn} onClick={() => window.close()}>Close</button>
        </div>
      </header>

      <section style={card}>
        <div style={collapseHeader}>
          <h3 style={{ margin: 0 }}>Insert Row (Cheque)</h3>
          <button
            type="button"
            style={ghostBtn}
            onClick={() => setAddRowFormOpen(o => !o)}
            aria-expanded={addRowFormOpen}
            aria-controls="cheque-form"
          >
            <span style={{ marginRight: 6 }}>{addRowFormOpen ? "Свернуть" : "Развернуть"}</span>
            <span style={chevron(addRowFormOpen)}>▸</span>
          </button>
        </div>

        <div
          id="cheque-form"
          style={{ ...gridForm, display: addRowFormOpen ? "grid" : "none" }}
        >
          <label style={label}>id</label>
          <input style={input} value={idVal} onChange={e => setIdVal(e.target.value)} placeholder="150331958551" />

          <label style={label}>date</label>
          <input style={input} value={date} onChange={e => setDate(e.target.value)} placeholder="23.10.2025 15:50" />

          <label style={label}>deviceName</label>
          <input style={input} value={deviceName} onChange={e => setDeviceName(e.target.value)} placeholder="Табачный Дом Льва Толстого 19" />

          <label style={label}>amount</label>
          <input style={input} value={amountText} onChange={e => setAmountText(e.target.value)} placeholder="258 ₽" />

          <label style={label}>sign</label>
          <input style={input} value={sign} onChange={e => setSign(e.target.value)} placeholder="Приход" />

          <label style={label}>paymentType</label>
          <input style={input} value={paymentType} onChange={e => setPaymentType(e.target.value)} placeholder="Оплата картой" />

          <label style={label}>fnsStatus</label>
          <input style={input} value={fnsStatus} onChange={e => setFnsStatus(e.target.value)} placeholder="Принят" />

          <label style={label}>crptStatus</label>
          <input style={input} value={crptStatus} onChange={e => setCrptStatus(e.target.value)} placeholder="Не будет отправлен..." />

          <label style={label}>sale</label>
          <input style={input} value={sale} onChange={e => setSale(e.target.value)} placeholder="56" />

          <label style={label}>shift</label>
          <input style={input} value={shift} onChange={e => setShift(e.target.value)} placeholder="206" />

          <label style={label}>detailsUrl</label>
          <input style={input} value={detailsUrl} onChange={e => setDetailsUrl(e.target.value)} placeholder="/web/auth/cheques/details/..." />

          <button style={btn} onClick={insertRow} disabled={!ready || busy}>Insert</button>
        </div>
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Rows ({rows.length})</h3>
        {rows.length === 0 ? (
          <div style={{ color: "#777" }}>empty</div>
        ) : (
          <div style={{ overflow: "auto", maxHeight: 520 }}>
            <table style={table}>
              <thead>
              <tr>
                <th>id</th>
                <th>date</th>
                <th>deviceName</th>
                <th>amount</th>
                <th>sign</th>
                <th>paymentType</th>
                <th>fnsStatus</th>
                <th>crptStatus</th>
                <th>sale</th>
                <th>shift</th>
                <th>detailsUrl</th>
                <th>ts</th>
                <th>source</th>
              </tr>
              </thead>
              <tbody>
              {sortedRows.map((r) => (
                <tr key={`${r.ts}-${r.id}`}>
                  <td>{r.id}</td>
                  <td>{r.date}</td>
                  <td>{r.deviceName}</td>
                  <td>{r.amount}</td>
                  <td>{r.sign}</td>
                  <td>{r.paymentType}</td>
                  <td>{r.fnsStatus}</td>
                  <td>{r.crptStatus}</td>
                  <td>{r.sale}</td>
                  <td>{r.shift}</td>
                  <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.detailsUrl}</td>
                  <td>{r.ts}</td>
                  <td>{r.source ?? ""}</td>
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

// ---------------- styles ----------------
const wrap: CSSProperties = { padding: 16, fontFamily: "system-ui, Segoe UI, Roboto, Arial, sans-serif", color: "#111" }
const header: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }
const card: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 12, background: "#fff" }
const gridActions: CSSProperties = { display: "grid", gridTemplateColumns: "120px 120px 1fr", gap: 8, alignItems: "center" }
const gridForm: CSSProperties = { display: "grid", gridTemplateColumns: "120px 1fr 120px 1fr", gap: 8, alignItems: "center" }
const label: CSSProperties = { fontSize: 12, color: "#555" }
const input: CSSProperties = { padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 10, outline: "none" }
const btn: CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer" }
const ghostBtn: CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", color: "#111", cursor: "pointer" }
const table: CSSProperties = { width: "100%", borderCollapse: "collapse" }
const collapseHeader: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }
const chevron = (open: boolean): CSSProperties => ({
  display: "inline-block",
  transition: "transform 120ms ease",
  transform: open ? "rotate(90deg)" : "rotate(0deg)"
})

const styleEl2 = document.createElement("style")
styleEl2.textContent = `
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #eee; padding: 6px 8px; }
  thead th { position: sticky; top: 0; background: #fafafa; }
`
document.head.appendChild(styleEl2)
