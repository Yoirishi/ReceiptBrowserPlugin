import React, { useEffect, useState, type CSSProperties } from "react"



import { datasetsRepo } from "~src/lib/datasetsRepo";
import { rowFromDatasetRow, type UIRow } from "~src/tabs/viewer";
import useTabBoot from "~src/utils/useTabBoot";
import { parseAmountRu } from "~src/utils/parseAmountRu"


type SummaryBySource = {
  summaryCash: number,
  summaryCard: number,
  total: number,
  chequesCount: number,
}

function chequesEqual(a: UIRow, b: UIRow) {
  return (a.source !== b.source) &&
    (a.date === b.date) &&
    parseAmountRu(a.amount) === parseAmountRu(b.amount) &&
    (a.shift === b.shift) &&
    (a.sign === b.sign) &&
    (a.paymentType === b.paymentType) /*&&
    (a.sale === b.sale)*/
}

function diffCheques(
  left: UIRow[],
  right: UIRow[]
): { onlyLeft: UIRow[]; onlyRight: UIRow[] } {
  const onlyLeft: UIRow[] = []
  const restRight: UIRow[] = [...right]

  outer: for (const a of left) {
    for (let i = 0; i < restRight.length; i++) {
      if (chequesEqual(a, restRight[i])) {
        restRight.splice(i, 1)
        continue outer
      }
    }
    onlyLeft.push(a)
  }

  return { onlyLeft, onlyRight: restRight }
}


export default function ComparePage() {
  const { status, error, datasetId } = useTabBoot()
  const [rows, setRows] = useState<UIRow[]>([])
  const ready = status === "ready"
  const [retrievingFromDb, setRetrievingFromDb] = useState(false)
  const [isDataCompared, setIsDataCompared] = useState(false)
  const [platformaCheques, setPlatformaCheques] = useState<UIRow[]>([])
  const [costviserCheques, setCostviserCheques] = useState<UIRow[]>([])
  const [chequesDiff, setChequesDiff] = useState<UIRow[]>([])
  const [summaryByPlatformaOfd, setSummaryByPlatformaOfd] = useState<SummaryBySource>({summaryCard: 0, summaryCash: 0, total: 0, chequesCount: 0})
  const [summaryByCostviser, setSummaryByCostviser] = useState<SummaryBySource>({summaryCard: 0, summaryCash: 0, total: 0, chequesCount: 0})

  const refresh = async () => {
    if (!datasetId) return
    setRetrievingFromDb(true)
    try {
      const rs = await datasetsRepo.listRows(datasetId, 100000, 0)
      const ui = rs.map(rowFromDatasetRow).sort((a, b) => b.ts - a.ts || a.id.localeCompare(b.id))
      setRows(ui)
    } finally { setRetrievingFromDb(false) }
  }

  // useEffect(() => {
  //   if (ready) {
  //     void refresh()
  //     if (rows.length === 0) return
  //
  //     rows.forEach(row => {
  //       if (row.source === "PlatformaOFD") {
  //         setPlatformaCheques(prev => [...prev, row])
  //       } else if (row.source === "Costviser") {
  //         setCostviserCheques(prev => [...prev, row])
  //       }
  //     })
  //
  //     void compare()
  //   }
  // }, [ready])

  useEffect(() => {
    if (!ready) return

    ;(async () => {
      await refresh()
    })()

  }, [ready])

  useEffect(() => {
    if (!ready) return
    ;(async () => {
      if (rows.length === 0) return

      const plat: UIRow[] = []
      const cost: UIRow[] = []

      for (const row of rows) {
        if (row.source === "PlatformaOFD") plat.push(row)
        else if (row.source === "Costviser") cost.push(row)
      }

      setPlatformaCheques(prev => [...prev, ...plat])
      setCostviserCheques(prev => [...prev, ...cost])
    })()
  }, [ready, rows])


  useEffect(() => {
    if (!ready) return

    if (platformaCheques.length === 0 || costviserCheques.length === 0) return

    const { onlyLeft, onlyRight } = diffCheques(platformaCheques, costviserCheques)

    // console.log(onlyLeft[0], onlyRight[0])
    //
    // const a = onlyLeft[0]
    // const b = onlyRight[0]
    //
    // console.log(a.source !== b.source)
    // console.log(a.date === b.date)
    // console.log(parseAmountRu(a.amount) === parseAmountRu(b.amount))
    // console.log(a.shift === b.shift)
    // console.log(a.sign === b.sign)
    // console.log(a.paymentType === b.paymentType)


    setSummaryByPlatformaOfd({
      summaryCard: platformaCheques.filter(r => r.paymentType === "Оплата картой").reduce((acc, row) => acc+parseAmountRu(row.amount), 0),
      summaryCash: platformaCheques.filter(r => r.paymentType === "Наличными").reduce((acc, row) => acc+parseAmountRu(row.amount), 0),
      total: platformaCheques.reduce((acc, row) => acc+parseAmountRu(row.amount), 0),
      chequesCount: platformaCheques.length
    })

    setSummaryByCostviser({
      summaryCard: costviserCheques.filter(r => r.paymentType === "Оплата картой").reduce((acc, row) => acc+parseAmountRu(row.amount), 0),
      summaryCash: costviserCheques.filter(r => r.paymentType === "Наличными").reduce((acc, row) => acc+parseAmountRu(row.amount), 0),
      total: costviserCheques.reduce((acc, row) => acc+parseAmountRu(row.amount), 0),
      chequesCount: costviserCheques.length
    })

    setChequesDiff([...onlyLeft, ...onlyRight])

    setIsDataCompared(true)
  }, [ready, platformaCheques, costviserCheques])

  return (
    <div style={wrap}>
      <header style={header}>
        <div style={{ display: "flex", gap: 12, flexDirection: "row", justifyContent: "flex-end", alignItems: "center"  }}>
          <div>
            <h2 style={{ margin: 0 }} onClick={() => console.log(isDataCompared, summaryByPlatformaOfd, summaryByCostviser, chequesDiff)}>Cheques Comparator</h2>
            <div style={{ color: "#666", fontSize: 12 }}>
              Status: {status}{error ? ` — ${error}` : ""}{datasetId ? ` — dataset: ${datasetId}` : ""}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8}}>
          <button style={ghostBtn} onClick={() => window.close()}>Close</button>
        </div>
      </header>


      { isDataCompared ?
          <>
            <>
              {chequesDiff.length === 0 ?
                  <section style={card}>
                    <h3 style={{ marginTop: 0 }}>Cheques are equal</h3>
                  </section>
                :
                  <section style={card}>
                    <h3 style={{ marginTop: 0 }}>Cheques diff ({chequesDiff.length})</h3>
                    <div style={{ overflow: "auto", maxHeight: 650 }}>
                      <table style={table}>
                        <thead>
                        <tr>
                          <th>date</th>
                          <th>deviceName</th>
                          <th>amount</th>
                          <th>sign</th>
                          <th>paymentType</th>
                          <th>fnsStatus</th>
                          <th>sale</th>
                          <th>shift</th>
                          <th>detailsUrl</th>
                          <th>source</th>
                        </tr>
                        </thead>
                        <tbody>
                        {chequesDiff.map((r) => (
                          <tr key={`${r.ts}-${r.id}`}>
                            <td>{r.date}</td>
                            <td>{r.deviceName}</td>
                            <td>{r.amount}</td>
                            <td>{r.sign}</td>
                            <td>{r.paymentType}</td>
                            <td>{r.fnsStatus}</td>
                            <td>{r.sale}</td>
                            <td>{r.shift}</td>
                            <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.detailsUrl}</td>
                            <td>{r.source ?? ""}</td>
                          </tr>
                        ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
              }
            </>
            <section style={card}>
              <div style={{display: "flex", flexDirection: "row"}}>
                <div style={{flex: 1}}>
                  <h3 style={{ marginTop: 0 }}>PlatformaOFD Summary</h3>
                  <div style={{display: "flex", flexDirection: "column", justifyContent: "space-between"}}>
                    <div>Суммарно оплата картой: {summaryByPlatformaOfd.summaryCard}</div>
                    <div>Суммарно оплата наличными: {summaryByPlatformaOfd.summaryCash}</div>
                    <div>Всего за период: {summaryByPlatformaOfd.total}</div>
                    <div>Количество чеков за период: {summaryByPlatformaOfd.chequesCount}</div>
                  </div>
                </div>
                <div style={{flex: 1}}>
                  <h3 style={{ marginTop: 0 }}>Costviser Summary</h3>
                  <div style={{display: "flex", flexDirection: "column", justifyContent: "space-between"}}>
                    <div>Суммарно оплата картой: {summaryByCostviser.summaryCard}</div>
                    <div>Суммарно оплата наличными: {summaryByCostviser.summaryCash}</div>
                    <div>Всего за период: {summaryByCostviser.total}</div>
                    <div>Количество чеков за период: {summaryByCostviser.chequesCount}</div>
                  </div>
                </div>
                <div style={{flex: 1}}>
                  <h3 style={{ marginTop: 0 }}>diff</h3>
                  <div style={{display: "flex", flexDirection: "column", justifyContent: "space-between"}}>
                    <div>{summaryByPlatformaOfd.summaryCard - summaryByCostviser.summaryCard === 0 ? "OK" : "Есть расхождение"}</div>
                    <div>{summaryByPlatformaOfd.summaryCash - summaryByCostviser.summaryCash === 0 ? "OK" : "Есть расхождение"}</div>
                    <div>{summaryByPlatformaOfd.total - summaryByCostviser.total === 0 ? "OK" : "Есть расхождение"}</div>
                    <div>{summaryByPlatformaOfd.chequesCount - summaryByCostviser.chequesCount === 0 ? "OK" : "Есть расхождение"}</div>
                  </div>
                </div>
              </div>
            </section>
          </>
          :
              <section style={card}>
                <h3 style={{ marginTop: 0 }}>Data is comparing now, please wait...</h3>
              </section>
      }

    </div>);
}

const wrap: CSSProperties = { padding: 16, fontFamily: "system-ui, Segoe UI, Roboto, Arial, sans-serif", color: "#111" }
const header: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }
const card: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 12, background: "#fff" }
const gridActions: CSSProperties = { display: "grid", gridTemplateColumns: "120px 120px 1fr", gap: 8, alignItems: "center" }
const gridForm: CSSProperties = { display: "grid", gridTemplateColumns: "120px 1fr 120px 1fr", gap: 8, alignItems: "center" }
const label: CSSProperties = { fontSize: 12, color: "#555" }
const input: CSSProperties = { padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 10, outline: "none" }
const btn: CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer" }
const ghostBtn: CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", color: "#111", cursor: "pointer" }
const table: CSSProperties = { width: "100%", borderCollapse: "collapse" }
