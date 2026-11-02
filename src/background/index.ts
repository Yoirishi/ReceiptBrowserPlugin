import costviserScript from "url:../injected/costviser.ts"
import platformaScript from "url:../injected/platformaofd.ts"

import { datasetsRepo } from "~src/lib/datasetsRepo"
import { receiptSource } from "~src/lib/receiptProtocol"

const scripts: chrome.scripting.RegisteredContentScript[] = [
  {
    id: "receipt-parser-costviser",
    js: [costviserScript],
    matches: ["https://*.costviser.ru/*", "https://*.4ait.ru/*"],
    runAt: "document_start",
    world: "MAIN"
  },
  {
    id: "receipt-parser-platformaofd",
    js: [platformaScript],
    matches: ["https://lk.platformaofd.ru/*"],
    runAt: "document_start",
    world: "MAIN"
  }
].map((script) => ({
  ...script,
  // Parcel URL imports can contain /../../ from the worker directory. Injected
  // bundles are emitted at the extension root; Chrome expects that file name.
  js: script.js.map((path) => path.split("/").pop()!.split("?")[0])
})) as chrome.scripting.RegisteredContentScript[]

let registration: Promise<void> | null = null
function ensureScripts(): Promise<void> {
  if (registration) return registration
  registration = (async () => {
    const registered = await chrome.scripting.getRegisteredContentScripts()
    const legacy = registered
      .filter((script) =>
        [
          "srcContentsCostviserChequesInterceptor",
          "srcContentsPlatformaofdChequesInterceptor"
        ].includes(script.id)
      )
      .map((script) => script.id)
    if (legacy.length)
      await chrome.scripting.unregisterContentScripts({ ids: legacy })
    for (const script of scripts) {
      if (registered.some((item) => item.id === script.id)) {
        await chrome.scripting.updateContentScripts([script])
      } else {
        await chrome.scripting.registerContentScripts([script])
      }
    }
  })().finally(() => {
    registration = null
  })
  return registration
}

void ensureScripts().catch((error) =>
  console.error("[Receipt Parser] Не удалось подключить перехватчики", error)
)
chrome.runtime.onInstalled.addListener(() => {
  void ensureScripts().catch((error) =>
    console.error("[Receipt Parser] Ошибка обновления перехватчиков", error)
  )
})

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (
    !["ENSURE_INTERCEPTOR", "GET_ACTIVE_DATASET", "save-cheques"].includes(
      msg?.type
    )
  )
    return
  if (sender.id !== chrome.runtime.id) return

  void (async () => {
    if (msg.type === "ENSURE_INTERCEPTOR") {
      const source = receiptSource(sender.url || sender.tab?.url || "")
      if (!source || sender.tab?.id === undefined)
        throw new Error("Сайт не поддерживается")
      await ensureScripts()
      const script = scripts[source === "Costviser" ? 0 : 1]
      await chrome.scripting.executeScript({
        target: { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] },
        world: "MAIN",
        injectImmediately: true,
        files: script.js!
      })
      return { ok: true }
    }
    if (msg.type === "GET_ACTIVE_DATASET") {
      const dataset = await datasetsRepo.getActive()
      if (!dataset) throw new Error("Сначала выберите выборку в расширении")
      return { ok: true, datasetId: dataset.id, name: dataset.name }
    }

    const source = receiptSource(sender.url || sender.tab?.url || "")
    if (!source || msg.meta?.source !== source)
      throw new Error("Неизвестный источник чеков")
    if (
      typeof msg.datasetId !== "string" ||
      !(await datasetsRepo.get(msg.datasetId))
    ) {
      throw new Error(
        "Выборка не найдена. Выберите существующую выборку и запустите сбор снова"
      )
    }
    if (
      !Array.isArray(msg.rows) ||
      msg.rows.some(
        (row: unknown) =>
          !row ||
          typeof row !== "object" ||
          !("id" in row) ||
          typeof row.id !== "string" ||
          !row.id
      )
    ) {
      throw new Error("Некорректные строки чеков: отсутствует id")
    }
    await datasetsRepo.addRows(msg.datasetId, msg.rows, { source })
    return { ok: true, saved: msg.rows.length, datasetId: msg.datasetId }
  })().then(sendResponse, (error) => {
    console.error("[Receipt Parser]", msg.type, error)
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Ошибка расширения"
    })
  })
  // Keep the response channel alive in Chrome versions without Promise support.
  return true
})
