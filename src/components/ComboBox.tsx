import React from "react"

export type ComboBoxProps<T> = {
  items: T[]
  getText: (item: T) => string
  getId: (item: T) => string | number
  value?: T | null
  onChange?: (item: T | null) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  clearable?: boolean
  renderItem?: (item: T, active: boolean, selected: boolean) => React.ReactNode
  searchable?: boolean // shows search input in dropdown
  filter?: (item: T, query: string) => boolean // custom filter; default: CI includes on getText
  renderEmpty?: (query: string) => React.ReactNode // custom empty state renderer
}

/**
 * Minimal, dependency-free ComboBox (dropdown) with keyboard + search/typeahead.
 * - ArrowUp/ArrowDown to navigate, Enter to select, Esc to close, Home/End.
 * - Tab autocompletes to the FIRST filtered item (keeps menu open).
 * - Typing on the closed button opens the menu and seeds the query.
 * - Click outside to close. Optional clear button.
 */
export default function ComboBox<T>(props: ComboBoxProps<T>) {
  const {
    items,
    getText,
    getId,
    value = null,
    onChange,
    placeholder = "Select…",
    disabled = false,
    className,
    clearable = true,
    renderItem,
    searchable = true,
    filter,
    renderEmpty
  } = props

  const [open, setOpen] = React.useState(false)
  const [highlight, setHighlight] = React.useState<number>(-1)
  const [query, setQuery] = React.useState("")
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const listRef = React.useRef<HTMLUListElement | null>(null)
  const btnRef = React.useRef<HTMLButtonElement | null>(null)
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  // derive selected by id
  const selectedId = value == null ? null : getId(value)
  const selectedIndex = React.useMemo(() => {
    if (selectedId == null) return -1
    return items.findIndex((it) => getId(it) === selectedId)
  }, [items, selectedId, getId])
  const selectedItem = selectedIndex >= 0 ? items[selectedIndex] : value

  const _filter = React.useCallback(
    (it: T, q: string) => getText(it).toLowerCase().includes(q.trim().toLowerCase()),
    [getText]
  )
  const filtered = React.useMemo(() => {
    if (!searchable || query.trim() === "") return items
    const f = filter ?? _filter
    return items.filter((it) => f(it, query))
  }, [items, query, searchable, filter, _filter])

  React.useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDocDown, true)
    return () => document.removeEventListener("mousedown", onDocDown, true)
  }, [])

  React.useEffect(() => {
    if (!open) return
    setQuery((q) => (q ? q : selectedItem ? getText(selectedItem) : ""))
    const idx = (() => {
      if (!filtered.length) return -1
      if (selectedItem) {
        const id = getId(selectedItem)
        const ix = filtered.findIndex((it) => getId(it) === id)
        if (ix >= 0) return ix
      }
      return 0
    })()
    setHighlight(idx)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  React.useEffect(() => {
    if (!open || highlight < 0 || !listRef.current) return
    const li = listRef.current.querySelector<HTMLElement>(`li[data-i='${highlight}']`)
    li?.scrollIntoView({ block: "nearest" })
  }, [open, highlight])

  const commit = (item: T | null) => {
    onChange?.(item)
    setOpen(false)
    setQuery("")
    btnRef.current?.focus()
  }

  const onButtonKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (e.key === "ArrowDown" || e.key === "Down") {
      e.preventDefault(); setOpen(true)
    } else if (e.key === "ArrowUp" || e.key === "Up") {
      e.preventDefault(); setOpen(true)
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault(); setOpen((o) => !o)
    } else if (e.key.length === 1 && !e.altKey && !e.metaKey && !e.ctrlKey) {
      setOpen(true)
      setQuery((q) => (q ? q + e.key : e.key))
      e.preventDefault()
    }
  }

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "Down") {
      e.preventDefault(); setHighlight((h) => (filtered.length ? (h + 1 + filtered.length) % filtered.length : -1))
    } else if (e.key === "ArrowUp" || e.key === "Up") {
      e.preventDefault(); setHighlight((h) => (filtered.length ? (h - 1 + filtered.length) % filtered.length : -1))
    } else if (e.key === "Home") {
      e.preventDefault(); setHighlight(filtered.length ? 0 : -1)
    } else if (e.key === "End") {
      e.preventDefault(); setHighlight(filtered.length ? filtered.length - 1 : -1)
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlight >= 0 && filtered[highlight]) commit(filtered[highlight])
      else if (filtered[0]) commit(filtered[0])
      else setOpen(false)
    } else if (e.key === "Tab") {
      if (filtered[0]) {
        e.preventDefault()
        setQuery(getText(filtered[0]))
        setHighlight(0)
      }
    } else if (e.key === "Escape") {
      e.preventDefault(); setOpen(false)
    }
  }

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation()
    setQuery("")
    commit(null)
  }

  const emptyNode = renderEmpty ? (
    <li style={{ padding: "12px 14px" }}>{renderEmpty(query)}</li>
  ) : (
    <li style={{ padding: "12px 14px", color: "#6B7280" }}>No matches{query ? ` for "${query}"` : ""}</li>
  )

  return (
    <div ref={rootRef} className={className} style={styles.root}>
      <button
        ref={btnRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="cb-list"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onButtonKeyDown}
        style={{
          ...styles.button,
          ...(disabled ? styles.buttonDisabled : null),
          ...(open ? styles.buttonOpen : null)
        }}
        title={selectedItem ? getText(selectedItem) : placeholder}
      >
        <span style={styles.buttonText}>
          {selectedItem ? getText(selectedItem) : <span style={{ color: "#9CA3AF" }}>{placeholder}</span>}
        </span>
        <span style={styles.actions}>
          {clearable && selectedItem ? (
            <span
              role="button"
              aria-label="Clear"
              title="Clear"
              tabIndex={-1}
              style={styles.clear}
              onMouseDown={(e) => e.preventDefault()}
              onClick={clear}
            >
              ×
            </span>
          ) : null}
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden style={styles.chev}>
            <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div style={styles.popover}>
          {searchable && (
            <div style={styles.searchWrap}>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Type to search… (Tab to autocomplete)"
                style={styles.search}
              />
            </div>
          )}
          <ul id="cb-list" ref={listRef} role="listbox" tabIndex={-1} style={styles.list}>
            {filtered.length === 0 ? (
              emptyNode
            ) : (
              filtered.map((it, i) => {
                const active = i === highlight
                const selected = selectedId != null && getId(it) === selectedId
                const content = renderItem ? (
                  renderItem(it, active, selected)
                ) : (
                  <>
                    <span>{getText(it)}</span>
                    {selected && <span style={styles.tick}>✓</span>}
                  </>
                )
                return (
                  <li
                    key={String(getId(it))}
                    role="option"
                    aria-selected={selected}
                    data-i={i}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => commit(it)}
                    style={{
                      ...styles.item,
                      ...(active ? styles.itemActive : null)
                    }}
                  >
                    {content}
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── styles (black/white, rounded, subtle shadows) ───────────────────────────
const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "relative",
    display: "inline-block",
    minWidth: 260,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
  },
  button: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "10px 12px",
    background: "#fff",
    color: "#111",
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    boxShadow: "0 2px 6px rgba(0,0,0,.06)",
    cursor: "pointer",
    transition: "border-color .15s ease, box-shadow .15s ease, background .15s ease"
  },
  buttonOpen: { borderColor: "#111", boxShadow: "0 10px 20px rgba(0,0,0,.08), 0 2px 6px rgba(0,0,0,.06)" },
  buttonDisabled: { opacity: 0.6, cursor: "not-allowed" },
  buttonText: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  actions: { display: "flex", alignItems: "center", gap: 6 },
  clear: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 18,
    height: 18,
    borderRadius: 9,
    border: "1px solid #E5E7EB",
    background: "#fff",
    color: "#111"
  },
  chev: { opacity: 0.7 },
  popover: {
    position: "absolute",
    zIndex: 9999,
    top: "calc(100% + 6px)",
    left: 0,
    right: 0,
    width: "100%",
    boxSizing: "border-box",
    background: "#fff",
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    boxShadow: "0 16px 32px rgba(0,0,0,.1), 0 4px 12px rgba(0,0,0,.06)",
    overflow: "hidden" // ensure inner corners don't stick out
  },
  searchWrap: { padding: 8, borderBottom: "1px solid #E5E7EB", background: "#fff" },
  search: {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid #E5E7EB",
    borderRadius: 10,
    outline: "none",
    boxSizing: "border-box"
  },
  list: { maxHeight: 260, overflow: "auto", margin: 0, padding: 0, listStyle: "none" },
  item: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "10px 12px",
    cursor: "pointer"
  },
  itemActive: { background: "#F5F5F5" },
  tick: { fontSize: 12, color: "#111", marginLeft: 8 }
}
