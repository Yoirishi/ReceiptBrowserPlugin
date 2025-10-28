import "@plasmohq/messaging/background"
import { startHub } from "@plasmohq/messaging/pub-sub"
import { datasetsRepo } from '~src/lib/datasetsRepo'
import { parseAndStoreCheques } from "~src/lib/cheque-parser.platformaofd"
import { log } from "node:util"

console.log(`BGSW - Starting Hub`)
startHub()


chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "save-cheques") return;

  return (async () => {
    const rows = Array.isArray(msg.rows) ? msg.rows : []
    const ds = await datasetsRepo.ensureScoped()
    if (rows.length) await datasetsRepo.addRows(ds.id, rows, msg.meta ?? {})
    console.log(`saved ${rows.length} cheques`)
  })()
})
