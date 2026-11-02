import { useEffect, useRef, useState } from "react"

import { parseCheques, type Cheque } from "~src/lib/cheque-parser.platformaofd"
import {
  BRIDGE_READY,
  BRIDGE_REQUEST,
  diagnosticUrl,
  isReceiptPage,
  isReceiptResponse,
  NET_EVENT,
  type ParserReply,
  type ParserStatus,
  type ReceiptSource
} from "~src/lib/receiptProtocol"
import { parseCostviserResponse } from "~src/utils/isCostviserChecksResponse"
import { mapCostviserToCheques } from "~src/utils/mapCheques"
import type { NetEvent } from "~src/utils/XhrRequestInterceptor"

export function useReceiptParser(source: ReceiptSource) {
  const [status, setStatus] = useState<ParserStatus>({
    source,
    running: false,
    interceptorReady: false,
    datasetId: null,
    saved: 0,
    responses: 0,
    message: "Сбор остановлен",
    logs: []
  })
  const statusRef = useRef(status)
  const controls = useRef<{
    start: (datasetId?: string) => Promise<ParserReply>
    stop: () => ParserReply
  } | null>(null)

  useEffect(() => {
    let disposed = false
    let session = 0
    let queue = Promise.resolve()
    let starting: Promise<ParserReply> | null = null
    const seen = new Set<string>()
    let waitTimer: ReturnType<typeof setTimeout> | undefined
    const update = (patch: Partial<ParserStatus>) => {
      statusRef.current = { ...statusRef.current, ...patch }
      if (!disposed) setStatus(statusRef.current)
    }
    const log = (
      level: "info" | "warn" | "error",
      message: string,
      announce = true
    ) => {
      const entry = { time: new Date().toISOString(), level, message }
      update({
        ...(announce ? { message } : {}),
        logs: [...statusRef.current.logs, entry].slice(-100)
      })
      console[level](`[Receipt Parser / ${source}] ${message}`)
    }
    const requestBridge = (replay = false) =>
      window.dispatchEvent(
        new CustomEvent(BRIDGE_REQUEST, { detail: { source, replay } })
      )
    const ensureBridge = async () => {
      requestBridge()
      if (statusRef.current.interceptorReady) return
      const reply = await chrome.runtime.sendMessage({
        type: "ENSURE_INTERCEPTOR"
      })
      if (!reply?.ok)
        throw new Error(reply?.error || "Не удалось подключить перехватчик")
      requestBridge()
      if (!statusRef.current.interceptorReady)
        throw new Error(
          "Перехватчик не ответил. Обновите страницу после обновления расширения"
        )
    }
    const save = async (rows: Cheque[], currentSession: number) => {
      if (disposed || session !== currentSession || !statusRef.current.running)
        return
      const unique = [
        ...new Map(rows.map((row) => [row.id, row])).values()
      ].filter((row) => !seen.has(row.id))
      if (!unique.length) {
        log(
          "info",
          rows.length
            ? "Эти чеки уже сохранены в текущем сеансе"
            : "Ответ получен, список чеков пуст"
        )
        return
      }
      const datasetId = statusRef.current.datasetId
      const result = await chrome.runtime.sendMessage({
        type: "save-cheques",
        datasetId,
        rows: unique,
        meta: { source }
      })
      if (
        !result?.ok ||
        result.saved !== unique.length ||
        result.datasetId !== datasetId
      ) {
        throw new Error(
          result?.error || "Фоновый процесс не подтвердил сохранение чеков"
        )
      }
      if (disposed || currentSession !== session) return
      unique.forEach((row) => seen.add(row.id))
      update({ saved: statusRef.current.saved + result.saved })
      log(
        "info",
        `Сохранено ${result.saved} чеков; всего за сеанс: ${statusRef.current.saved}`
      )
    }
    const consume = async (event: NetEvent, currentSession: number) => {
      if (disposed || currentSession !== session || !statusRef.current.running)
        return
      if (!event.status || event.status < 200 || event.status >= 300) {
        throw new Error(
          event.status === 401 || event.status === 403
            ? `HTTP ${event.status}: нет доступа к чекам. Проверьте вход и права в кабинете`
            : `Ошибка загрузки чеков: HTTP ${event.status || 0} (0 — запрос прерван или сеть недоступна)`
        )
      }
      if (event.truncated)
        throw new Error(
          "Ответ больше 5 млн символов и обрезан. Уменьшите число чеков на странице"
        )
      if (event.url && !isReceiptResponse(source, event.url)) {
        throw new Error(
          `Запрос чеков перенаправлен на ${diagnosticUrl(event.url)}. Проверьте вход в кабинет`
        )
      }
      if (!event.body || event.readError)
        throw new Error(
          "Тело ответа недоступно или пусто. Проверьте тип ответа и вход в кабинет"
        )
      const rows =
        source === "Costviser"
          ? mapCostviserToCheques(parseCostviserResponse(event.body))
          : parseCheques(event.body)
      if (
        source === "PlatformaOFD" &&
        !rows.length &&
        !/table-cheques_search|terminal_cheque_|(?:нет|не найдено)\s+чек|чек(?:и|ов)\s+не найден/i.test(
          event.body
        )
      ) {
        throw new Error(
          "ОФД: в ответе нет таблицы чеков. Возможна страница входа или изменение разметки"
        )
      }
      await save(rows, currentSession)
    }
    const enqueue = (task: () => Promise<void>, currentSession: number) => {
      queue = queue.then(task).catch((error) => {
        if (!disposed && session === currentSession)
          log(
            "error",
            error instanceof Error ? error.message : "Неизвестная ошибка"
          )
      })
    }
    const onNetwork = (raw: Event) => {
      const detail = (
        raw as CustomEvent<{ source: ReceiptSource; event: NetEvent }>
      ).detail
      if (detail?.source !== source || !detail.event) return
      const event = detail.event
      if (
        !isReceiptResponse(source, event.requestUrl) &&
        !isReceiptResponse(source, event.url)
      ) {
        log(
          "info",
          `Прочий запрос: ${event.method} ${diagnosticUrl(event.url || "")} → HTTP ${event.status ?? "?"}`,
          false
        )
        return
      }
      if (!event.replayed)
        update({ responses: statusRef.current.responses + 1 })
      log(
        "info",
        `${event.replayed ? "Кэш: " : ""}${event.kind.toUpperCase()} ${event.method} ${diagnosticUrl(event.url || event.requestUrl || "")} → HTTP ${event.status ?? "?"}; ${event.body?.length ?? 0} символов${event.truncated ? "; ОБРЕЗАНО" : ""}`,
        false
      )
      if (!statusRef.current.running) return
      clearTimeout(waitTimer)
      const currentSession = session
      enqueue(() => consume(event, currentSession), currentSession)
    }
    const onReady = (event: Event) => {
      if ((event as CustomEvent).detail?.source !== source) return
      if (!statusRef.current.interceptorReady)
        log("info", "Перехватчик подключён (XHR и fetch)")
      update({ interceptorReady: true })
    }
    const stop = (): ParserReply => {
      session++
      clearTimeout(waitTimer)
      update({ running: false })
      log("info", "Сбор остановлен. Уже отправленная запись может завершиться")
      return { ok: true, status: statusRef.current }
    }
    const start = (datasetId?: string): Promise<ParserReply> => {
      if (starting) return starting
      starting = (async () => {
        try {
          if (!isReceiptPage(source, location.href))
            throw new Error(
              source === "Costviser"
                ? "Откройте раздел «Чеки» (#/checks) в Trade"
                : "Откройте раздел «Чеки» в Платформе ОФД"
            )
          if (statusRef.current.running)
            return { ok: true, status: statusRef.current }
          const requestedSession = session
          await ensureBridge()
          // Pin the dataset for this run, even if popup selection changes later.
          if (!datasetId) {
            const active = await chrome.runtime.sendMessage({
              type: "GET_ACTIVE_DATASET"
            })
            if (!active?.ok)
              throw new Error(active?.error || "Не выбрана выборка")
            datasetId = active.datasetId
          }
          if (!datasetId) throw new Error("Не выбрана выборка")
          if (disposed || session !== requestedSession)
            throw new Error("Запуск отменён")
          session++
          const currentSession = session
          seen.clear()
          update({ running: true, datasetId, saved: 0 })
          log(
            "info",
            "Сбор включён. Выполните поиск или переключите страницу списка чеков"
          )
          waitTimer = setTimeout(() => {
            if (statusRef.current.running && currentSession === session)
              log(
                "warn",
                "За 15 секунд не получено ответа со списком чеков. Выполните поиск/смените страницу. Если список обновился, а ответов нет — мог измениться адрес API"
              )
          }, 15_000)
          // Read an already rendered OFD table. Trade replays its latest API page.
          if (source === "PlatformaOFD") {
            const rows = parseCheques(document.documentElement)
            if (rows.length) {
              clearTimeout(waitTimer)
              enqueue(() => save(rows, currentSession), currentSession)
            } else requestBridge(true)
          } else requestBridge(true)
          return { ok: true, status: statusRef.current }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Ошибка запуска"
          clearTimeout(waitTimer)
          update({ running: false })
          log("error", message)
          return { ok: false, error: message, status: statusRef.current }
        }
      })().finally(() => {
        starting = null
      })
      return starting
    }
    controls.current = { start, stop }
    const onMessage = (
      msg: { type?: string; datasetId?: string },
      _sender: chrome.runtime.MessageSender,
      respond: (reply: ParserReply) => void
    ) => {
      if (msg?.type === "PARSER_STATUS") {
        respond({ ok: true, status: statusRef.current })
        return
      }
      if (msg?.type === "STOP_PARSE") {
        respond(stop())
        return
      }
      if (msg?.type === "START_PARSE") {
        void start(msg.datasetId).then(respond)
        return true
      }
    }
    window.addEventListener(NET_EVENT, onNetwork)
    window.addEventListener(BRIDGE_READY, onReady)
    chrome.runtime.onMessage.addListener(onMessage)
    log(
      "info",
      `Страница: ${diagnosticUrl(location.href)}; версия расширения: ${chrome.runtime.getManifest().version}`
    )
    void ensureBridge().catch((error) => log("error", error.message))
    return () => {
      disposed = true
      session++
      clearTimeout(waitTimer)
      window.removeEventListener(NET_EVENT, onNetwork)
      window.removeEventListener(BRIDGE_READY, onReady)
      chrome.runtime.onMessage.removeListener(onMessage)
      controls.current = null
    }
  }, [source])

  return {
    status,
    start: () => controls.current?.start(),
    stop: () => controls.current?.stop()
  }
}
