// A local fixture: real React/DOMParser/XHR/fetch, mock extension storage only.
// Run with npm run test:browser and open http://127.0.0.1:43127/#/checks.
const http = require("node:http")
const fs = require("node:fs")
const path = require("node:path")
const ts = require("typescript")
const root = path.resolve(__dirname, "..")
const files = [
  "src/lib/receiptProtocol.ts",
  "src/lib/cheque-parser.platformaofd.ts",
  "src/utils/isCostviserChecksResponse.ts",
  "src/utils/mapCheques.ts",
  "src/utils/XhrRequestInterceptor.ts",
  "src/utils/netBridge.ts",
  "src/utils/useReceiptParser.ts",
  "src/components/ParserPanel.tsx"
]
const modules = files
  .map((file) => {
    const id = `~${file.replace(/\.tsx?$/, "")}`
    const compiled = ts.transpileModule(
      fs.readFileSync(path.join(root, file), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX
        }
      }
    ).outputText
    return `${JSON.stringify(id)}: function(require,module,exports){${compiled}\n}`
  })
  .join(",\n")
const html = `<!doctype html><meta charset="utf-8"><title>Receipt Parser — проверка</title>
<style>body{font:16px/1.6 system-ui;background:#f1f5f9;padding:32px;margin-right:360px}button{margin:8px;padding:8px}li{margin:4px}</style>
<h1>Проверка Receipt Parser</h1><p>Локальные тестовые чеки. Хранилище расширения заменено тестовой заглушкой.</p>
<ul id="results"></ul><div id="controls">
<button onclick="fetch('/checks')">Загрузить чеки (fetch)</button>
<button onclick="const x=new XMLHttpRequest();x.open('GET','/checks');x.responseType='json';x.send()">Загрузить чеки (XHR JSON)</button>
<button onclick="fetch('/checks?scenario=unauthorized')">Ошибка HTTP 401</button>
<button onclick="fetch('/checks?scenario=schema')">Ошибка формата Trade</button>
<button onclick="window.failSave=true;fetch('/checks?scenario=next')">Ошибка сохранения</button>
</div><div>Записано в тестовое хранилище: <span id="stored">0</span></div><div id="app"></div>
<script src="/react.js"></script><script src="/react-dom.js"></script><script>
const modules={${modules}};const cache={};
function require(id){if(id==='react')return React;if(id==='react/jsx-runtime')return {jsx:React.createElementAdapter,jsxs:React.createElementAdapter};if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](require,m,m.exports);return m.exports;}
React.createElementAdapter=(type,props,key)=>React.createElement(type,{...props,key});
const listeners=[];window.chrome={runtime:{id:'test',getManifest:()=>({version:'test'}),onMessage:{addListener:f=>listeners.push(f),removeListener:f=>listeners.splice(listeners.indexOf(f),1)},sendMessage:async msg=>{
if(msg.type==='GET_ACTIVE_DATASET')return {ok:true,datasetId:'test-dataset'};
if(msg.type==='save-cheques'){await new Promise(r=>setTimeout(r,100));if(window.failSave)return {ok:false,error:'Тест: хранилище недоступно'};document.getElementById('stored').textContent=Number(document.getElementById('stored').textContent)+msg.rows.length;return {ok:true,saved:msg.rows.length,datasetId:msg.datasetId};}return {ok:true};}}};
const parse=require('~src/lib/cheque-parser.platformaofd').parseCheques;
const row='<tr id="terminal_cheque_42_id" href="/web/auth/cheques/42"><td><i title="Принят"></i></td><td><i title="Оплата картой"></i></td><td>Приход</td><td>02.11.2026 12:30</td><td>Касса 1</td><td>7</td><td>206</td><td>123,45 ₽</td><td></td></tr>';
function check(name,fn){const li=document.createElement('li');try{fn();li.textContent='PASS: '+name;}catch(e){li.textContent='FAIL: '+name+' — '+e.message;li.style.color='red'}document.getElementById('results').append(li);}
function eq(actual,expected){if(actual!==expected)throw Error(actual+' !== '+expected);}
check('ОФД: полная таблица',()=>{const r=parse('<table class="table-cheques_search"><tbody>'+row+'</tbody></table>');eq(r[0].id,'42');eq(r[0].amount,'123,45 ₽');eq(r[0].paymentType,'Оплата картой')});
check('ОФД: фрагмент tr из AJAX',()=>eq(parse(row).length,1));
check('ОФД: HTML внутри JSON',()=>eq(parse(JSON.stringify({data:{html:row}})).length,1));
check('ОФД: пустой результат',()=>eq(parse('<table class="table-cheques_search"><tbody><tr><td colspan="9">Чеки не найдены</td></tr></tbody></table>').length,0));
check('ОФД: изменившаяся разметка объясняется',()=>{try{parse(row.replace('<td>7</td>',''));}catch{};try{parse(row.replace('<td>7</td><td>206</td>',''));throw Error('Нет ошибки');}catch(e){if(!e.message.includes('колонок'))throw e;}});
check('ОФД: переданный Element ограничивает поиск',()=>{const root=document.createElement('section');root.innerHTML='<table>'+row+'</table>';eq(parse(root).length,1)});
require('~src/utils/netBridge').startNetBridge('Costviser');
ReactDOM.createRoot(document.getElementById('app')).render(React.createElement(require('~src/components/ParserPanel').default,{source:'Costviser'}));
</script>`

http
  .createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1")
    if (url.pathname === "/react.js" || url.pathname === "/react-dom.js") {
      response.setHeader("content-type", "text/javascript")
      const file =
        url.pathname === "/react.js"
          ? "react/umd/react.development.js"
          : "react-dom/umd/react-dom.development.js"
      return response.end(
        fs.readFileSync(path.join(root, "node_modules", file))
      )
    }
    if (url.pathname === "/checks") {
      response.setHeader("content-type", "application/json")
      if (url.searchParams.get("scenario") === "unauthorized") {
        response.statusCode = 401
        return response.end('{"error":"unauthorized"}')
      }
      if (url.searchParams.get("scenario") === "schema")
        return response.end('{"items":[{"id":123}]}')
      return response.end(
        JSON.stringify({
          items: [
            {
              id: url.searchParams.get("scenario") === "next" ? 124 : 123,
              num: 7,
              total: "123.45",
              shift: 206,
              check_type: "sale",
              payment_source: "electron",
              created_at: "2026-11-02T12:30:00+10:00",
              fields: { KKT: null }
            }
          ]
        })
      )
    }
    response.setHeader("content-type", "text/html; charset=utf-8")
    response.end(html)
  })
  .listen(43127, "127.0.0.1", () =>
    console.log("Browser smoke fixture: http://127.0.0.1:43127/#/checks")
  )
