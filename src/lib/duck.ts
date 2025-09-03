import * as duckdb from "@duckdb/duckdb-wasm"
import { tableFromArrays } from "apache-arrow"

import ehWorkerUrl from "url:@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js"
import ehWasmUrl   from "url:@duckdb/duckdb-wasm/dist/duckdb-eh.wasm"

let dbP: Promise<duckdb.AsyncDuckDB> | null = null
let connP: Promise<duckdb.AsyncDuckDBConnection> | null = null

async function initDB() {
  const worker = new Worker(ehWorkerUrl, { type: "module" })
  const logger = new duckdb.ConsoleLogger()
  const db = new duckdb.AsyncDuckDB(logger, worker)
  await db.instantiate(ehWasmUrl, null)
  return db
}

export async function getDB() {
  if (!dbP) dbP = initDB()
  return dbP
}

export async function getConn() {
  if (!connP) connP = (await getDB()).connect()
  return connP
}


export async function loadJsonRows(
  tableName: string,
  rows: Record<string, unknown>[]
) {
  const db = await getDB()
  const conn = await getConn()

  const fileName = `${tableName}__tmp.json`
  await db.registerFileText(fileName, JSON.stringify(rows))

  try {
    await conn.insertJSONFromPath(fileName, { name: tableName })
  } catch (e: any) {
    const msg = String(e?.exception_subtype || e?.error_subtype || e?.message || e)

    if (msg.includes("ENTRY_ALREADY_EXISTS")) {

      await conn.query(
        `CREATE TABLE IF NOT EXISTS ${tableName} AS 
         SELECT * FROM read_json_auto('${fileName}') LIMIT 0`
      )
      await conn.query(
        `INSERT INTO ${tableName} 
         SELECT * FROM read_json_auto('${fileName}')`
      )
    } else {
      throw e
    }
  }
}

export async function insertRowsAItems(
  rows: { key: string; title?: string | null; price?: number | null }[]
) {
  const conn = await getConn()
  await conn.query(`CREATE TABLE IF NOT EXISTS a_items(
    key TEXT,
    title TEXT,
    price DOUBLE
  )`)


  const tbl = tableFromArrays({
    key:   rows.map(r => r.key),
    title: rows.map(r => r.title ?? null),
    price: rows.map(r => (r.price ?? null) as number | null)
  })


  await conn.insertArrowTable(tbl, { name: "a_items" })
}

type ARow = { key: string; title?: string | null; price?: number | null }

const q = (s: string | null) =>
  s == null ? "NULL" : "'" + s.replace(/'/g, "''") + "'"

const qn = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "NULL" : String(n)

export async function ensureATable() {
  const conn = await getConn()

  await conn.query(`CREATE TABLE IF NOT EXISTS a_items(
    key TEXT, title TEXT, price DOUBLE
  )`)
}

export async function insertRowsAItemsPlain(rows: ARow[]) {
  if (!rows?.length) return
  const conn = await getConn()
  await ensureATable()
  const values = rows
    .map(r => `(${q(r.key)}, ${q(r.title ?? null)}, ${qn(r.price)})`)
    .join(",")
  await conn.query(`INSERT INTO a_items (key, title, price) VALUES ${values}`)
}
