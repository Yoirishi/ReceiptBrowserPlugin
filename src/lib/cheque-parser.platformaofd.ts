/** Common receipt format used by the viewer and comparison. */
export interface Cheque {
  id: string
  detailsUrl: string
  fnsStatus: string
  paymentType: string
  sign: string
  date: string
  deviceName: string
  sale: string
  shift: string
  amount: string
  crptStatus: string
}

export function parseCheques(input: string | Element): Cheque[] {
  let root: ParentNode
  if (typeof input === "string") {
    let html = input
    if (/^\s*[\[{]/.test(html)) {
      let value: unknown
      try {
        value = JSON.parse(html)
      } catch {
        throw new Error("ОФД вернул некорректный JSON")
      }
      // Some cabinet versions wrap the rendered HTML in a JSON response.
      const findHtml = (node: unknown, depth = 0): string | null => {
        if (typeof node === "string" && /<(?:table|tbody|tr)\b/i.test(node))
          return node
        if (depth > 4 || node === null || typeof node !== "object") return null
        for (const child of Object.values(node)) {
          const found = findHtml(child, depth + 1)
          if (found) return found
        }
        return null
      }
      const fragment = findHtml(value)
      if (!fragment)
        throw new Error(
          "ОФД: JSON не содержит HTML таблицы чеков; изменился формат ответа"
        )
      html = fragment
    }
    // DOMParser drops bare table rows outside a table in an HTML document.
    if (/^\s*<(?:tr|tbody|thead)\b/i.test(html)) html = `<table>${html}</table>`
    root = new DOMParser().parseFromString(html, "text/html")
  } else {
    root = input
  }

  const preferred = root.querySelectorAll<HTMLTableRowElement>(
    "table.table-cheques_search tbody tr"
  )
  const rows = preferred.length
    ? preferred
    : root.querySelectorAll<HTMLTableRowElement>(
        'tr[id^="terminal_cheque_"], tbody tr[href]'
      )
  const cheques: Cheque[] = []
  for (const tr of Array.from(rows)) {
    const rowId = tr.getAttribute("id") || ""
    const detailsUrl =
      tr.getAttribute("href") ||
      tr.querySelector<HTMLAnchorElement>("a[href]")?.getAttribute("href") ||
      ""
    const id =
      rowId.match(/terminal_cheque_(\d+)_id/)?.[1] ||
      detailsUrl.match(/\/cheques\/(\d+)(?:[/?#]|$)/)?.[1] ||
      ""
    const cells = Array.from(tr.querySelectorAll<HTMLTableCellElement>("td"))
    // An empty-result row often has a single cell with colspan.
    if (!id && cells.length <= 1) continue
    if (!id)
      throw new Error(
        "ОФД: у строки чека нет узнаваемого id или ссылки; изменилась разметка"
      )
    if (cells.length < 8 || cells.length > 9) {
      throw new Error(
        `ОФД: в строке ${cells.length} колонок, ожидалось 8–9; изменилась разметка таблицы`
      )
    }
    const title = (index: number) =>
      cells[index]
        ?.querySelector<HTMLElement>("[title]")
        ?.getAttribute("title")
        ?.trim() || ""
    if (
      !/\d{2}\.\d{2}\.\d{4}/.test(textOf(cells[3])) ||
      !/\d/.test(textOf(cells[7]))
    ) {
      throw new Error(
        "ОФД: не распознаны колонки даты/суммы; возможно, изменился порядок колонок"
      )
    }
    cheques.push({
      id,
      detailsUrl,
      fnsStatus: title(0),
      paymentType: title(1),
      sign: textOf(cells[2]),
      date: textOf(cells[3]),
      deviceName: textOf(
        cells[4].querySelector(".js__trim_long_text") || cells[4]
      ),
      sale: textOf(cells[5]),
      shift: textOf(cells[6]),
      amount: textOf(cells[7]),
      crptStatus: title(8)
    })
  }
  return cheques
}

function textOf(element?: Element | null): string {
  return (element?.textContent || "").replace(/\s+/g, " ").trim()
}
