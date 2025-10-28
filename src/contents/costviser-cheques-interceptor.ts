import { log } from "node:util";
import type { PlasmoCSConfig } from "plasmo";



import { createNetInterceptor } from "~src/utils/XhrRequestInterceptor";





export const config: PlasmoCSConfig = {
  matches: ["https://*.costviser.ru/*"],
  run_at: "document_start",
  world: "MAIN"
};

const MAX_BODY_CHARS = 1_000_000
type TeardownFn = () => void

// Храним текущий teardown, чтобы не плодить перехватчики
let teardown: TeardownFn | null = null

const isChecksRoute = () => location.hash.startsWith("#/checks")

const startInterceptor = () => {
  if (teardown) return // уже запущен
  console.log("Start interceptor")
  teardown = createNetInterceptor({
    maxBodyChars: MAX_BODY_CHARS,
    onEvent: (event) => {
      if (event.url?.match("costviser\\.ru\\/checks")) {
        window.dispatchEvent(new CustomEvent("ext:net", { detail: event }))
      }
    }
  })
}

const stopInterceptor = () => {
  if (!teardown) return
  try {
    console.log("Stop interceptor")
    teardown()
  } catch {  }
  teardown = null
}

const onRoute = () => {
  console.log('on route invoked');
  if (isChecksRoute()) startInterceptor()
  else stopInterceptor()
}

// Патчим History API, чтобы отлавливать SPA-навигацию без перезагрузки
;(() => {
  const { pushState, replaceState } = history
  history.pushState = function (...args) {
    const r = pushState.apply(this, args as any)
    window.dispatchEvent(new Event("locationchange"))
    return r
  }
  history.replaceState = function (...args) {
    const r = replaceState.apply(this, args as any)
    window.dispatchEvent(new Event("locationchange"))
    return r
  }
  window.addEventListener("popstate", () => {
    window.dispatchEvent(new Event("locationchange"))
  })
})()

// Реагируем на SPA-навигацию
window.addEventListener("hashchange", onRoute)
window.addEventListener("locationchange", onRoute)

// снимаем перехватчик при уходе со страницы
window.addEventListener("beforeunload", stopInterceptor)

// Первый запуск
onRoute()
