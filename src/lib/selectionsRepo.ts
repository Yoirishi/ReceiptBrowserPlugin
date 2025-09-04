import Dexie, { type Table } from "dexie"

export type RowData = Record<string, unknown>

export interface Selection {
  id: string
  name: string
  note?: string
  pinned?: boolean
  createdAt: number
  updatedAt: number
}

export interface SelectionRow {
  id?: number
  selectionId: string
  key?: string
  data: RowData
  ts: number
  source?: "A" | "B" | "manual"
  batch?: string
}

interface KV { key: string; value: unknown }

class RepoDB extends Dexie {
  selections!: Table<Selection, string>
  selectionRows!: Table<SelectionRow, number>
  kv!: Table<KV, string>

  constructor() {
    super("receiptRepoDb")
    this.version(1).stores({
      selections: "&id, name, updatedAt, createdAt, pinned",
      selectionRows: "++id, selectionId, key, ts",
      kv: "&key"
    })
  }
}

export class SelectionsRepo {
  private static _inst: SelectionsRepo | null = null
  static instance() {
    if (!this._inst) this._inst = new SelectionsRepo()
    return this._inst
  }

  private db = new RepoDB()

  // ——— selections ———
  async create(name: string, opts?: Partial<Selection>): Promise<Selection> {
    const now = Date.now()
    const sel: Selection = {
      id: crypto.randomUUID(),
      name: name.trim() || "Untitled",
      note: opts?.note ?? "",
      pinned: !!opts?.pinned,
      createdAt: now,
      updatedAt: now
    }
    await this.db.selections.add(sel)
    await this.setActiveId(sel.id)
    return sel
  }

  async rename(id: string, name: string) {
    await this.db.selections.update(id, { name: name.trim(), updatedAt: Date.now() })
  }

  async updateNote(id: string, note: string) {
    await this.db.selections.update(id, { note, updatedAt: Date.now() })
  }

  async delete(id: string) {
    await this.db.transaction('rw', this.db.selectionRows, this.db.selections, this.db.kv, async () => {
      await this.db.selectionRows.where({ selectionId: id }).delete()
      await this.db.selections.delete(id)
      const activeId = (await this.getActiveId())
      if (activeId === id) await this.setActiveId(null)
    })
  }

  async duplicate(id: string, newName?: string): Promise<Selection> {
    const src = await this.db.selections.get(id)
    if (!src) throw new Error("Selection not found")
    const dst = await this.create(newName || src.name + " (copy)", { note: src.note })
    const rows = await this.db.selectionRows.where({ selectionId: id }).toArray()
    if (rows.length) {
      const copy = rows.map(r => ({ ...r, id: undefined, selectionId: dst.id }))
      await this.db.selectionRows.bulkAdd(copy)
    }
    return dst
  }

  async list(): Promise<Selection[]> {
    return this.db.selections.orderBy('updatedAt').reverse().toArray()
  }

  async get(id: string): Promise<Selection | undefined> {
    return this.db.selections.get(id)
  }

  // ——— rows ———
  async addRows(selectionId: string, rows: RowData[], meta?: Partial<SelectionRow>) {
    if (!rows?.length) return
    const ts = Date.now()
    const batch = meta?.batch
    const source = meta?.source
    // map to SelectionRow
    const mapped: SelectionRow[] = rows.map((data) => ({
      selectionId,
      key: typeof (data as any)?.key === 'string' ? String((data as any).key) : undefined,
      data,
      ts,
      batch,
      source
    }))
    await this.db.selectionRows.bulkAdd(mapped)
    await this.db.selections.update(selectionId, { updatedAt: Date.now() })
  }

  async listRows(selectionId: string, limit = 200, offset = 0): Promise<SelectionRow[]> {
    return this.db.selectionRows
      .where({ selectionId })
      .offset(offset)
      .limit(limit)
      .toArray()
  }

  async countRows(selectionId: string) {
    return this.db.selectionRows.where({ selectionId }).count()
  }

  async clearRows(selectionId: string) {
    await this.db.selectionRows.where({ selectionId }).delete()
    await this.db.selections.update(selectionId, { updatedAt: Date.now() })
  }

  // ——— active selection ———
  async setActiveId(id: string | null) { await this.db.kv.put({ key: 'activeSelectionId', value: id }) }
  async getActiveId(): Promise<string | null> {
    return (await this.db.kv.get('activeSelectionId'))?.value as string | null ?? null
  }
  async getActive(): Promise<Selection | null> {
    const id = await this.getActiveId(); if (!id) return null; return (await this.get(id)) ?? null
  }

  // ——— export/import ———
  async exportJSON(id: string) {
    const sel = await this.get(id); if (!sel) throw new Error('Selection not found')
    const rows = await this.db.selectionRows.where({ selectionId: id }).toArray()
    return { selection: sel, rows }
  }

  async importJSON(payload: { selection?: Partial<Selection>, rows: SelectionRow[] }, name?: string) {
    const sel = await this.create(name || payload.selection?.name || 'Imported', { note: payload.selection?.note })
    const mapped = (payload.rows || []).map(r => ({ ...r, id: undefined, selectionId: sel.id }))
    if (mapped.length) await this.db.selectionRows.bulkAdd(mapped)
    return sel
  }

  exportCSVString(rows: SelectionRow[]): string {
    if (!rows.length) return ''
    // collect union of keys from data
    const keys = Array.from(rows.reduce((s, r) => { Object.keys(r.data || {}).forEach(k => s.add(k)); return s }, new Set<string>()))
    const head = ['id','ts','key', ...keys]
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [head.join(','), ...rows.map(r => [r.id ?? '', r.ts, r.key ?? '', ...keys.map(k => esc((r.data as any)?.[k]))].join(','))]
    return lines.join('\n')
  }
}

export const selectionsRepo = SelectionsRepo.instance()
