// 在庫が黄色（発注点以下）になった食材を、発注先ごとにまとめて栗原さんのLINEへ知らせる。
// 同じ食材は黄色の間は1回だけ（回復したら次に黄色になった時にまた通知）。
// 環境変数: DRY_RUN=1 … 送信しない（文面の確認だけ）
process.env.TZ="Asia/Tokyo";
const fs=require("fs");const vm=require("vm");const path=require("path");
const APP_URL="https://tanba-hatchu.vercel.app";

// ===== 発注先の振り分け（在庫項目ID → 発注先）。変えたいときはここだけ直す =====
const SUPPLIER_OF={
  s_yam:"fukuchiyama", s_daikon_p:"fukuchiyama", s_daikon:"fukuchiyama",
  s_potato:"bito",
  s_egg:"nakasho", s_mirin:"nakasho", s_sake:"nakasho", s_vinegar:"nakasho", s_sugar:"nakasho",
  s_ajinomoto:"nakasho", s_salt:"nakasho", s_bpepper:"nakasho", s_ginger:"nakasho",
  s_cheese_g:"gyomu",
  s_mayo:"rakuten", s_crazysalt:"rakuten", s_asazuke:"rakuten",
  s_gyusuji:"otaya",
};
const SUPPLIERS={
  fukuchiyama:{name:"福知山合同青果（長いも・大根）",how:"アプリの「仕入れ発注」を開いて、内容を確認して「LINEで送信」を押すだけ → "+APP_URL},
  bito:{name:"尾藤農産（男爵ジャガイモ）",how:"注文は不要。尾藤農産からのメールで次回の到着予定日・量を確認"},
  nakasho:{name:"中庄",how:"中庄に注文"},
  gyomu:{name:"業務スーパー",how:"買い出し"},
  rakuten:{name:"楽天",how:"楽天で注文"},
  otaya:{name:"大田屋（牛すじ）",how:"大田屋に注文"},
  other:{name:"発注先が未設定のもの",how:"発注先を決めてください（スクリプト冒頭の SUPPLIER_OF に追加）"},
};
const ORDER=["fukuchiyama","bito","nakasho","gyomu","rakuten","otaya","other"];

// 通知文を作る（新しく黄色になった食材のみ）
function buildMessage(newAlerts){
  const g={};
  for(const a of newAlerts){const k=SUPPLIER_OF[a.sid]||"other";(g[k]=g[k]||[]).push(a);}
  const L=["【在庫が黄色になりました（発注の目安）】"];
  for(const k of ORDER){
    if(!g[k])continue;
    L.push("","■ "+SUPPLIERS[k].name,"→ "+SUPPLIERS[k].how);
    for(const a of g[k])L.push("・"+(a.empty?"🔴":"🟡")+" "+a.n+"：現在庫 "+a.stock+a.u+"（発注点 "+a.min+a.u+"）");
  }
  return L.join("\n");
}
module.exports={buildMessage,SUPPLIER_OF};
if(require.main!==module)return;

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

(async()=>{
  await p(S.loadProductCfg);await p(S.loadOrders);await p(S.loadStockFromCloud);
  if(!Object.keys(S._cloudStock||{}).length){console.error("Supabaseからデータを読めませんでした。中止します。");process.exit(1);}
  const alerts=S.getStockAlerts();
  const cur=alerts.map(a=>a.sid);
  // 前回通知済みの食材（黄色のまま残っているものは再通知しない）
  let prev=[];
  try{const r=await S.supaFetch("GET","stock_items?select=name&id=eq.cfg_lowstock_sent");const d=await r.json();
    if(Array.isArray(d)&&d.length&&d[0].name)prev=JSON.parse(d[0].name).sids||[];}
  catch(e){console.warn("通知済み記録を読めませんでした（今回は送信しません）",e);process.exit(1);}
  const fresh=alerts.filter(a=>prev.indexOf(a.sid)<0);
  console.log("黄色:",cur.length,"件 / 新しく黄色:",fresh.length,"件");
  if(fresh.length){
    const text=buildMessage(fresh);
    console.log("===== 文面 =====\n"+text+"\n================");
    if(process.env.DRY_RUN==="1"){console.log("DRY_RUN=1 のため送信・記録しません");return;}
    const r=await fetch(S.GAS_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"alert",message:text})});
    const t=await r.text();console.log("send:",t);
    if(r.status>=400){process.exit(1);}
  }
  if(process.env.DRY_RUN==="1")return;
  // 回復した食材は記録から外す（次に黄色になったらまた通知）。送信に成功した後にだけ記録する
  try{await S.supaFetch("POST","stock_items?on_conflict=id",{id:"cfg_lowstock_sent",name:JSON.stringify({sids:cur,at:new Date().toISOString()}),stock:0});}
  catch(e){console.warn("通知済み記録の保存に失敗",e);}
})().catch(e=>{console.error(e);process.exit(1);});
