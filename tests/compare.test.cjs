const assert = require("node:assert/strict")
const { test } = require("node:test")
const { runtime } = require("./runtime.cjs")
const { compareCheques, amountInKopecks, summarizeCheques, receiptDetailsUrl } =
  runtime().load("src/lib/compareCheques.ts")

const row = (id, overrides = {}) => ({
  id,
  date: "02.11.2026 12:30",
  deviceName: "Касса 1",
  amount: "123,45 ₽",
  sign: "Приход",
  paymentType: "Оплата картой",
  shift: "206",
  source: "PlatformaOFD",
  sale: "7",
  fnsStatus: "",
  crptStatus: "",
  detailsUrl: "",
  ts: 1,
  ...overrides
})

test("comparison returns pairs and separate excess receipts on both sides", () => {
  const left = [row("ofd-1"), row("ofd-extra", { amount: "100 ₽" })]
  const right = [
    row("trade-1", { source: "Costviser" }),
    row("trade-extra", { source: "Costviser", amount: "200 ₽" })
  ]
  const result = compareCheques(left, right)
  assert.equal(result.pairs.length, 1)
  assert.equal(result.pairs[0].left.id, "ofd-1")
  assert.equal(result.pairs[0].right.id, "trade-1")
  assert.equal(result.onlyLeft[0].row.id, "ofd-extra")
  assert.equal(result.onlyRight[0].row.id, "trade-extra")
  assert.equal(left.length, 2)
  assert.equal(right.length, 2)
})

test("duplicates are paired one-to-one and an extra identical receipt remains visible", () => {
  const result = compareCheques(
    [row("a"), row("b"), row("c")],
    [row("x"), row("y")]
  )
  assert.equal(result.pairs.length, 2)
  assert.equal(result.onlyLeft.length, 1)
  assert.equal(result.onlyLeft[0].row.id, "c")
  assert.equal(new Set(result.pairs.map((pair) => pair.right.id)).size, 2)
})

test("empty sides finish comparison and preserve all receipts on the other side", () => {
  assert.equal(compareCheques([], []).pairs.length, 0)
  assert.equal(compareCheques([row("a")], []).onlyLeft.length, 1)
  assert.equal(compareCheques([], [row("b")]).onlyRight.length, 1)
})

test("two datasets from the same source can be compared", () => {
  assert.equal(compareCheques([row("a")], [row("b")]).pairs.length, 1)
})

test("format differences normalize while keeping amount, minute, shift, operation and payment significant", () => {
  const original = row("a", { amount: "1 234,50 ₽" })
  const equivalent = row("b", {
    date: "2026-11-02T12:30:59+10:00",
    amount: "1234.50",
    shift: "0206",
    sign: " приход ",
    paymentType: "Оплата   КАРТОЙ"
  })
  assert.equal(compareCheques([original], [equivalent]).pairs.length, 1)
  for (const changes of [
    { amount: "1234.51" },
    { date: "02.11.2026 12:31" },
    { shift: "207" },
    { sign: "Возврат прихода" },
    { paymentType: "Наличными" }
  ])
    assert.equal(
      compareCheques([original], [{ ...equivalent, ...changes }]).pairs.length,
      0
    )
})

test("incomplete and invalid fields cannot silently match, including invalid amount versus zero", () => {
  for (const changes of [
    { date: "31.02.2026 12:30" },
    { date: "" },
    { amount: "" },
    { shift: "" },
    { sign: "" },
    { paymentType: "" }
  ]) {
    const result = compareCheques([row("a", changes)], [row("b", changes)])
    assert.equal(result.pairs.length, 0)
    assert.match(result.onlyLeft[0].reason, /Не распознаны поля/)
    assert.match(result.onlyRight[0].reason, /Не распознаны поля/)
  }
  assert.equal(
    compareCheques([row("a", { amount: "нет" })], [row("b", { amount: "0" })])
      .pairs.length,
    0
  )
})

test("money uses exact kopecks and summaries flag invalid amounts", () => {
  assert.equal(amountInKopecks("1\u202f234,56 ₽"), 123456)
  assert.equal(amountInKopecks("-0,01 руб."), -1)
  assert.equal(amountInKopecks("0"), 0)
  assert.equal(amountInKopecks("1,234"), null)
  assert.equal(amountInKopecks("abc123"), null)
  const summary = summarizeCheques([
    row("a", { amount: "0.10" }),
    row("b", { amount: "0.20", paymentType: "Наличными" }),
    row("c", { amount: "—" })
  ])
  assert.equal(summary.total, 30)
  assert.equal(summary.card, 10)
  assert.equal(summary.cash, 20)
  assert.equal(summary.invalidAmounts, 1)
  assert.equal(summary.count, 3)
})

test("swapping sides swaps excess lists and keeps the pair count", () => {
  const left = [row("a"), row("b", { amount: "50" })]
  const right = [row("x")]
  const forward = compareCheques(left, right)
  const backward = compareCheques(right, left)
  assert.equal(forward.pairs.length, backward.pairs.length)
  assert.equal(forward.onlyLeft[0].row.id, backward.onlyRight[0].row.id)
})

test("detail links resolve OFD paths and reject executable URLs", () => {
  assert.equal(
    receiptDetailsUrl(row("a", { detailsUrl: "/web/auth/cheques/details/42" })),
    "https://lk.platformaofd.ru/web/auth/cheques/details/42"
  )
  assert.equal(
    receiptDetailsUrl(row("a", { detailsUrl: "javascript:alert(1)" })),
    null
  )
  assert.equal(
    receiptDetailsUrl(
      row("a", { source: "Costviser", detailsUrl: "/checks/42" })
    ),
    null
  )
})

test("large identical groups preserve multiplicity without repeatedly scanning the other side", () => {
  const left = Array.from({ length: 5000 }, (_, index) => row(`a-${index}`))
  const right = Array.from({ length: 4999 }, (_, index) => row(`b-${index}`))
  const result = compareCheques(left, right)
  assert.equal(result.pairs.length, 4999)
  assert.equal(result.onlyLeft.length, 1)
})
