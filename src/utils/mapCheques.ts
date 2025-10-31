import type {
  CheckItem,
  CostviserChecksResponse
} from "~src/utils/isCostviserChecksResponse"
import type { Cheque } from "~src/lib/cheque-parser.platformaofd"





type MapperOptions = {
  /** Собирает id DOM-строки; по умолчанию terminal_cheque_${num}_id */
  buildRowId?: (item: CheckItem) => string
  /** Детальный URL для чека; по умолчанию пусто */
  buildDetailsUrl?: (item: CheckItem) => string
  /** Статус ФНС (иконка title); по умолчанию пусто */
  getFnsStatus?: (item: CheckItem) => string
  /** Статус ЦРПТ (иконка title); по умолчанию пусто */
  getCrptStatus?: (item: CheckItem) => string
  /** Читабельное имя ККТ; по умолчанию kkt_rn */
  getDeviceName?: (item: CheckItem) => string
  /** Кастомная форматовка суммы; по умолчанию "1 234 ₽" */
  formatAmount?: (amount: number) => string
  /** Кастомная форматовка даты; по умолчанию "DD.MM.YYYY HH:mm" по оффсету в ISO */
  formatDate?: (isoWithOffset: string) => string
  /** Кастомный маппинг "Признака"; по умолчанию из check_type */
  mapSign?: (checkType: string) => string
  /** Кастомный маппинг типа оплаты; по умолчанию из payment_source */
  mapPaymentType?: (paymentSource: string) => string
  /** Источник "Продажа"; по умолчанию quantity */
  mapSale?: (item: CheckItem) => string
}

const defaultBuildRowId = (i: CheckItem) => `terminal_cheque_${i.num}_id`

const defaultFormatAmount = (n: number) =>
  `${n.toLocaleString("ru-RU")} ₽`

// Форматируем «как в строке», не меняя часовой пояс из ISO (+hh:mm)
const defaultFormatDate = (iso: string) => {
  // 2025-10-27T16:30:00.000+10:00 -> 27.10.2025 16:30
  const m = iso.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/
  )
  if (!m) return iso
  const [, y, mo, d, h, mi] = m
  return `${d}.${mo}.${y} ${h}:${mi}`
}

const defaultSign = (t: string) => {
  switch (t) {
    case "sale": return "Приход"
    case "sale_return": return "Возврат прихода"
    case "buy": return "Расход"
    case "return_buy": return "Возврат расхода"
    default: return t
  }
}

const defaultPaymentType = (s: string) => {
  switch (s) {
    case "electron": return "Оплата картой"
    case "cash": return "Наличными"
    case "combined": return "Смешанный"
    case "cashback": return "Наличными"
    default: return s
  }
}

const defaultDeviceName = (i: CheckItem) => i.fields?.KKT?.kkt_rn ?? String(i.device_id)
const defaultSale = (i: CheckItem) => String(i.quantity)


export function mapCostviserToCheques(
  resp: CostviserChecksResponse,
  opts: MapperOptions = {}
): Cheque[] {
  const {
    buildRowId = defaultBuildRowId,
    buildDetailsUrl = () => "",
    getFnsStatus = () => "",
    getCrptStatus = () => "",
    getDeviceName = defaultDeviceName,
    formatAmount = defaultFormatAmount,
    formatDate = defaultFormatDate,
    mapSign = defaultSign,
    mapPaymentType = defaultPaymentType,
    mapSale = defaultSale
  } = opts

  // @ts-ignore
  return resp.items.map((it) => ({
    id: buildRowId(it),
    detailsUrl: buildDetailsUrl(it),
    fnsStatus: getFnsStatus(it),
    paymentType: mapPaymentType(it.payment_source),
    sign: mapSign(it.check_type),
    date: formatDate(it.fields.KKT.date),
    deviceName: getDeviceName(it),
    sale: mapSale(it),
    shift: String(it.shift),
    amount: formatAmount(it.total),
    crptStatus: getCrptStatus(it)
  }))
}
