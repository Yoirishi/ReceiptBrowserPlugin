/* net-interceptor.ts */

/**
 * Перехватчик сетевых ответов в среде браузера.
 *
 * Устанавливает хуки на:
 *  - `XMLHttpRequest` (XHR)
 *  - `fetch`
 *  - (опционально) jQuery AJAX через `ajaxComplete`
 *
 * Цель — читать *ответ* (status/headers/body) и отправлять события в ваш колбэк.
 * По умолчанию читаются только «текстовые» типы (через токены в `contentTypes`),
 * тело ограничивается по длине (`maxBodyChars`) и НЕ модифицируется для страницы.
 *
 * ⚠️ ВАЖНО:
 *  - Ставьте код в **main-world** страницы (а не в isolated world контент-скрипта),
 *    иначе jQuery/XHR страницы не зацепятся. В MV3 инжектируйте через
 *    `chrome.scripting.executeScript({ world: "MAIN", injectImmediately: true, ... })`
 *    на `document_start`.
 *  - Для кросс-оригин no-CORS ответов (тип `opaque`) тело недоступно (и статус обычно `0`).
 *    При `skipOpaque: true` такие ответы пропускаются.
 *  - Для потоков вроде `text/event-stream` чтение тела потенциально бесконечное.
 *    Мы читаем до `maxBodyChars`, затем отменяем ридер.
 *
 * @example Простейшее подключение
 * ```ts
 * import { createNetInterceptor } from './net-interceptor';
 *
 * const teardown = createNetInterceptor({
 *   onEvent: (e) => {
 *     console.log('[NET]', e.kind, e.status, e.method, e.url, e.contentType, e.body?.length);
 *   },
 *   contentTypes: ['json', 'html', 'xml', 'form'], // или ['any'] чтобы брать всё
 *   maxBodyChars: 1_000_000,
 *   include: { xhr: true, fetch: true, jquery: true },
 * });
 *
 * // позже, чтобы снять патчи:
 * // teardown();
 * ```
 */

export type NetKind = 'xhr' | 'fetch' | 'jquery';

/**
 * Событие перехваченного ответа.
 */
export interface NetEvent {
  /** Источник: XHR, fetch или jQuery-хук. */
  kind: NetKind;
  /** HTTP-метод, если доступен. */
  method: string;
  /** Итоговый URL (после редиректов для XHR/fetch), если доступен. */
  url: string | undefined;
  requestUrl?: string;
  replayed?: boolean;
  /**
   * HTTP-статус. Для `fetch` c `opaque` может быть `0`.
   * Для jQuery указано из `xhr.status`, если доступен.
   */
  status: number | undefined | null;
  /** Время от начала отправки до завершения (мс). Для jQuery — `null`. */
  timeMs: number | null;
  /**
   * Тело ответа (обрезано до `maxBodyChars`), либо `null`, если тип контента
   * не прошел фильтр, тело бинарное/недоступно, или чтение бросило исключение.
   */
  body: string | null;
  /** Заголовок Content-Type (как вернул сервер), либо `null`. */
  contentType?: string | null;
  truncated?: boolean;
  readError?: boolean;
}

/**
 * Человекочитаемые токены для фильтрации Content-Type.
 * Можно смешивать шорткаты и точные MIME-строки.
 *
 * - `'any'` — матчится на всё. Если присутствует, `extraContentType` игнорируется.
 * - `'text/*'` — любые `text/…`
 * - `'json'` — `application/json` и `*\/*+json`
 * - `'xml'` — `application/xml`, `*\/*+xml`, `text/xml`
 * - `'form'` — `application/x-www-form-urlencoded`
 * - `'event-stream'` — `text/event-stream`
 * - Остальные — очевидные точные или шорткатные типы.
 */
export type ContentTypeToken =
  | 'any'
  // шорткаты
  | 'text/*'
  | 'plain'             // text/plain
  | 'html'              // text/html
  | 'css'               // text/css
  | 'csv'               // text/csv
  | 'json'              // application/json, */*+json
  | 'ndjson'            // application/x-ndjson
  | 'xml'               // application/xml, */*+xml, text/xml
  | 'js'                // application/javascript, text/javascript
  | 'form'              // application/x-www-form-urlencoded
  | 'event-stream'      // text/event-stream
  // дословные MIME (для точного матча)
  | 'text/plain'
  | 'text/html'
  | 'text/css'
  | 'text/csv'
  | 'application/json'
  | 'application/ld+json'
  | 'application/x-ndjson'
  | 'application/xml'
  | 'text/xml'
  | 'application/javascript'
  | 'text/javascript'
  | 'application/x-www-form-urlencoded';

/**
 * Опции фабрики перехватчика.
 */
export interface CreateNetInterceptorOptions {
  /**
   * Колбэк, который получает каждое событие сети.
   * Ничего не возвращает, исключения глотаются внутри перехватчика.
   */
  onEvent: (e: NetEvent) => void;
  /** Filter URLs before reading or cloning response bodies. */
  shouldCapture?: (url: string | undefined) => boolean;
  onIgnoredResponse?: (event: NetEvent) => void;

  /**
   * Какие Content-Type читать и передавать в `onEvent`.
   * По умолчанию `['any']` — читаем все типы (может быть тяжело для бинарей!).
   *
   * Рекомендуемый безопасный набор: `['json', 'text/*', 'xml', 'form']`.
   */
  contentTypes?: ContentTypeToken[];

  /**
   * Дополнительные паттерны для Content-Type (RegExp или строка для RegExp).
   * ⚠️ Если среди `contentTypes` есть `'any'`, этот параметр **игнорируется**.
   */
  extraContentType?: Array<RegExp | string>;

  /**
   * Максимальная длина тела в символах. Текст режется справа.
   * По умолчанию `100_000`. Установите больше/меньше по потребности.
   */
  maxBodyChars?: number;

  /**
   * Что именно патчить. По умолчанию всё `true`.
   * - `xhr`: перехват через `XMLHttpRequest.prototype`
   * - `fetch`: перехват `window.fetch` (с чтением `Response` из `clone()`)
   * - `jquery`: хук на `$(document).ajaxComplete(...)`
   */
  include?: { xhr?: boolean; fetch?: boolean; jquery?: boolean };

  /**
   * Пропускать ли `fetch`-ответы с `res.type === 'opaque'` (no-CORS).
   * По умолчанию `true`, т.к. их тело всё равно недоступно.
   */
  skipOpaque?: boolean;
}

/**
 * Создаёт перехватчик сети и устанавливает патчи.
 *
 * Патчи ставятся безопасно: повторная установка не дублирует хук (стоят гварды),
 * а возвратная функция `teardown()` полностью откатывает изменения.
 *
 * @param opts Опции перехватчика (см. {@link CreateNetInterceptorOptions})
 * @returns Функция `teardown()`, снимающая все установленные патчи.
 *
 * @example Фильтруем только JSON и NDJSON, отправляем в background:
 * ```ts
 * const teardown = createNetInterceptor({
 *   onEvent: (e) => chrome.runtime.sendMessage({ type: 'NET_EVENT', payload: e }),
 *   contentTypes: ['json', 'ndjson'],
 *   maxBodyChars: 200_000,
 *   include: { xhr: true, fetch: true, jquery: false },
 * });
 * ```
 */
export function createNetInterceptor(opts: CreateNetInterceptorOptions): () => void {
  const {
    onEvent,
    shouldCapture = () => true,
    onIgnoredResponse,
    contentTypes = ['any'],
    extraContentType = [],
    maxBodyChars = 100_000,
    include = { xhr: true, fetch: true, jquery: true },
    skipOpaque = true,
  } = opts;

  if (typeof onEvent !== 'function') {
    throw new Error('createNetInterceptor: onEvent callback is required');
  }

  const allowCT = buildCtMatcher(contentTypes, extraContentType);
  const unpatchers: Array<() => void> = [];

  // ------- XHR -------
  if (include.xhr && typeof XMLHttpRequest !== 'undefined') {
    const XHR = XMLHttpRequest;
    const nativeOpen = XHR.prototype.open;
    const nativeSend = XHR.prototype.send;

    const GUARD = '__netInterceptorPatched__';
    if (!(XHR.prototype as any)[GUARD]) {
      (XHR.prototype as any)[GUARD] = true;

      XHR.prototype.open = function (this: XMLHttpRequest, method: string, url: string) {
        (this as any).__ext = { method, url };
        return nativeOpen.apply(this, arguments as any);
      };

      XHR.prototype.send = function (this: XMLHttpRequest) {
        const start = performance.now();
        const onEnd = () => {
          try {
            const ms = +(performance.now() - start).toFixed(1);
            const ct = safeGetCt(this);
            const url = this.responseURL || (this as any).__ext?.url;
            const requestUrl = (this as any).__ext?.url;
            if (!shouldCapture(url) && !shouldCapture(requestUrl)) {
              onIgnoredResponse?.({ kind: 'xhr', method: (this as any).__ext?.method || 'GET', url, status: this.status, timeMs: ms, body: null, contentType: ct });
              return;
            }
            let bodyText: string | null = null;
            let truncated = false;

            // тело читаем только для текстовых/разрешённых типов
            if ((this.responseType === '' || this.responseType === 'text') && allowCT(ct)) {
              bodyText = String(this.responseText);
              truncated = bodyText.length > maxBodyChars;
              if (truncated) bodyText = bodyText.slice(0, maxBodyChars);
            } else if (this.responseType === 'json' && allowCT(ct)) {
              bodyText = JSON.stringify(this.response);
              truncated = bodyText.length > maxBodyChars;
              if (truncated) bodyText = bodyText.slice(0, maxBodyChars);
            }

            onEvent({
              kind: 'xhr',
              method: (this as any).__ext?.method || 'GET',
              url,
              requestUrl,
              status: this.status,
              timeMs: ms,
              body: bodyText,
              contentType: ct,
              truncated,
            });
          } catch { /* noop */ }
          this.removeEventListener('loadend', onEnd);
        };

        this.addEventListener('loadend', onEnd, { once: true });
        return nativeSend.apply(this, arguments as any);
      };

      unpatchers.push(() => {
        try {
          XHR.prototype.open = nativeOpen;
          XHR.prototype.send = nativeSend;
          delete (XHR.prototype as any)[GUARD];
        } catch { /* noop */ }
      });
    }
  }

  // ------- fetch -------
  if (include.fetch && typeof (globalThis as any).fetch === 'function') {
    const nativeFetch: typeof fetch = (globalThis as any).fetch.bind(globalThis);
    const GUARD = '__netInterceptorFetchPatched__';

    if (!(globalThis as any)[GUARD]) {
      (globalThis as any)[GUARD] = true;

      (globalThis as any).fetch = function (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
        const t0 = performance.now();
        const [input, init] = args;
        const method = init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET');
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;

        return nativeFetch(...args).then((res) => {
          if (!shouldCapture(res.url || url) && !shouldCapture(url)) {
            try { onIgnoredResponse?.({ kind: 'fetch', method, url: res.url || url, status: res.status, timeMs: +(performance.now() - t0).toFixed(1), body: null }); } catch {}
            return res;
          }
          // Start reading a clone synchronously, then return the original response
          // immediately. A slow/streaming body must never block the website.
          try {
            const captured = res.clone();
            void (async () => { try {
            const ms = +(performance.now() - t0).toFixed(1);
            const ct = res.headers.get('content-type');
            let bodyText: string | null = null;

            if (!(skipOpaque && res.type === 'opaque') && allowCT(ct)) {
              bodyText = await readResponseLimited(captured, maxBodyChars + 1);
            }

            onEvent({
              kind: 'fetch',
              method,
              url: res.url || url,
              requestUrl: url,
              status: res.status,
              timeMs: ms,
              body: bodyText?.slice(0, maxBodyChars) ?? null,
              contentType: ct,
              truncated: bodyText !== null && bodyText.length > maxBodyChars,
              readError: bodyText === null,
            });
          } catch {
            onEvent({ kind: 'fetch', method, url: res.url || url, status: res.status, timeMs: null, body: null, readError: true });
            } })().catch(() => {});
          } catch {
            try { onEvent({ kind: 'fetch', method, url: res.url || url, requestUrl: url, status: res.status, timeMs: null, body: null, readError: true }); } catch {}
          }
          return res;
        }, (error) => {
          if (shouldCapture(url)) {
            try { onEvent({ kind: 'fetch', method, url, status: 0, timeMs: null, body: null }); } catch {}
          }
          throw error;
        });
      };

      unpatchers.push(() => {
        try {
          (globalThis as any).fetch = nativeFetch;
          delete (globalThis as any)[GUARD];
        } catch { /* noop */ }
      });
    }
  }

  // ------- jQuery hooks -------
  if (include.jquery && (globalThis as any).jQuery) {
    try {
      const $: any = (globalThis as any).jQuery;
      const handler = (_e: any, xhr: XMLHttpRequest, options: any) => {
        try {
          if (!shouldCapture(xhr.responseURL || options?.url)) return;
          const ct = safeGetCt(xhr);
          let bodyText: string | null = null;
          if ((xhr.responseType === '' || xhr.responseType === 'text') && allowCT(ct)) {
            bodyText = String((xhr as any).responseText ?? '');
            if (bodyText.length > maxBodyChars) bodyText = bodyText.slice(0, maxBodyChars);
          }
          onEvent({
            kind: 'jquery',
            method: (options && options.type) || 'GET',
            url: (xhr && (xhr as any).responseURL) || (options && options.url),
            status: xhr && (xhr as any).status,
            timeMs: null,
            body: bodyText,
            contentType: ct,
          });
        } catch { /* noop */ }
      };

      $(document).on('ajaxComplete', handler);
      unpatchers.push(() => {
        try { $(document).off('ajaxComplete', handler); } catch { /* noop */ }
      });
    } catch { /* ignore */ }
  }

  return () => { for (const un of unpatchers.splice(0)) try { un(); } catch {} };
}

/* --------------------------------- helpers -------------------------------- */

/**
 * Строит функцию-матчер для `Content-Type` на основе токенов и доп. паттернов.
 *
 * Особые случаи:
 *  - Если среди `tokens` есть `'any'`, возвращается функция, которая всегда `true`,
 *    а `extras` игнорируются (это ожидаемо: «берите всё»).
 */
function buildCtMatcher(tokens: ContentTypeToken[], extras: Array<RegExp | string>) {
  const res: RegExp[] = [];

  for (const t of tokens) {
    switch (t) {
      case 'any':
        return (_ct: string | null) => true;

      case 'text/*': res.push(/^text\//i); break;
      case 'plain': res.push(/^text\/plain(?:;|$)/i); break;
      case 'html': res.push(/^text\/html(?:;|$)/i); break;
      case 'css': res.push(/^text\/css(?:;|$)/i); break;
      case 'csv': res.push(/^text\/csv(?:;|$)/i); break;
      case 'json': res.push(/^(?:application\/json|application\/.+\+json)(?:;|$)/i); break;
      case 'ndjson': res.push(/^application\/x-ndjson(?:;|$)/i); break;
      case 'xml': res.push(/^(?:application\/xml|application\/.+\+xml|text\/xml)(?:;|$)/i); break;
      case 'js': res.push(/^(?:application|text)\/(?:javascript|ecmascript)(?:;|$)/i); break;
      case 'form': res.push(/^application\/x-www-form-urlencoded(?:;|$)/i); break;
      case 'event-stream': res.push(/^text\/event-stream(?:;|$)/i); break;

      // точные MIME:
      default: {
        // допускаем ;charset=..., поэтому матчим начало + опциональные параметры
        const escaped = escapeRegex(t);
        res.push(new RegExp(`^${escaped}(?:;|$)`, 'i'));
      }
    }
  }

  for (const ex of extras) res.push(typeof ex === 'string' ? new RegExp(ex, 'i') : ex);

  return (ct: string | null) => {
    if (!ct) return false;
    return res.some((re) => re.test(ct));
  };
}

/** Экранирует строку для безопасного встраивания в RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Безопасно читает `Content-Type` из XHR. На некоторых стадиях/ошибках вернёт `null`.
 */
function safeGetCt(xhr: XMLHttpRequest): string | null {
  try { return xhr.getResponseHeader?.('Content-Type'); } catch { return null; }
}

/**
 * Читает тело `Response` ограниченно по символам.
 * Предпочитает потоковое чтение через `ReadableStreamDefaultReader`, чтобы
 * не держать в памяти весь ответ. Если stream недоступен — читает `text()`.
 *
 * @param res   Клон Response, принадлежащий перехватчику.
 * @param maxChars Лимит символов. Если достигнут — чтение останавливается.
 * @returns Строка тела (возможно усечённая) или `null`, если прочитать не удалось.
 */
async function readResponseLimited(res: Response, maxChars: number): Promise<string | null> {
  try {
    const clone = res;
    if (clone.body && 'getReader' in clone.body) {
      const reader = clone.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        if (acc.length >= maxChars) {
          acc = acc.slice(0, maxChars);
          void reader.cancel().catch(() => {});
          break;
        }
      }
      acc += decoder.decode();
      return acc;
    }
    let text = await clone.text();
    if (text.length > maxChars) text = text.slice(0, maxChars);
    return text;
  } catch {
    return null;
  }
}
