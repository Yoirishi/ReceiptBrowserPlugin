// Real comparison UI with artificial datasets; no access to the extension DB.
const fs = require("node:fs")
const path = require("node:path")
const http = require("node:http")
const ts = require("typescript")
const root = path.resolve(__dirname, "..")
const files = [
  "src/lib/receiptRows.ts",
  "src/lib/compareCheques.ts",
  "src/tabs/compare.tsx"
]
const modules = files
  .map((file) => {
    const id = `~${file.replace(/\.tsx?$/, "")}`
    const code = ts.transpileModule(
      fs.readFileSync(path.join(root, file), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX
        }
      }
    ).outputText
    return `${JSON.stringify(id)}: function(require,module,exports){${code}\n}`
  })
  .join(",\n")

const html = `<!doctype html><meta charset="utf-8"><title>Сравнение чеков — тест</title>
<style>body{margin:0;background:#f8fafc}button:disabled{opacity:.5;cursor:default!important}input:focus,select:focus,button:focus-visible{outline:2px solid #2563eb;outline-offset:2px}</style>
<div style="padding:8px 24px;font:13px system-ui;background:#e0f2fe">Тестовые данные. Реальная база расширения не используется.
<label>Сценарий: <select id="scenario"><option value="normal">Расхождения</option><option value="empty">Пустая выборка</option><option value="error">Ошибка базы</option><option value="large">Много расхождений</option></select></label></div>
<div id="app"></div><script src="/react.js"></script><script src="/react-dom.js"></script><script>
const modules={${modules}},cache={};
React.createElementAdapter=(type,props,key)=>React.createElement(type,{...props,key});
const datasets=[{id:'mixed',name:'Ноябрь — все чеки'},{id:'ofd',name:'ОФД — 2 ноября'},{id:'trade',name:'Trade — 2 ноября'},{id:'empty',name:'Пустая выборка'}];
const make=(source,id,amount,time='12:30')=>({id:source+'-'+id,datasetId:'mixed',ts:id,source,data:{id:String(id),date:'02.11.2026 '+time,amount,sign:'Приход',shift:'206',paymentType:'Оплата картой',deviceName:source==='PlatformaOFD'?'Табачный дом — касса 1':'0001234567',detailsUrl:source==='PlatformaOFD'?'/web/auth/cheques/details/'+id:''}});
const normal=[make('PlatformaOFD',101,'500 ₽'),make('PlatformaOFD',102,'250 ₽','12:31'),make('PlatformaOFD',103,'250 ₽','12:31'),make('PlatformaOFD',104,'100 ₽','12:35'),make('Costviser',201,'500.00'),make('Costviser',202,'250.00','12:31'),make('Costviser',203,'300 ₽','12:40')];
const repo={list:async()=>datasets,getActiveId:async()=>'mixed',listAllRows:async id=>{await new Promise(r=>setTimeout(r,80));const scenario=document.getElementById('scenario').value;if(scenario==='error')throw Error('Тестовая ошибка чтения');if(scenario==='empty'||id==='empty')return [];const all=scenario==='large'?Array.from({length:205},(_,i)=>make('PlatformaOFD',1000+i,String(i+1)+' ₽')):normal;return id==='ofd'?all.filter(r=>r.source==='PlatformaOFD'):id==='trade'?all.filter(r=>r.source==='Costviser'):all;}};
function require(id){if(id==='react')return React;if(id==='react/jsx-runtime')return {jsx:React.createElementAdapter,jsxs:React.createElementAdapter,Fragment:React.Fragment};if(id==='~src/lib/datasetsRepo')return {datasetsRepo:repo};if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](require,m,m.exports);return m.exports;}
ReactDOM.createRoot(document.getElementById('app')).render(React.createElement(require('~src/tabs/compare').default));
</script>`

http
  .createServer((request, response) => {
    if (["/react.js", "/react-dom.js"].includes(request.url)) {
      response.setHeader("content-type", "text/javascript")
      const file =
        request.url === "/react.js"
          ? "react/umd/react.development.js"
          : "react-dom/umd/react-dom.development.js"
      return response.end(
        fs.readFileSync(path.join(root, "node_modules", file))
      )
    }
    response.setHeader("content-type", "text/html; charset=utf-8")
    response.end(html)
  })
  .listen(43128, "127.0.0.1", () =>
    console.log("Comparison fixture: http://127.0.0.1:43128/")
  )
