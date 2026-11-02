const fs = require("node:fs")
const vm = require("node:vm")
const path = require("node:path")
const assert = require("node:assert/strict")

const directory = path.resolve(process.argv[2] || "build/chrome-mv3-prod")
const registered = []
const chrome = {
  runtime: {
    id: "test",
    getURL: (file) => `chrome-extension://test/${file}`,
    onInstalled: { addListener() {} },
    onMessage: { addListener() {} }
  },
  scripting: {
    getRegisteredContentScripts: async () => [],
    registerContentScripts: async (items) => registered.push(...items)
  }
}
const worker = vm.createContext({
  chrome,
  console,
  URL,
  setTimeout,
  clearTimeout,
  TextEncoder,
  TextDecoder,
  structuredClone,
  location: { href: "chrome-extension://test/static/background/index.js" }
})
vm.runInContext(
  fs.readFileSync(path.join(directory, "static/background/index.js"), "utf8"),
  worker
)
setImmediate(() => {
  assert.equal(registered.length, 2)
  for (const script of registered) {
    for (const file of script.js) {
      assert.ok(
        fs.existsSync(path.join(directory, file)),
        `Missing injected script: ${file}`
      )
      new vm.Script(fs.readFileSync(path.join(directory, file), "utf8"))
    }
    assert.equal(script.world, "MAIN")
  }
  const manifest = JSON.parse(
    fs.readFileSync(path.join(directory, "manifest.json"))
  )
  const pkg = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../package.json"))
  )
  assert.equal(manifest.version, pkg.version)
  for (const script of manifest.content_scripts) {
    for (const file of script.js)
      assert.ok(fs.existsSync(path.join(directory, file)), file)
  }
  console.log(
    `Build verified (${manifest.version}): two MAIN-world scripts and isolated UI bundles exist`
  )
})
