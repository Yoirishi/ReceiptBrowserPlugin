const assert = require("node:assert/strict")
const { test } = require("node:test")
const { runtime, chromeEvent, tick } = require("./runtime.cjs")

function background({ addRows = async () => {} } = {}) {
  const onMessage = chromeEvent()
  const calls = []
  const chrome = {
    runtime: {
      id: "test",
      getURL: (path) => `chrome-extension://test/${path}`,
      onMessage,
      onInstalled: chromeEvent()
    },
    scripting: {
      getRegisteredContentScripts: async () => [
        { id: "receipt-parser-costviser" },
        { id: "srcContentsPlatformaofdChequesInterceptor" }
      ],
      unregisterContentScripts: async (value) =>
        calls.push(["unregister", value]),
      updateContentScripts: async (value) => calls.push(["update", value]),
      registerContentScripts: async (value) => calls.push(["register", value]),
      executeScript: async (value) => calls.push(["execute", value])
    }
  }
  runtime(
    { chrome },
    {
      "~src/lib/datasetsRepo": {
        datasetsRepo: {
          get: async (id) => (id === "chosen" ? { id } : undefined),
          getActive: async () => ({ id: "chosen", name: "Selected" }),
          addRows
        }
      }
    }
  ).load("src/background/index.ts")
  const message = (msg, url = "https://tdom27.costviser.ru/#/checks") =>
    new Promise((resolve) => {
      assert.equal(
        onMessage.dispatch(
          msg,
          { id: "test", url, tab: { id: 12 }, frameId: 0 },
          resolve
        )[0],
        true
      )
    })
  return { message, calls }
}

test("background updates persisted scripts and removes obsolete registrations", async () => {
  const { calls } = background()
  await tick()
  assert.equal(calls[0][0], "unregister")
  const update = calls.find(([name]) => name === "update")[1][0]
  assert.ok(update.matches.includes("https://*.4ait.ru/*"))
  assert.equal(update.world, "MAIN")
  assert.equal(update.js[0], "costviser.js")
  assert.equal(
    calls.find(([name]) => name === "register")[1][0].matches[0],
    "https://lk.platformaofd.ru/*"
  )
})

test("save acknowledges only after storage succeeds and uses the explicit dataset", async () => {
  let finish
  let stored
  const { message } = background({
    addRows: (...args) => {
      stored = args
      return new Promise((resolve) => {
        finish = resolve
      })
    }
  })
  let acknowledged = false
  const pending = message({
    type: "save-cheques",
    datasetId: "chosen",
    rows: [{ id: "1" }],
    meta: { source: "Costviser" }
  }).then((result) => {
    acknowledged = true
    return result
  })
  await tick()
  assert.equal(acknowledged, false)
  assert.equal(stored[0], "chosen")
  finish()
  const reply = await pending
  assert.equal(reply.ok, true)
  assert.equal(reply.saved, 1)
  assert.equal(reply.datasetId, "chosen")
})

test("missing datasets and database failures return readable errors", async () => {
  const { message } = background({
    addRows: async () => {
      throw new Error("Quota exceeded")
    }
  })
  const request = {
    type: "save-cheques",
    datasetId: "missing",
    rows: [{ id: "1" }],
    meta: { source: "Costviser" }
  }
  assert.match((await message(request)).error, /Выборка не найдена/)
  assert.equal(
    (await message({ ...request, datasetId: "chosen" })).error,
    "Quota exceeded"
  )
  assert.equal(
    (await message({ ...request, datasetId: "chosen", rows: [{}] })).ok,
    false
  )
})

test("interceptor can be injected into the current tab on a legacy host", async () => {
  const { message, calls } = background()
  assert.equal(
    (
      await message(
        { type: "ENSURE_INTERCEPTOR" },
        "https://tdom27.4ait.ru/#/checks"
      )
    ).ok,
    true
  )
  const execute = calls.find(([name]) => name === "execute")[1]
  assert.equal(execute.target.tabId, 12)
  assert.equal(execute.world, "MAIN")
  assert.equal(execute.files[0], "costviser.js")
})
