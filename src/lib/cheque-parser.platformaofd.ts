
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

/** Неброская заглушка для будущего Dexie. Сейчас — no-op. НЕ экспортируется. */
const saveToDexie: SaveChequesFn = async (_cheques) => {
  // TODO: реализовать сохранение в Dexie/DAK DB позднее.
};

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
 */
export async function parseAndStoreCheques(input: string | Element): Promise<number> {
  const cheques = parseCheques(input);
  await saveToDexie(cheques); // сейчас это заглушка
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
