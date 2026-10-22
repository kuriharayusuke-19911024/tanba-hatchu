// 毎朝のLINE送信：index.html のロジックをそのままNodeで実行して文面を作り、
// 作業指示書の画像（Playwrightでアプリ画面を撮影）と一緒に、GAS中継経由で食品グループへ送る。
// 環境変数: DRY_RUN=1 … 送信しない（文面と画像の作成まで）
//           KITCHEN_GROUP_ID … 送信先（未指定なら Supabase の cfg_kitchen 行）
//           IMAGE_URL … 画像の公開URL（ワークフロー側で設定）
const fs=require("fs");const vm=require("vm");const path=require("path");
const APP_URL="https://tanba-hatchu.vercel.app";
const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const src=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join("\n");
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
vm.createContext(sandbox);vm.runInContext(src,sandbox);const S=sandbox;
const p=fn=>new Promise(res=>fn(res));

async function captureWorkOrder(outPath){
  const {chromium}=require("playwright");
  const browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:1200,height:900},deviceScaleFactor:2});
  await page.goto(APP_URL+"/?v="+Date.now(),{waitUntil:"networkidle"});
  await page.waitForTimeout(2500);
  await page.evaluate(()=>{A.user={r:"admin",n:"自動"};A.tab="workorder";re();});
  await page.waitForTimeout(1000);
  const target=await page.$("#woPrintArea");
  if(!target)throw new Error("作業指示書の要素が見つかりません");
  await target.screenshot({path:outPath,type:"jpeg",quality:85});
  await browser.close();
  console.log("作業指示書の画像を保存:",outPath,fs.statSync(outPath).size,"bytes");
}

(async()=>{
  await p(S.loadProductCfg);await p(S.loadOrders);await p(S.loadStockFromCloud);await p(S.loadSched);await p(S.loadTasks);
  if(!Object.keys(S._cloudStock||{}).length){console.error("Supabaseからデータを読めませんでした。中止します。");process.exit(1);}
  const text=S.dailyMessageText(S.today());
  console.log("===== 文面 =====\n"+text+"\n================");
  const outDir=path.join(__dirname,"..","daily","k9x2v7q4");fs.mkdirSync(outDir,{recursive:true});
  await captureWorkOrder(path.join(outDir,"workorder.jpg"));
  if(process.env.DRY_RUN==="1"){console.log("DRY_RUN=1 のため送信しません");return;}
  let to=process.env.KITCHEN_GROUP_ID||"";
  if(!to){const r=await S.supaFetch("GET","stock_items?select=name&id=eq.cfg_kitchen");const d=await r.json();if(Array.isArray(d)&&d.length){try{to=JSON.parse(d[0].name).groupId||"";}catch(e){}}}
  if(!to){console.error("送信先（食品グループID）が未設定です");process.exit(1);}
  const imageUrl=process.env.IMAGE_URL||"";
  const r=await fetch(S.GAS_URL,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({type:"push",to,message:text,imageUrl})});
  const t=await r.text();console.log("send:",t);
  if(!t.includes('"ok":true'))process.exit(1);
})().catch(e=>{console.error(e);process.exit(1);});
