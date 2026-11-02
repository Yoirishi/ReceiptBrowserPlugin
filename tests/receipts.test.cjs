const assert = require("node:assert/strict")
const { test } = require("node:test")
const { runtime, tick } = require("./runtime.cjs")

test("current and legacy Trade hosts, OFD navigation, and API prefixes are recognized", () => {
  const { load } = runtime()
  const sites = load("src/lib/receiptProtocol.ts")
  for (const host of [
    "tdom27.costviser.ru",
    "tdom27.4ait.ru",
    "costviser.ru"
  ]) {
    assert.equal(sites.receiptSource(`https://${host}/`), "Costviser")
  }
  assert.equal(sites.receiptSource("https://costviser.ru.attacker.test/"), null)
  assert.equal(
    sites.isReceiptPage(
      "Costviser",
      "https://tdom27.costviser.ru/#/checks?sort=date"
    ),
    true
  )
  assert.equal(
    sites.isReceiptResponse(
      "Costviser",
      "https://tdom27.costviser.ru/api/v2/checks.json?page=2"
    ),
    true
  )
  assert.equal(sites.isReceiptResponse("Costviser", "/checks/123"), false)
  assert.equal(
    sites.isReceiptResponse("PlatformaOFD", "/web/auth/cheques/search?page=2"),
    true
  )
  assert.equal(
    sites.diagnosticUrl("https://test.example/checks?token=secret#password"),
    "https://test.example/checks"
  )
})

test("Trade accepts absent optional metadata and KKT; numeric strings are mapped correctly", () => {
  const { load } = runtime()
  const { parseCostviserResponse } = load(
    "src/utils/isCostviserChecksResponse.ts"
  )
  const { mapCostviserToCheques } = load("src/utils/mapCheques.ts")
  const items = [1, 2].map((id) => ({
    id,
    num: 7,
    check_type: "sale",
    created_at: "2026-11-02T13:25:00+10:00",
    total: "123.45",
    shift: "206",
    payment_source: "electron",
    fields: { KKT: null }
  }))
  const rows = mapCostviserToCheques(
    parseCostviserResponse(JSON.stringify({ items }))
  )
  assert.equal(rows[0].date, "02.11.2026 13:25")
  assert.equal(rows[0].paymentType, "Оплата картой")
  assert.equal(rows[0].amount.replace(/\s/g, ""), "123,45₽")
  assert.notEqual(
    rows[0].id,
    rows[1].id,
    "same sale number must not collapse distinct receipts"
  )
})

test("Trade schema failures name the item and field; malformed JSON is explained", () => {
  const { parseCostviserResponse } = runtime().load(
    "src/utils/isCostviserChecksResponse.ts"
  )
  assert.throws(
    () => parseCostviserResponse("<html>Login</html>"),
    /не является JSON/
  )
  assert.throws(() => parseCostviserResponse('{"data":[]}'), /массивом items/)
  assert.throws(
    () => parseCostviserResponse('{"items":[{"id":1}]}'),
    /items\[0\].*total.*shift/
  )
  assert.equal(parseCostviserResponse('{"items":[]}').items.length, 0)
})

test("XHR captures JSON responses and marks truncation, with no duplicate jQuery capture", () => {
  class XHR extends EventTarget {
    responseType = "json"
    response = { items: [{ id: 1 }] }
    responseURL = "https://tdom27.costviser.ru/checks"
    status = 200
    open() {}
    send() {
      this.dispatchEvent(new Event("loadend"))
    }
    getResponseHeader() {
      return "application/json"
    }
  }
  const events = []
  const { load } = runtime({ XMLHttpRequest: XHR })
  const teardown = load(
    "src/utils/XhrRequestInterceptor.ts"
  ).createNetInterceptor({
    include: { xhr: true },
    maxBodyChars: 12,
    onEvent: (event) => events.push(event)
  })
  const xhr = new XHR()
  xhr.open("GET", "/checks")
  xhr.send()
  xhr.open("GET", "/checks")
  xhr.send()
  assert.equal(events.length, 2)
  assert.equal(events[0].body.length, 12)
  assert.equal(events[0].truncated, true)
  teardown()
})

test("fetch returns before its body finishes and never consumes the site's body", async () => {
  let finish
  const original = new Response(
    new ReadableStream({
      start(controller) {
        finish = () => {
          controller.enqueue(new TextEncoder().encode('{"items":[]}'))
          controller.close()
        }
      }
    })
  )
  const events = []
  const { load, context } = runtime({ fetch: async () => original })
  const teardown = load(
    "src/utils/XhrRequestInterceptor.ts"
  ).createNetInterceptor({
    include: { fetch: true },
    onEvent: (event) => events.push(event)
  })
  const received = await context.fetch(
    new Request("https://test.example/checks", { method: "POST" })
  )
  assert.equal(received, original)
  assert.equal(events.length, 0)
  finish()
  assert.equal(await received.text(), '{"items":[]}')
  await tick()
  assert.equal(events[0].body, '{"items":[]}')
  assert.equal(events[0].method, "POST")
  teardown()
})

test("fetch preserves network rejections and clone errors; filters bodies before reading", async () => {
  const networkError = new Error("offline")
  let response = null
  const events = []
  const ignored = []
  const { load, context } = runtime({
    fetch: async () => {
      if (!response) throw networkError
      return response
    }
  })
  const teardown = load(
    "src/utils/XhrRequestInterceptor.ts"
  ).createNetInterceptor({
    include: { fetch: true },
    shouldCapture: (url) => url.includes("checks"),
    onEvent: (event) => events.push(event),
    onIgnoredResponse: (event) => ignored.push(event)
  })
  await assert.rejects(
    context.fetch("https://test.example/checks"),
    (error) => error === networkError
  )
  assert.equal(events[0].status, 0)
  response = {
    url: "https://test.example/analytics",
    status: 200,
    clone() {
      throw new Error("must not clone unrelated response")
    }
  }
  assert.equal(await context.fetch(response.url), response)
  assert.equal(ignored.length, 1)
  response = {
    url: "https://test.example/checks",
    status: 200,
    clone() {
      throw new Error("clone failed")
    }
  }
  assert.equal(await context.fetch(response.url), response)
  teardown()
})

test("bridge replays a response received before UI mounted and does not install twice", async () => {
  const window = new EventTarget()
  const { load, context } = runtime({
    window,
    fetch: async () =>
      new Response('{"items":[]}', {
        headers: { "content-type": "application/json" }
      })
  })
  const protocol = load("src/lib/receiptProtocol.ts")
  const { startNetBridge } = load("src/utils/netBridge.ts")
  startNetBridge("Costviser")
  const patched = context.fetch
  startNetBridge("Costviser")
  assert.equal(context.fetch, patched)
  await context.fetch("https://tdom27.costviser.ru/checks")
  await tick()
  const events = []
  window.addEventListener(protocol.NET_EVENT, (event) =>
    events.push(event.detail)
  )
  let ready = false
  window.addEventListener(protocol.BRIDGE_READY, () => {
    ready = true
  })
  window.dispatchEvent(
    new CustomEvent(protocol.BRIDGE_REQUEST, {
      detail: { source: "Costviser", replay: true }
    })
  )
  assert.equal(ready, true)
  assert.equal(events.length, 1)
  assert.equal(events[0].event.body, '{"items":[]}')
})
