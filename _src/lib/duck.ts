// import * as duckdb from "@duckdb/duckdb-wasm"
// import workerUrl from "url:@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js"
// import wasmUrl   from "url:@duckdb/duckdb-wasm/dist/duckdb.wasm"
//
// let dbP: Promise<duckdb.AsyncDuckDB> | null = null
// let connP: Promise<duckdb.AsyncDuckDBConnection> | null = null
//
// async function initDB() {
//   const worker = new Worker(workerUrl, { type: "module" })
//   const logger = new duckdb.ConsoleLogger()
//   const db = new duckdb.AsyncDuckDB(logger, worker)
//   await db.instantiate(wasmUrl)
//   return db
// }
//
// export async function getDB() {
//   if (!dbP) dbP = initDB()
//   return dbP
// }
//
// export async function getConn() {
//   if (!connP) connP = (await getDB()).connect()
//   return connP
// }
//
//
// export async function loadJsonRows(
//   tableName: string,
//   rows: Record<string, unknown>[]
// ) {
//   const db = await getDB()
//   const conn = await getConn()
//   const fileName = `${tableName}.json`
//   await db.registerFileText(fileName, JSON.stringify(rows))
//   await conn.insertJSONFromPath(fileName, { name: tableName })
//   return conn
// }
