// 毎朝のLINE送信：index.html のロジックをそのままNodeで実行し、dailyMessageText() の文面を
// GAS中継（type:"push"）経由で食品グループへ送る。
// 環境変数: DRY_RUN=1 なら送信せず文面を表示するだけ。
//           KITCHEN_GROUP_ID（送信先。未指定なら Supabase の cfg_kitchen 行から読む）
const fs=require("fs");const vm=require("vm");
const html=fs.readFileSync(__dirname+"/../index.html","utf8");
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const src=scripts.join("\n");
const el={innerHTML:"",value:"",checked:false,classList:{add(){},remove(){}},style:{},textContent:"",disabled:false,focus(){}};
const sandbox={
  console,fetch,setTimeout,clearTimeout,Promise,JSON,Math,Date,Number,String,Object,Array,parseInt,parseFloat,isNaN,encodeURIComponent,
  window:{addEventListener(){},location:{href:""}},
  document:{getElementById(){return el;},querySelector(){return el;},querySelectorAll(){return [];},addEventListener(){},body:{classList:{add(){},remove(){}},appendChild(){},removeChild(){}},createElement(){return Object.assign({},el,{getContext(){return {drawImage(){}};},toDataURL(){return "";}});}},
  alert(m){console.log("[alert]",m);},confirm(){return true;},prompt(){return null;},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
  navigator:{},FileReader:function(){},Image:function(){},performance:{getEntriesByType(){return [];}},
};
sandbox.window.document=sandbox.document;sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(src,sandbox);
const S=sandbox;
function p(fn){return new Promise(res=>fn(res));}
(async()=>{
  await p(S.loadProductCfg);await p(S.loadOrders);await p(S.loadStockFromCloud);await p(S.loadSched);await p(S.loadTasks);
  if(!Object.keys(S._cloudStock||{}).length){console.error("Supabaseからデータを読めませんでした。送信を中止します。");process.exit(1);}
  const text=S.dailyMessageText(S.today());
  console.log("===== 文面 =====\n"+text+"\n================");
  if(process.env.DRY_RUN==="1"){console.log("DRY_RUN=1 のため送信しません");return;}
  let to=process.env.KITCHEN_GROUP_ID||"";
  if(!to){const r=await S.supaFetch("GET","stock_items?select=name&id=eq.cfg_kitchen");const d=await r.json();if(Array.isArray(d)&&d.length){try{to=JSON.parse(d[0].name).groupId||"";}catch(e){}}}
  if(!to){console.error("送信先（食品グループID）が未設定です");process.exit(1);}
  const r=await fetch(S.GAS_URL,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({type:"push",to,message:text})});
  const t=await r.text();console.log("send:",t);
  if(!t.includes('"ok":true')){process.exit(1);}
})().catch(e=>{console.error(e);process.exit(1);});
