// datasetsRepo.ts
import Dexie, { type Table } from "dexie"

function resolvePluginScope(): string {

  const fromEnv =
    (process.env.PLASMO_PUBLIC_DATASET_SCOPE as string | undefined) ||
    (process.env.PLASMO_PUBLIC_PLUGIN_ID as string | undefined) ||
    (process.env.PARCEL_PLUGIN_ID as string | undefined) ||
    (process.env.PLUGIN_ID as string | undefined)


  const fromChrome =
    typeof chrome !== "undefined" && chrome?.runtime?.id
      ? (chrome.runtime.id as string)
      : undefined

  return (fromEnv || fromChrome || "default").trim()
}

export type RowData = Record<string, unknown>

export interface Dataset {
  id: string
  name: string
  note?: string
  pinned?: boolean
  createdAt: number
  updatedAt: number
}

export interface DatasetRow {
  id?: number
  datasetId: string
  key?: string
  data: RowData
  ts: number
  source?: "PlatformaOFD" | "Costviser"
  batch?: string
}

interface KV { key: string; value: unknown }

class RepoDB extends Dexie {
  datasets!: Table<Dataset, string>
  datasetRows!: Table<DatasetRow, number>
  kv!: Table<KV, string>

  constructor() {
    super("receiptRepoDb")

    // v1 — старая схема (для апгрейда с прод/браузера)
    this.version(1).stores({
      selections: "&id, name, updatedAt, createdAt, pinned",
      selectionRows: "++id, selectionId, key, ts",
      kv: "&key"
    })

    // v2 — создаём новые сторы и мигрируем данные
    this.version(2).stores({
      datasets: "&id, name, updatedAt, createdAt, pinned",
      datasetRows: "++id, datasetId, key, ts",
      kv: "&key",
      // старые оставляем на этом шаге, чтобы к ним достучаться в upgrade()
      selections: "&id, name, updatedAt, createdAt, pinned",
      selectionRows: "++id, selectionId, key, ts"
    }).upgrade(async (tx) => {
      // копируем datasets
      const oldSel = tx.table("selections")
      const newDs  = tx.table("datasets")
      const sels = await oldSel.toArray()
      if (sels.length) {
        // 1:1 копия — поля совпадают
        await newDs.bulkAdd(sels)
      }

      // копируем строки с переименованием selectionId -> datasetId
      const oldRows = tx.table("selectionRows")
      const newRows = tx.table("datasetRows")
      const rows = await oldRows.toArray()
      if (rows.length) {
        const mapped = rows.map((r: any) => {
          const { selectionId, ...rest } = r
          return { ...rest, datasetId: selectionId } as any
        })
        await newRows.bulkAdd(mapped)
      }
    })

    // v3 — окончательно удаляем старые сторы
    this.version(3).stores({
      datasets: "&id, name, updatedAt, createdAt, pinned",
      datasetRows: "++id, datasetId, key, ts",
      kv: "&key",
      selections: null,
      selectionRows: null
    })

    // реальные привязки таблиц
    this.datasets    = this.table("datasets")
    this.datasetRows = this.table("datasetRows")
    this.kv          = this.table("kv")
  }
}

export class DatasetsRepo {
  private static _inst: DatasetsRepo | null = null
  static instance() {
    if (!this._inst) this._inst = new DatasetsRepo()
    return this._inst
  }

  private db = new RepoDB()

  // 🔹 namespace для изоляции активного датасета по плагину/окружению
  private readonly scope = resolvePluginScope()
  private readonly ACTIVE_KEY = `activeDatasetId::${this.scope}` as const
  private readonly LEGACY_KEYS = ["activeDatasetId", "activeSelectionId"] as const

  // ——— datasets ———
  async create(name: string, opts?: Partial<Dataset>): Promise<Dataset> {
    const now = Date.now()
    const ds: Dataset = {
      id: crypto.randomUUID(),
      name: name.trim() || "Untitled",
      note: opts?.note ?? "",
      pinned: !!opts?.pinned,
      createdAt: now,
      updatedAt: now
    }
    await this.db.datasets.add(ds)
    await this.setActiveId(ds.id)
    return ds
  }

  async rename(id: string, name: string) {
    await this.db.datasets.update(id, { name: name.trim(), updatedAt: Date.now() })
  }

  async updateNote(id: string, note: string) {
    await this.db.datasets.update(id, { note, updatedAt: Date.now() })
  }

  async delete(id: string) {
    await this.db.transaction('rw', this.db.datasetRows, this.db.datasets, this.db.kv, async () => {
      await this.db.datasetRows.where({ datasetId: id }).delete()
      await this.db.datasets.delete(id)
      const activeId = (await this.getActiveId())
      if (activeId === id) await this.setActiveId(null)
    })
  }

  async duplicate(id: string, newName?: string): Promise<Dataset> {
    const src = await this.db.datasets.get(id)
    if (!src) throw new Error("Dataset not found")
    const dst = await this.create(newName || src.name + " (copy)", { note: src.note })
    const rows = await this.db.datasetRows.where({ datasetId: id }).toArray()
    if (rows.length) {
      const copy = rows.map(r => ({ ...r, id: undefined, datasetId: dst.id }))
      await this.db.datasetRows.bulkAdd(copy)
    }
    return dst
  }

  async list(): Promise<Dataset[]> {
    return this.db.datasets.orderBy('updatedAt').reverse().toArray()
  }

  async get(id: string): Promise<Dataset | undefined> {
    return this.db.datasets.get(id)
  }

  // ——— rows ———
  /**
   * Добавить массив объектов (в т.ч. распарсенные чеки).
   * key берётся из data.key ИЛИ (fallback) из data.id, если это строка.
   */
  async addRows(datasetId: string, rows: RowData[], meta?: Partial<DatasetRow>) {
    if (!rows?.length) return
    const nowTs = Date.now()
    const batch = meta?.batch
    const source = meta?.source

    const mapped: DatasetRow[] = rows.map((data) => {
      const rawKey = (data as any)?.key ?? (data as any)?.id
      const key = typeof rawKey === 'string' ? rawKey : undefined
      return { datasetId, key, data, ts: nowTs, batch, source }
    })

    await this.db.datasetRows.bulkAdd(mapped)
    await this.db.datasets.update(datasetId, { updatedAt: Date.now() })
  }

  async listRows(datasetId: string, limit = 200, offset = 0): Promise<DatasetRow[]> {
    return this.db.datasetRows
      .where({ datasetId })
      .offset(offset)
      .limit(limit)
      .toArray()
  }

  async countRows(datasetId: string) {
    return this.db.datasetRows.where({ datasetId }).count()
  }

  async clearRows(datasetId: string) {
    await this.db.datasetRows.where({ datasetId }).delete()
    await this.db.datasets.update(datasetId, { updatedAt: Date.now() })
  }

  // ——— active dataset ———
  async setActiveId(id: string | null) {
    await this.db.kv.put({ key: this.ACTIVE_KEY, value: id })
    // подчистим легаси-ключи (best-effort)
    for (const k of this.LEGACY_KEYS) {
      try { await this.db.kv.delete(k) } catch {}
    }
  }

  async getActiveId(): Promise<string | null> {
    const v = (await this.db.kv.get(this.ACTIVE_KEY))?.value as string | null ?? null
    if (v) return v

    // миграция со старых ключей
    for (const k of this.LEGACY_KEYS) {
      const legacy = (await this.db.kv.get(k))?.value as string | null ?? null
      if (legacy) { await this.setActiveId(legacy); return legacy }
    }
    return null
  }

  async getActive(): Promise<Dataset | null> {
    const id = await this.getActiveId()
    if (!id) return null
    return (await this.get(id)) ?? null
  }

  /** Гарантировать датасет для текущего scope (PLUGIN_ID/ENV). */
  async ensureScoped(nameBase = "Receipts"): Promise<Dataset> {
    const active = await this.getActive()
    if (active) return active

    const targetName = `${nameBase} [${this.scope}]`
    // есть индекс по name — ищем быстрым путём
    const found = await this.db.datasets.where("name").equals(targetName).first()
    if (found) { await this.setActiveId(found.id); return found }

    const created = await this.create(targetName, { note: `scoped to ${this.scope}` })
    await this.setActiveId(created.id)
    return created
  }
}

export const datasetsRepo = DatasetsRepo.instance()
