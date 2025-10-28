export type TypeGuard<T> = (x: unknown) => x is T

/** Безопасно превращает значение в короткую строку для сообщения об ошибке */
const preview = (v: unknown, max = 200): string => {
  try {
    const s =
      typeof v === "string" ? v :
        typeof v === "function" ? `[function ${v.name || "anonymous"}]` :
          JSON.stringify(v)
    const out = s ?? String(v)
    return out.length > max ? out.slice(0, max) + "…" : out
  } catch {
    // Например, циклические ссылки
    return Object.prototype.toString.call(v)
  }
}

/**
 * "Мягкий" checked cast: сужает тип через guard, без исключений.
 *
 * Возвращает `T` при успехе или `null` при провале.
 * Можно указать кастомное сообщение и логгер (для отладки/метрик).
 *
 * @example
 * const dataUnknown: unknown = await res.json()
 * const user = tryCheckedCast<User>(dataUnknown, isUser, {
 *   onFail: console.warn // или отправить в трекинг
 * })
 */
export function tryCheckedCast<T>(
  v: unknown,
  guard: TypeGuard<T>,
  options?: {
    /** Строка или билдер сообщения при провале проверки */
    message?: string | ((value: unknown) => string)
    /** Колбэк для логирования/трекинга провала проверки */
    onFail?: (message: string) => void
  }
): T | null {
  if (guard(v)) return v
  const message =
    typeof options?.message === "function"
      ? options.message(v)
      : options?.message ?? `Invalid value for checked cast: ${preview(v)}`
  options?.onFail?.(message)
  return null
}


export function tryCheckedCastOr<T>(
  v: unknown,
  guard: TypeGuard<T>,
  fallback: T,
  options?: Parameters<typeof tryCheckedCast<T>>[2]
): T {
  const res = tryCheckedCast(v, guard, options)
  return res ?? fallback
}
