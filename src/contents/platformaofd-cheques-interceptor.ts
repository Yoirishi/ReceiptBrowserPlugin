import type { PlasmoCSConfig } from "plasmo";
import { createNetInterceptor } from "~src/utils/XhrRequestInterceptor";

export const config: PlasmoCSConfig = {
  matches: ["https://lk.platformaofd.ru/web/auth/cheques/search*"],
  run_at: "document_start",
  world: "MAIN"
};

const MAX_BODY_CHARS = 1_000_000;

//use this teardown function to remove the interceptor
const interceptTeardown = createNetInterceptor({
  maxBodyChars: MAX_BODY_CHARS,
  onEvent: (event) => {
    window?.dispatchEvent(new CustomEvent("ext:net", { detail: event }))
  },
})

console.log("platformaofd cheques interceptor initialized")
