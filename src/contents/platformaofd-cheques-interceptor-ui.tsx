import type { PlasmoCSConfig } from "plasmo"

import ParserPanel from "~src/components/ParserPanel"

export const config: PlasmoCSConfig = {
  matches: ["https://lk.platformaofd.ru/*"],
  run_at: "document_idle"
}

export default function PlatformaParser() {
  return <ParserPanel source="PlatformaOFD" />
}
