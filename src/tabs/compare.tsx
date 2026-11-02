import React, { useEffect, useMemo, useState, type CSSProperties } from "react"

import {
  compareCheques,
  receiptDetailsUrl,
  summarizeCheques,
  type UnmatchedCheque
} from "~src/lib/compareCheques"
import { datasetsRepo, type Dataset } from "~src/lib/datasetsRepo"
import { rowFromDatasetRow, type UIRow } from "~src/lib/receiptRows"

type SourceFilter = "all" | "PlatformaOFD" | "Costviser"
type Side = { datasetId: string; source: SourceFilter }
const PAGE_SIZE = 100
const sourceNames = {
  all: "Все источники",
  PlatformaOFD: "Платформа ОФД",
  Costviser: "Trade (Costviser)"
}
const money = (cents: number) =>
  (cents / 100).toLocaleString("ru-RU", { style: "currency", currency: "RUB" })
const includesQuery = (row: UIRow, query: string) =>
  [
    row.id,
    row.date,
    row.amount,
    row.deviceName,
    row.shift,
    row.sign,
    row.paymentType,
    row.source
  ]
    .join(" ")
    .toLocaleLowerCase("ru")
    .includes(query.trim().toLocaleLowerCase("ru"))

export default function ComparePage() {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [left, setLeft] = useState<Side>({
    datasetId: "",
    source: "PlatformaOFD"
  })
  const [right, setRight] = useState<Side>({
    datasetId: "",
    source: "Costviser"
  })
  const [rawRows, setRawRows] = useState<{ left: UIRow[]; right: UIRow[] }>({
    left: [],
    right: []
  })
  const [loadingDatasets, setLoadingDatasets] = useState(true)
  const [loadingRows, setLoadingRows] = useState(false)
  const [datasetsError, setDatasetsError] = useState("")
  const [rowsError, setRowsError] = useState("")
  const [revision, setRevision] = useState(0)
  const [query, setQuery] = useState("")

  useEffect(() => {
    let cancelled = false
    setLoadingDatasets(true)
    setDatasetsError("")
    void Promise.all([datasetsRepo.list(), datasetsRepo.getActiveId()])
      .then(([items, activeId]) => {
        if (cancelled) return
        setDatasets(items)
        const initialId =
          items.find((item) => item.id === activeId)?.id || items[0]?.id || ""
        const keepOrDefault = (side: Side) => ({
          ...side,
          datasetId: items.some((item) => item.id === side.datasetId)
            ? side.datasetId
            : initialId
        })
        setLeft(keepOrDefault)
        setRight(keepOrDefault)
      })
      .catch((error) => {
        if (!cancelled)
          setDatasetsError(
            `Не удалось загрузить выборки: ${error instanceof Error ? error.message : String(error)}`
          )
      })
      .finally(() => {
        if (!cancelled) setLoadingDatasets(false)
      })
    return () => {
      cancelled = true
    }
  }, [revision])

  useEffect(() => {
    if (!left.datasetId || !right.datasetId) return
    let cancelled = false
    setLoadingRows(true)
    setRowsError("")
    const load = async () => {
      // Reuse one snapshot when comparing two sources of the same dataset.
      const leftPromise = datasetsRepo.listAllRows(left.datasetId)
      const rightPromise =
        left.datasetId === right.datasetId
          ? leftPromise
          : datasetsRepo.listAllRows(right.datasetId)
      const [leftRows, rightRows] = await Promise.all([
        leftPromise,
        rightPromise
      ])
      if (!cancelled)
        setRawRows({
          left: leftRows.map(rowFromDatasetRow),
          right: rightRows.map(rowFromDatasetRow)
        })
    }
    void load()
      .catch((error) => {
        if (!cancelled)
          setRowsError(
            `Не удалось загрузить чеки: ${error instanceof Error ? error.message : String(error)}`
          )
      })
      .finally(() => {
        if (!cancelled) setLoadingRows(false)
      })
    return () => {
      cancelled = true
    }
  }, [left.datasetId, right.datasetId, revision])

  const leftRows = useMemo(
    () =>
      rawRows.left.filter(
        (row) => left.source === "all" || row.source === left.source
      ),
    [rawRows.left, left.source]
  )
  const rightRows = useMemo(
    () =>
      rawRows.right.filter(
        (row) => right.source === "all" || row.source === right.source
      ),
    [rawRows.right, right.source]
  )
  const comparison = useMemo(
    () => compareCheques(leftRows, rightRows),
    [leftRows, rightRows]
  )
  const leftSummary = useMemo(() => summarizeCheques(leftRows), [leftRows])
  const rightSummary = useMemo(() => summarizeCheques(rightRows), [rightRows])
  const leftName =
    datasets.find((item) => item.id === left.datasetId)?.name || "Левая выборка"
  const rightName =
    datasets.find((item) => item.id === right.datasetId)?.name ||
    "Правая выборка"
  const loading = loadingDatasets || loadingRows
  const error = datasetsError || rowsError
  const empty = leftRows.length === 0 && rightRows.length === 0
  const sameSelection =
    left.datasetId === right.datasetId && left.source === right.source

  return (
    <main style={wrap}>
      <header style={header}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26 }}>Сравнение чеков</h1>
          <p style={muted}>
            Найдите чеки, для которых нет пары в другой выборке.
          </p>
        </div>
        <div style={actions}>
          <button
            style={button}
            disabled={loading}
            onClick={() => setRevision((value) => value + 1)}>
            Обновить данные
          </button>
          <button style={ghostButton} onClick={() => window.close()}>
            Закрыть
          </button>
        </div>
      </header>

      <section style={card} aria-label="Настройки сравнения">
        <div style={columns}>
          <SidePicker
            title="Слева"
            datasets={datasets}
            value={left}
            onChange={setLeft}
          />
          <SidePicker
            title="Справа"
            datasets={datasets}
            value={right}
            onChange={setRight}
          />
        </div>
        <div style={{ ...actions, marginTop: 16 }}>
          <button
            style={ghostButton}
            disabled={loading || !datasets.length}
            onClick={() => {
              setLeft(right)
              setRight(left)
            }}>
            Поменять местами
          </button>
          <span style={muted}>
            Можно сравнить источники одной выборки или две разные выборки.
          </span>
        </div>
        <p style={{ ...muted, marginBottom: 0 }}>
          Пары 1:1 по дате и времени до минуты, сумме, смене, операции и типу
          оплаты. Повторные одинаковые чеки учитываются отдельно. Совпадение
          этих полей считается совпадением чека; ID и названия касс показаны для
          проверки.
        </p>
        {sameSelection && (
          <p style={notice}>
            С обеих сторон выбраны одинаковые выборка и источник — сравниваются
            одни и те же строки.
          </p>
        )}
      </section>

      {error && (
        <section role="alert" style={{ ...card, color: "#b91c1c" }}>
          {error}. Нажмите «Обновить данные», чтобы повторить.
        </section>
      )}
      {loading && (
        <section role="status" style={card}>
          Загружаем чеки и сопоставляем пары…
        </section>
      )}
      {!loading && !error && !datasets.length && (
        <section style={card}>
          Пока нет выборок. Создайте выборку в расширении и соберите чеки.
        </section>
      )}
      {!loading && !error && datasets.length > 0 && (
        <>
          <section style={statsGrid} aria-label="Результат сравнения">
            <Stat
              label="Совпавших пар"
              count={comparison.pairs.length}
              color="#166534"
            />
            <Stat
              label="Только слева"
              count={comparison.onlyLeft.length}
              color="#9a3412"
            />
            <Stat
              label="Только справа"
              count={comparison.onlyRight.length}
              color="#1d4ed8"
            />
          </section>
          {empty ? (
            <section role="status" style={card}>
              В выбранных источниках пока нет чеков. Выберите другие
              выборки/источники или загрузите чеки.
            </section>
          ) : (
            <>
              {!comparison.onlyLeft.length && !comparison.onlyRight.length && (
                <section role="status" style={{ ...card, color: "#166534" }}>
                  Все чеки сопоставлены: {comparison.pairs.length} пар.
                </section>
              )}
              {(!leftRows.length || !rightRows.length) && (
                <section style={notice}>
                  С {leftRows.length ? "правой" : "левой"} стороны нет чеков.
                  Все чеки другой стороны показаны как не имеющие пары.
                </section>
              )}
              <section style={card}>
                <h2 style={sectionTitle}>Итоги по выбранным чекам</h2>
                <div style={tableScroll}>
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={cell}>Показатель</th>
                        <th style={cell}>Слева · {leftName}</th>
                        <th style={cell}>Справа · {rightName}</th>
                        <th style={cell}>Разница: слева − справа</th>
                      </tr>
                    </thead>
                    <tbody>
                      <SummaryRow
                        title="Количество чеков"
                        left={leftSummary.count}
                        right={rightSummary.count}
                      />
                      <SummaryRow
                        title="Общая сумма"
                        left={leftSummary.total}
                        right={rightSummary.total}
                        currency
                      />
                      <SummaryRow
                        title="Оплата картой"
                        left={leftSummary.card}
                        right={rightSummary.card}
                        currency
                      />
                      <SummaryRow
                        title="Наличные"
                        left={leftSummary.cash}
                        right={rightSummary.cash}
                        currency
                      />
                    </tbody>
                  </table>
                </div>
                {(leftSummary.invalidAmounts > 0 ||
                  rightSummary.invalidAmounts > 0) && (
                  <p role="alert" style={notice}>
                    Итоговые суммы неполные: не распознана сумма у{" "}
                    {leftSummary.invalidAmounts} чеков слева и{" "}
                    {rightSummary.invalidAmounts} справа. Эти чеки остаются в
                    списках расхождений.
                  </p>
                )}
              </section>
              <label style={{ display: "block", margin: "20px 0" }}>
                <span
                  style={{
                    display: "block",
                    marginBottom: 6,
                    fontWeight: 600
                  }}>
                  Поиск по чекам
                </span>
                <input
                  style={{ ...input, width: "100%", maxWidth: 560 }}
                  placeholder="ID, дата, сумма, касса, смена…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <UnmatchedTable
                title="Только слева"
                name={`${leftName} · ${sourceNames[left.source]}`}
                otherName={`${rightName} · ${sourceNames[right.source]}`}
                entries={comparison.onlyLeft}
                query={query}
              />
              <UnmatchedTable
                title="Только справа"
                name={`${rightName} · ${sourceNames[right.source]}`}
                otherName={`${leftName} · ${sourceNames[left.source]}`}
                entries={comparison.onlyRight}
                query={query}
              />
              <details style={card}>
                <summary style={{ fontWeight: 600, cursor: "pointer" }}>
                  Совпавшие пары ({comparison.pairs.length})
                </summary>
                <MatchedTable pairs={comparison.pairs} query={query} />
              </details>
            </>
          )}
        </>
      )}
    </main>
  )
}

function SidePicker({
  title,
  datasets,
  value,
  onChange
}: {
  title: string
  datasets: Dataset[]
  value: Side
  onChange: (value: Side) => void
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <h2 style={sectionTitle}>{title}</h2>
      <label style={field}>
        Выборка
        <select
          aria-label={`${title}: выборка`}
          style={input}
          value={value.datasetId}
          onChange={(event) =>
            onChange({ ...value, datasetId: event.target.value })
          }>
          {!datasets.length && <option value="">Нет выборок</option>}
          {datasets.map((dataset) => (
            <option value={dataset.id} key={dataset.id}>
              {dataset.name}
            </option>
          ))}
        </select>
      </label>
      <label style={{ ...field, marginTop: 10 }}>
        Источник
        <select
          aria-label={`${title}: источник`}
          style={input}
          value={value.source}
          onChange={(event) =>
            onChange({ ...value, source: event.target.value as SourceFilter })
          }>
          {Object.entries(sourceNames).map(([source, name]) => (
            <option value={source} key={source}>
              {name}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

function Stat({
  label,
  count,
  color
}: {
  label: string
  count: number
  color: string
}) {
  return (
    <div style={{ ...card, marginBottom: 0 }}>
      <div style={muted}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color }}>
        {count.toLocaleString("ru-RU")}
      </div>
    </div>
  )
}

function SummaryRow({
  title,
  left,
  right,
  currency = false
}: {
  title: string
  left: number
  right: number
  currency?: boolean
}) {
  const show = (value: number) =>
    currency ? money(value) : value.toLocaleString("ru-RU")
  return (
    <tr>
      <th scope="row" style={cell}>
        {title}
      </th>
      <td style={cell}>{show(left)}</td>
      <td style={cell}>{show(right)}</td>
      <td
        style={{
          ...cell,
          color: left === right ? "#166534" : "#b45309",
          fontWeight: 600
        }}>
        {show(left - right)}
      </td>
    </tr>
  )
}

function ChequeId({ row }: { row: UIRow }) {
  const href = receiptDetailsUrl(row)
  return href ? (
    <a href={href} target="_blank" rel="noreferrer">
      {row.id || "Открыть чек"}
    </a>
  ) : (
    <>{row.id || "—"}</>
  )
}

function UnmatchedTable({
  title,
  name,
  otherName,
  entries,
  query
}: {
  title: string
  name: string
  otherName: string
  entries: UnmatchedCheque[]
  query: string
}) {
  const [page, setPage] = useState(0)
  const filtered = useMemo(
    () => entries.filter((entry) => includesQuery(entry.row, query)),
    [entries, query]
  )
  const maxPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1)
  const currentPage = Math.min(page, maxPage)
  useEffect(() => {
    setPage(0)
  }, [entries, query])
  const summary = useMemo(
    () => summarizeCheques(entries.map((entry) => entry.row)),
    [entries]
  )
  return (
    <section style={card} aria-label={title}>
      <h2 style={sectionTitle}>
        {title} ({entries.length})
      </h2>
      <p style={muted}>
        {name}. Пара не найдена в «{otherName}».
      </p>
      <p style={muted}>
        Сумма лишних чеков: {money(summary.total)}
        {summary.invalidAmounts ? " (неполная)" : ""}
      </p>
      {!entries.length ? (
        <p>Расхождений с этой стороны нет.</p>
      ) : !filtered.length ? (
        <p>По запросу ничего не найдено.</p>
      ) : (
        <>
          <div style={tableScroll}>
            <table style={table}>
              <thead>
                <tr>
                  {[
                    "ID чека",
                    "Дата и время",
                    "Сумма",
                    "Касса",
                    "Смена",
                    "Операция",
                    "Оплата",
                    "Причина"
                  ].map((title) => (
                    <th key={title} style={cell}>
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered
                  .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
                  .map(({ row, reason }, index) => (
                    <tr key={`${row.id}-${row.ts}-${index}`}>
                      <td style={cell}>
                        <ChequeId row={row} />
                      </td>
                      <td style={{ ...cell, whiteSpace: "nowrap" }}>
                        {row.date || "—"}
                      </td>
                      <td
                        style={{
                          ...cell,
                          whiteSpace: "nowrap",
                          fontWeight: 600
                        }}>
                        {row.amount || "—"}
                      </td>
                      <td style={cell}>{row.deviceName || "—"}</td>
                      <td style={cell}>{row.shift || "—"}</td>
                      <td style={cell}>{row.sign || "—"}</td>
                      <td style={cell}>{row.paymentType || "—"}</td>
                      <td
                        style={{
                          ...cell,
                          color:
                            reason === "Пара не найдена" ? "#64748b" : "#b45309"
                        }}>
                        {reason}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={currentPage}
            total={filtered.length}
            setPage={setPage}
          />
        </>
      )}
    </section>
  )
}

function MatchedTable({
  pairs,
  query
}: {
  pairs: ReturnType<typeof compareCheques>["pairs"]
  query: string
}) {
  const [page, setPage] = useState(0)
  const filtered = useMemo(
    () =>
      pairs.filter(
        (pair) =>
          includesQuery(pair.left, query) || includesQuery(pair.right, query)
      ),
    [pairs, query]
  )
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1)
  )
  useEffect(() => {
    setPage(0)
  }, [pairs, query])
  return !filtered.length ? (
    <p>Совпавших пар по текущему поиску нет.</p>
  ) : (
    <>
      <div style={{ ...tableScroll, marginTop: 16 }}>
        <table style={table}>
          <thead>
            <tr>
              {[
                "ID слева",
                "ID справа",
                "Дата и время слева",
                "Дата и время справа",
                "Сумма",
                "Смена",
                "Операция",
                "Оплата"
              ].map((title) => (
                <th key={title} style={cell}>
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered
              .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
              .map((pair, index) => (
                <tr key={index}>
                  <td style={cell}>
                    <ChequeId row={pair.left} />
                  </td>
                  <td style={cell}>
                    <ChequeId row={pair.right} />
                  </td>
                  <td style={cell}>{pair.left.date}</td>
                  <td style={cell}>{pair.right.date}</td>
                  <td style={cell}>{pair.left.amount}</td>
                  <td style={cell}>{pair.left.shift}</td>
                  <td style={cell}>{pair.left.sign}</td>
                  <td style={cell}>{pair.left.paymentType}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={currentPage}
        total={filtered.length}
        setPage={setPage}
      />
    </>
  )
}

function Pagination({
  page,
  total,
  setPage
}: {
  page: number
  total: number
  setPage: (page: number) => void
}) {
  return (
    <div style={{ ...actions, justifyContent: "space-between", marginTop: 12 }}>
      <span style={muted}>
        Показано {page * PAGE_SIZE + 1}–
        {Math.min((page + 1) * PAGE_SIZE, total)} из {total}
      </span>
      {total > PAGE_SIZE && (
        <div style={actions}>
          <button
            style={ghostButton}
            disabled={!page}
            onClick={() => setPage(page - 1)}>
            Назад
          </button>
          <button
            style={ghostButton}
            disabled={(page + 1) * PAGE_SIZE >= total}
            onClick={() => setPage(page + 1)}>
            Далее
          </button>
        </div>
      )}
    </div>
  )
}

const wrap: CSSProperties = {
  maxWidth: 1440,
  margin: "0 auto",
  padding: 24,
  font: "14px/1.5 system-ui, Segoe UI, sans-serif",
  color: "#0f172a",
  background: "#f8fafc",
  minHeight: "100vh",
  boxSizing: "border-box"
}
const header: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
  marginBottom: 20
}
const card: CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 18,
  marginBottom: 16
}
const columns: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
  gap: 24
}
const statsGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginBottom: 16
}
const sectionTitle: CSSProperties = { margin: "0 0 12px", fontSize: 18 }
const muted: CSSProperties = { color: "#64748b", fontSize: 13, margin: "6px 0" }
const notice: CSSProperties = {
  color: "#92400e",
  background: "#fffbeb",
  padding: 12,
  borderRadius: 8,
  marginBottom: 16
}
const actions: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap"
}
const field: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  color: "#475569"
}
const input: CSSProperties = {
  font: "inherit",
  padding: "9px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: "#fff",
  color: "#0f172a",
  boxSizing: "border-box"
}
const button: CSSProperties = {
  ...input,
  cursor: "pointer",
  background: "#0f172a",
  color: "#fff",
  fontWeight: 600
}
const ghostButton: CSSProperties = { ...input, cursor: "pointer" }
const tableScroll: CSSProperties = { overflowX: "auto" }
const table: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  textAlign: "left",
  fontSize: 13
}
const cell: CSSProperties = {
  borderBottom: "1px solid #e2e8f0",
  padding: "10px 12px",
  verticalAlign: "top",
  overflowWrap: "anywhere"
}
