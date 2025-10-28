import { datasetsRepo, type RowData } from "~src/lib/datasetsRepo";





/** Публичная типизация одного чека. Все поля — строки. */
export interface Cheque {
  id: string;            // из атрибута id строки: terminal_cheque_XXXXXXXX_id
  detailsUrl: string;    // из атрибута href строки
  fnsStatus: string;     // ФНС (иконка с title, напр. "Принят")
  paymentType: string;   // Тип оплаты (иконка с title, напр. "Оплата картой")
  sign: string;          // Признак (напр. "Приход")
  date: string;          // Дата (напр. "23.10.2025 15:50")
  deviceName: string;    // ККТ (напр. "Табачный Дом Льва Толстого 19")
  sale: string;          // Продажа (напр. "56")
  shift: string;         // Смена (напр. "206")
  amount: string;        // Сумма (напр. "258 ₽")
  crptStatus: string;    // ЦРПТ (иконка с title)
}

/** Внутренний (неэкспортируемый) тип заглушки сохранения. */
type SaveChequesFn = (cheques: Cheque[]) => Promise<void> | void;

const saveToDexie: SaveChequesFn = async (cheques) => {
  if (!cheques?.length) return

  const datasetId = await ensureActiveDataset()

  // Маппим чек → RowData. Оставляем значения строками.
  const rows: RowData[] = cheques.map(c => ({
    // ключ строки: совпадает с id чека
    key: c.id,
    // полезные поля — в data
    id: c.id,
    detailsUrl: c.detailsUrl,
    fnsStatus: c.fnsStatus,
    paymentType: c.paymentType,
    sign: c.sign,
    date: c.date,
    deviceName: c.deviceName,
    sale: c.sale,
    shift: c.shift,
    amount: c.amount,
    crptStatus: c.crptStatus
  }))

  // Дедуп внутри одной партии по key/id (на случай повторов в одном HTML).
  const uniq = new Map<string, RowData>()
  for (const r of rows) {
    const k = String((r as any).key ?? (r as any).id ?? '')
    if (k && !uniq.has(k)) uniq.set(k, r)
  }

  const batch = makeBatchId('ofd')
  const ds = await datasetsRepo.ensureScoped()
  await datasetsRepo.addRows(datasetId, Array.from(uniq.values()), {
    source: 'PlatformaOFD',
    batch
  })
}

/* ----------------- helpers ----------------- */

async function ensureActiveDataset(): Promise<string> {
  const ds = await datasetsRepo.ensureScoped()
  const id = await datasetsRepo.getActiveId()
  if (id) {
    return id
  } else {
      throw new NoActiveDatasetError()
  }
}

function makeBatchId(prefix = 'ofd'): string {
  const rnd = typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function'
    ? (crypto as any).randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
  return `${prefix}-${Date.now()}-${rnd}`
}

/**
 * Разобрать HTML таблицы чеков в объекты Cheque.
 * @param input HTML-строка с таблицей или корневой DOM-элемент
 */
export function parseCheques(input: string | Element): Cheque[] {
  const doc = normalizeToDocument(input);
  if (!doc) return [];

  // Пытаемся найти нужные строки максимально устойчиво:
  // 1) предпочтительно по таблице с классом table-cheques_search
  // 2) иначе — любые строки с атрибутом href внутри tbody
  const rows =
    doc.querySelectorAll<HTMLTableRowElement>('table.table-cheques_search tbody tr[href]')?.length
      ? doc.querySelectorAll<HTMLTableRowElement>('table.table-cheques_search tbody tr[href]')
      : doc.querySelectorAll<HTMLTableRowElement>('tbody tr[href]');

  const cheques: Cheque[] = [];

  rows.forEach((tr) => {
    const tds = Array.from(tr.querySelectorAll<HTMLTableCellElement>('td'));
    if (tds.length < 9) return; // ожидались 9 колонок

    const rowId = tr.getAttribute('id') ?? '';
    const idMatch = rowId.match(/terminal_cheque_(\d+)_id/);
    const id = idMatch?.[1] ?? '';

    const detailsUrl = tr.getAttribute('href') ?? '';

    const fnsStatus =
      tds[0].querySelector<HTMLElement>('i[title]')?.getAttribute('title')?.trim() ?? '';

    const paymentType =
      tds[1].querySelector<HTMLElement>('i[title]')?.getAttribute('title')?.trim() ?? '';

    const sign = textOf(tds[2]);
    const date = textOf(tds[3]);

    const deviceName =
      tds[4].querySelector<HTMLElement>('.js__trim_long_text')?.textContent?.trim() ??
      textOf(tds[4]);

    const sale = textOf(tds[5]);
    const shift = textOf(tds[6]);
    const amount = textOf(tds[7]);

    const crptStatus =
      tds[8].querySelector<HTMLElement>('i[title]')?.getAttribute('title')?.trim() ?? '';

    cheques.push({
      id,
      detailsUrl,
      fnsStatus,
      paymentType,
      sign,
      date,
      deviceName,
      sale,
      shift,
      amount,
      crptStatus,
    });
  });

  return cheques;
}

/**
 * Высокоуровневый сервис: парсит и «сохраняет».
 * Возвращает количество распарсенных чеков.
 * @param input HTML-строка с таблицей или корневой DOM-элемент
 * @throws NoActiveDatasetError
 */
export async function parseAndStoreCheques(input: string | Element): Promise<number> {
  console.log(`parseAndStoreCheques: ${input}`)
  const cheques = parseCheques(input);
  try {
    console.log(`parsed ${cheques.length} cheques:`, cheques);
    await saveToDexie(cheques);
  } catch (e) {
    console.error("Error saving cheques:", e);
    return 0;
  }
  return cheques.length;
}

/* ====================== Вспомогательные утилиты ====================== */

function normalizeToDocument(input: string | Element): Document | null {
  // Если уже DOM-элемент — берём его ownerDocument / document.
  if (isElement(input)) {
    return input.ownerDocument ?? document ?? null;
  }

  // Если строка — пытаемся распарсить как HTML в браузере.
  if (typeof input === 'string') {
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      return parser.parseFromString(input, 'text/html');
    }
    // Фолбэк: если DOMParser недоступен (например, Node без JSDOM),
    // вернуть null; пользователь может передать Element вместо строки.
    return null;
  }

  return null;
}

function textOf(el?: Element | null): string {
  return (el?.textContent ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\u00A0/g, ' ')
    .trim();
}

function isElement(x: unknown): x is Element {
  return typeof Element !== 'undefined' && x instanceof Element;
}

class NoActiveDatasetError extends Error {
  constructor() {
    super("No active dataset. Please select a dataset first.");
  }
}
