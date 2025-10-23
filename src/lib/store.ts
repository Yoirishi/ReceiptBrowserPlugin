import Dexie, { type Table } from "dexie"

export interface AItem { key: string; title?: string | null; price?: number | null }

class AppDB extends Dexie {
  aItems!: Table<AItem, string>
  constructor() {
    super("receiptDb")
    // &key = primary key (unique)
    this.version(1).stores({ aItems: "&key" })
  }
}

export const db = new AppDB()

export async function upsertAItems(rows: AItem[]) {
  if (!rows?.length) return
  await db.aItems.bulkPut(rows)
}
export async function getAllAItems(): Promise<AItem[]> {
  return db.aItems.orderBy("key").toArray()
}
export async function clearAItems() {
  await db.aItems.clear()
}
