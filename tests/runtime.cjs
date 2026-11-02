const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

function runtime(globals = {}, mocks = {}) {
  const root = path.resolve(__dirname, "..")
  const context = vm.createContext({
    console: { log() {}, info() {}, warn() {}, error() {} },
    URL,
    Request,
    Response,
    TextDecoder,
    Event,
    EventTarget,
    CustomEvent,
    Error,
    performance,
    setTimeout,
    clearTimeout,
    ...globals
  })
  const cache = new Map()
  function load(file) {
    const filename = path.resolve(root, file)
    if (cache.has(filename)) return cache.get(filename).exports
    const module = { exports: {} }
    cache.set(filename, module)
    const js = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true
      }
    }).outputText
    const requireForFile = (specifier) => {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier]
      if (specifier.startsWith("url:"))
        return `chrome-extension://test/${path.basename(specifier.slice(4), ".ts")}.js`
      if (specifier.startsWith("~")) return load(`${specifier.slice(1)}.ts`)
      if (specifier.startsWith("."))
        return load(
          path.relative(
            root,
            path.resolve(path.dirname(filename), `${specifier}.ts`)
          )
        )
      return require(specifier)
    }
    vm.runInContext(`(function(require,module,exports){${js}\n})`, context, {
      filename
    })(requireForFile, module, module.exports)
    return module.exports
  }
  return { load, context }
}

function chromeEvent() {
  const listeners = new Set()
  return {
    addListener: (callback) => listeners.add(callback),
    removeListener: (callback) => listeners.delete(callback),
    listeners,
    dispatch: (...args) => [...listeners].map((callback) => callback(...args))
  }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))
module.exports = { runtime, chromeEvent, tick }
