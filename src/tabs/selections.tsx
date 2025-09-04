import { useCallback, useEffect, useState, type CSSProperties } from "react"
import ComboBox from "~src/components/ComboBox";
import { selectionsRepo, type Selection } from "~src/lib/selectionsRepo";





export default function SelectionsPage() {
  const [list, setList] = useState<Selection[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [stats, setStats] = useState<{count:number} | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const [items, aId] = await Promise.all([selectionsRepo.list(), selectionsRepo.getActiveId()])
    setList(items)
    setActiveId(aId)
    if (aId) setStats({ count: await selectionsRepo.countRows(aId) })
    else setStats(null)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const sel = list.find(s => s.id === activeId) || null

  const onPick = async (s: Selection | null) => {
    await selectionsRepo.setActiveId(s?.id ?? null)
    await refresh()
  }

  const onNew = async () => {
    const name = prompt("New selection name:", "New selection")
    if (!name) return
    setBusy(true)
    try { await selectionsRepo.create(name); await refresh() } finally { setBusy(false) }
  }

  const onRename = async () => {
    if (!sel) return
    const name = prompt("Rename selection:", sel.name)
    if (!name || name.trim() === sel.name) return
    setBusy(true)
    try { await selectionsRepo.rename(sel.id, name); await refresh() } finally { setBusy(false) }
  }

  const onDuplicate = async () => {
    if (!sel) return
    setBusy(true)
    try { await selectionsRepo.duplicate(sel.id); await refresh() } finally { setBusy(false) }
  }

  const onDelete = async () => {
    if (!sel) return
    if (!confirm(`Delete selection "${sel.name}" and all its rows?`)) return
    setBusy(true)
    try { await selectionsRepo.delete(sel.id); await refresh() } finally { setBusy(false) }
  }

  const openViewer = () => {
    if (!sel) return
    const url = new URL(chrome.runtime.getURL("tabs/viewer.html"))
    url.searchParams.set("sid", sel.id)
    chrome.tabs.create({ url: url.toString() })
  }

  const exportJSON = async () => {
    if (!sel) return
    const payload = await selectionsRepo.exportJSON(sel.id)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${sel.name.replace(/[^\w\-]+/g,'_')}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div style={wrap}>
      <header style={header}>
        <div>
          <h2 style={{ margin: 0 }}>Selections</h2>
          <div style={{ color: "#666", fontSize: 12 }}>Manage datasets (create, switch, duplicate, delete)</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btn} onClick={onNew} disabled={busy}>New</button>
          <button style={ghostBtn} onClick={openViewer} disabled={!sel}>Open Viewer</button>
        </div>
      </header>

      <section style={card}>
        <div style={{ display:'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: 8, alignItems: 'center' }}>
          <ComboBox<Selection>
            items={list}
            getId={(s) => s.id}
            getText={(s) => s.name}
            value={sel}
            onChange={onPick}
            searchable
            renderEmpty={(q) => <i>No selections for “{q}”. Create one.</i>}
          />
          <button style={btn} onClick={onRename} disabled={!sel || busy}>Rename</button>
          <button style={btn} onClick={onDuplicate} disabled={!sel || busy}>Duplicate</button>
          <button style={{...btn, background:'#b91c1c'}} onClick={onDelete} disabled={!sel || busy}>Delete</button>
          <button style={ghostBtn} onClick={exportJSON} disabled={!sel}>Export JSON</button>
        </div>
      </section>

      {sel && (
        <section style={card}>
          <h3 style={{ marginTop: 0 }}>{sel.name}</h3>
          <div style={{ color:'#666', fontSize:12, marginBottom:8 }}>
            Rows: {stats?.count ?? 0} · Updated: {new Date(sel.updatedAt).toLocaleString()}
          </div>
          <details>
            <summary style={{ cursor:'pointer', color:'#111' }}>Note</summary>
            <textarea
              defaultValue={sel.note || ''}
              onBlur={async (e) => { await selectionsRepo.updateNote(sel.id, e.currentTarget.value); await refresh() }}
              style={{ width:'100%', minHeight: 90, marginTop:8, padding:8, border:'1px solid #e5e7eb', borderRadius:10 }}
              placeholder="Optional note / description"
            />
          </details>
        </section>
      )}
    </div>
  )
}

// styles
const wrap: CSSProperties = { padding: 16, fontFamily: "system-ui, Segoe UI, Roboto, Arial, sans-serif", color: "#111" }
const header: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }
const card: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 12, background: "#fff" }
const btn: CSSProperties = { padding: '8px 12px', borderRadius: 10, border: '1px solid #111', background:'#111', color:'#fff', cursor:'pointer' }
const ghostBtn: CSSProperties = { padding: '8px 12px', borderRadius: 10, border: '1px solid #e5e7eb', background:'#fff', color:'#111', cursor:'pointer' }
