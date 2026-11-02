import type { PlasmoCSConfig } from "plasmo"

import ParserPanel from "~src/components/ParserPanel"

export const config: PlasmoCSConfig = {
  matches: ["https://*.costviser.ru/*", "https://*.4ait.ru/*"],
  run_at: "document_idle"
}

export default function CostviserParser() {
  return <ParserPanel source="Costviser" />
}
