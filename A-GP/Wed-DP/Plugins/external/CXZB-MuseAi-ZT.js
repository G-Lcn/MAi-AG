(()=>{ 'use strict';
/*
 * 潮汐指标-MuseAi（Wed-DP 外部插件）V5（前 V4）
 * V5（2026-10-25，图标匹配，未推）：宿主图标用状态接口 window.__AGP_TIDAL__（见文末 hook），宿主图标读它画角标/开关、调它改开关/筛选/图标位置/清零；插件本身仍不画图标，图标由宿主画。接口不存在时宿主不编数字、不崩。
 * V4（2026-10-25，V61 实测修）：V61 宿主直接标签的 origin 取 marker.sourceLabel，缺省时回落到插件 id 截断（实测出 "wed-ind.chaoxi. · 价 5.43 ↓"），故 toMarker 必须显式给 sourceLabel（分时 T / K线 / 信号）与 quantity，否则直接标签内容错；虚线本身宿主已画（data-visual-price-line，dash 4 3），不改。
 * id: wed-ind.chaoxi.tidal
 * 文件名：CXZB-MuseAi-ZT.js（CXZB=潮汐指标，MuseAi=生成方，ZT=主图）
 * CT001.3（2026-10-24，批量二同步）：宿主批量二新显示口径的插件侧同步，
 * 不等宿主新版、不经过 GPT，Muse 内部直接改。marker 仍按 V44 合同发
 * （老宿主能跑），同时附带新宿主用的直接标签/虚线字段（老宿主忽略
 * 多余字段，新宿主读到就按新口径画），做到新老宿主双兼容。
 *
 * 定位（DESIGN.md）：只负责显示。本地不算信号、不存历史；信号由云端
 * 「潮汐量化-潮汐数据」组装器发布为公开 HTTPS 直链 JSON，本插件自行
 * fetch 后在分时主图 / K线主图打标记，并在分析面板给出当日列表。
 *
 * 本版按 Wed-DP V0.001.00038 正式接口合同（TIDAL-PLUGIN.md）逐项校准，
 * 并以 V38 单文件源码实证为准（下列均为 V38 源码可核事实）：
 * - 注册：window.__AGP_PLUGIN_BOOTSTRAP__.plugins.push(spec)；spec 为
 *   type:'plugin'，slots 取 CORE_SLOTS 内的 'chart.main.overlay' /
 *   'settings.plugin' / 'panel.analysis'；不声明 indicators、不用
 *   ctx.indicators.register（合同明示），不占 MA 选中槽。
 * - 权限（V38 PLUGIN_PERMISSIONS 词表内）：workspace.write（专属设置）、
 *   visual.marker + visual.interact（createMarkerLayer 与悬停）、
 *   ui.surface（ctx.ui.mount）、data.read（ctx.data.kline.visible 归一
 *   化日K锚点，合同提及该 API；无此权限 ctx.data 为 null）。
 * - requirements.contracts 按 V38 实际宿主版本：pluginHost 0.8.0 /
 *   visualHost 0.16.9 / uiSurfaceHost 1.16.0（coreSupports 门控）。
 * - activate(ctx)：ctx.workspace.get()/set({...}) 专属持久化；
 *   ctx.visual.createMarkerLayer({context:'main.intraday'|'main.kline',
 *   order:80}) 建双层；ctx.core.getContext() 取当前 symbol/period；
 *   ctx.resources.onCore('view.change') 感知切换、interval 管定时器。
 * - 标记格式（合同 + V38 sanitizeVisualItem 实证）：{time: 毫秒 epoch,
 *   value: 价格, shape, color, size, eventKey, tooltip(≤240 纯文本),
 *   interactive:true, hoverOnly:true}。宿主不保留 position/text，
 *   方向靠 shape（买 arrowUp 红 / 卖 arrowDown 绿）+ tooltip 文案表达；
 *   单层单次 setData ≤ 512 项（合同上限，本插件截断）。
 * - 通道：仅公开 HTTPS 直链 + CORS、插件自行 fetch、无鉴权、无令牌。
 */
const root=globalThis, raw=root.__AGP_PLUGIN_BOOTSTRAP__, bag=raw&&Array.isArray(raw.plugins)?raw:{schemaVersion:1,plugins:[]}; if(raw!==bag)root.__AGP_PLUGIN_BOOTSTRAP__=bag;

/* ---------------- 常量 ---------------- */
const ID='wed-ind.chaoxi.tidal', VER='V5';
const CTX_INTRA='main.intraday', CTX_KLINE='main.kline';
const BUY='#ef5350';        // 买红（与做T标记先例一致）
const SELL='#26a69a';       // 卖绿（DESIGN 定 B 红 / S 绿）
const UNKNOWN_COLOR='#d98a2b';
const KIND_DAY='chaoxi-intraday-signals', KIND_INDEX='chaoxi-intraday-index';
const TZ='Asia/Shanghai';
const MAX_MARKERS=512;      // 合同：每层单次更新最多 512 项
const DEFAULT_SETTINGS=Object.freeze({
  sourceBaseUrl:'',        // 信号源基地址（公开 HTTPS 直链目录，含 index.json 与 YYYY-MM-DD.json）；默认空＝未配置，不拉取不报错
  refreshSec:60,           // 自动刷新间隔（秒），开盘时段内生效
  overlayEnabled:true,     // 标记总开关（②级；①级为 Host 插件全局启停）
  intradayEnabled:true,    // 分时层开关（③级）
  klineEnabled:true,       // K线层开关（③级）
  directLabelEnabled:true, // 直接标签开关：批量二口径，信号旁直接写精简标签，不只悬停
  dashedLineEnabled:true,  // 虚线开关：批量二口径，信号价位画虚线，不拉满全图
  iconPos:'',              // 潮汐图标位置持久化：''＝默认主图右侧中间，拖动后写 'x,y'（相对主图百分比）
  minStrength:0,           // 强度滑块：0=全显，拉到数值只显该值以上（批量二）
  directionFilter:'all',   // 方向筛选：all/buy/sell，与图标窗开关同套筛选
  notes:{},                // 信号备注：按信号 id 存，跟了/没跟/观察（批量二新增）
  typeFilter:'all',        // 信号类型筛选：all/分时T/分时信号/K线信号/K线组合（继续优化）
  failCount:0,             // 信号源连续失败次数：成功清零，失败累加（源健康度）
  seenCount:0,             // 已看信号数：角标=今天当前股活跃信号数-已看数，换股重算
  viewDate:''              // 正在查看的日期（''＝跟随今天/索引最新一日），翻历史时写入
});
const REFRESH_CHOICES=[30,60,120,300];

/* type 注册表（DESIGN 拓展条款）：登记文案；未知 type 走通用点 + note */
const TYPE_REGISTRY=Object.freeze({
  t_signal:      { label:'分时信号' },
  t_trade:       { label:'分时成交' },
  kline_signal:  { label:'K线信号' },
  kline_single:  { label:'K线单信号' },
  kline_combo:   { label:'K线组合' }
});

/* ---------------- 小工具 ---------------- */
const num=v=>{const x=Number(v);return Number.isFinite(x)?x:NaN};
const isNum=Number.isFinite;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dtf=new Intl.DateTimeFormat('en-US',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',weekday:'short'});
function shParts(ms){ const o={}; for(const p of dtf.formatToParts(new Date(ms))) o[p.type]=p.value; return o; }
function shDateStr(ms){ const p=shParts(ms); return `${p.year}-${p.month}-${p.day}`; }
function shTimeStr(ms){ const p=shParts(ms); return `${p.hour}:${p.minute}:${p.second}`; }
function todayStr(){ return shDateStr(Date.now()); }
/* 仅开盘时段：周一至周五 9:30-11:30、13:00-15:00（Asia/Shanghai） */
function isTradingNow(nowMs){
  const p=shParts(nowMs||Date.now());
  if(['Sat','Sun'].includes(p.weekday))return false;
  const mins=Number(p.hour)*60+Number(p.minute);
  return (mins>=570&&mins<=690)||(mins>=780&&mins<=900);
}
/* ISO 时间 → epoch 毫秒（信号 time 带 +08:00，直接 Date.parse；合同口径） */
const msOf=iso=>{const ms=Date.parse(String(iso||''));return Number.isFinite(ms)?ms:NaN};
/* 按周期把毫秒时间戳向下对齐到 bar 起点（以 +08:00 为界） */
function floorToBarMs(ms,periodMin){
  if(!isNum(ms))return NaN;
  const step=periodMin*60000, shifted=ms+8*3600000;
  return Math.floor(shifted/step)*step-8*3600000;
}

/* ---------------- 插件状态 ---------------- */
const state={
  ctx:null,
  settings:{...DEFAULT_SETTINGS},
  dates:[],               // index.json 给的可用日期（升序）
  envelope:null,          // 最近一次成功拉到的当日文件信封
  envelopeDate:'',        // envelope 对应日期
  generatedAt:'',         // envelope.generated_at（云端数据时间）
  fetchedAt:0,            // 最近一次成功拉取的本地时刻 ms
  stale:false,            // 拉取失败但保留旧数据 → 已过期
  lastError:'',           // 最近一次拉取失败原因（只进状态卡，不抛错）
  inflight:false,
  timerStop:null,         // ctx.resources.interval 的停止函数
  layers:{},              // context -> createMarkerLayer 返回层
  uiHandles:{},           // key -> ctx.ui.mount 句柄（按钮/状态卡）
  symbol:'',              // 当前股票代码（ctx.core.getContext().symbol）
  period:'',              // 当前宿主周期（time/day/m30/m5/...）
  disposed:false
};

/* ---------------- 设置（ctx.workspace 持久化，合同） ---------------- */
function loadSettings(ctx){
  let saved={};
  try{ saved=ctx?.workspace?.get?.()||{}; }catch(_){ saved={}; }
  const s={...DEFAULT_SETTINGS};
  if(typeof saved.sourceBaseUrl==='string')s.sourceBaseUrl=saved.sourceBaseUrl.trim();
  if(REFRESH_CHOICES.includes(Number(saved.refreshSec)))s.refreshSec=Number(saved.refreshSec);
  for(const k of ['overlayEnabled','intradayEnabled','klineEnabled','directLabelEnabled','dashedLineEnabled']) if(typeof saved[k]==='boolean')s[k]=saved[k];
  if(typeof saved.iconPos==='string')s.iconPos=saved.iconPos;
  if(Number.isFinite(Number(saved.minStrength)))s.minStrength=Math.max(0,Math.min(100,Number(saved.minStrength)));
  if(['all','buy','sell'].includes(saved.directionFilter))s.directionFilter=saved.directionFilter;
  if(saved.notes&&typeof saved.notes==='object')s.notes={...saved.notes};
  if(Number.isFinite(Number(saved.seenCount)))s.seenCount=Math.max(0,Number(saved.seenCount));
  if(['all','t_signal','t_trade','kline_signal','kline_combo'].includes(saved.typeFilter))s.typeFilter=saved.typeFilter;
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(saved.viewDate||'')))s.viewDate=String(saved.viewDate);
  state.settings=s;
}
function saveSettings(){
  try{ state.ctx?.workspace?.set?.({...state.settings}); }catch(_){ /* 持久化失败不影响运行 */ }
}

/* ---------------- 文案 ---------------- */
function sideOf(sig){ return sig?.side==='sell'?'sell':'buy'; }
function tooltipOf(sig){
  const ms=msOf(sig.time);
  const p=isNum(ms)?shParts(ms):{hour:'--',minute:'--'};
  const dir=sideOf(sig)==='buy'?'买入':'卖出';
  const strength=isNum(num(sig.strength))?`｜强度 ${num(sig.strength)}`:'';
  const note=sig.note?`｜${sig.note}`:'';
  const src=sig.source||TYPE_REGISTRY[sig.type]?.label||'信号';
  return `${p.hour}:${p.minute} ${dir}｜价格 ${sig.price}｜来源 ${src}${strength}${note}`.slice(0,240);
}
/* 直接标签（批量二定稿）：分时 T · 价 14.88 +300，+为买、-为卖、数字为数量；
 * 信号里没有数量字段时只写价，不编造数量。时间由横轴位置给出，标签里不写时间。 */
function labelOf(sig){
  const buy=sideOf(sig)==='buy';
  const kind=(sig.type==='t_signal'||sig.type==='t_trade')?'分时 T':(String(sig.type||'').startsWith('kline')?'K线':'信号');
  const q=num(sig.qty??sig.quantity??sig.shares??sig.amount);
  const qty=isNum(q)?(buy?` +${q}`:` -${q}`):'';
  return `${kind} · 价 ${sig.price}${qty}`;
}
/* 信号 → 合同 marker 对象：老字段按 V44 合同原样发（老宿主能跑）；
 * label / dashedLine / labelColor 为批量二新宿主用字段，老宿主忽略多余字段。 */
function toMarker(sig,anchorMs){
  const buy=sideOf(sig)==='buy';
  const known=Object.prototype.hasOwnProperty.call(TYPE_REGISTRY,sig.type);
  const color=known?(buy?BUY:SELL):UNKNOWN_COLOR;
  const kind=(sig.type==='t_signal'||sig.type==='t_trade')?'分时 T':(String(sig.type||'').startsWith('kline')?'K线':'信号');
  const q=num(sig.qty??sig.quantity??sig.shares??sig.amount);
  return {
    time:anchorMs,
    value:num(sig.price),
    shape:known?(buy?'arrowUp':'arrowDown'):'circle',   // 未知 type 通用点
    color,
    size:10,
    eventKey:String(sig.id||''),
    tooltip:tooltipOf(sig),
    interactive:true,
    hoverOnly:true,
    label:state.settings.directLabelEnabled?labelOf(sig):'',
    // V61 宿主直接标签：origin = sourceLabel，缺省回落插件 id 截断，故必须显式给；quantity 有则宿主画 +qty/-qty，无则画箭头
    sourceLabel:kind,
    quantity:isNum(q)&&q>0?Math.floor(q):0,
    dashedLine:state.settings.dashedLineEnabled?{price:num(sig.price),color}:null,
    labelColor:color
  };
}

/* ---------------- 数据客户端（自行 fetch，不走 DataHub；合同） ---------------- */
function baseUrl(){ return String(state.settings.sourceBaseUrl||'').trim().replace(/\/+$/,''); }
async function fetchJson(url){
  const res=await fetch(url,{cache:'no-store'});
  if(!res||!res.ok)throw new Error(`HTTP ${res?res.status:'?'}`);
  return res.json();
}
/* 合同信封 {generated_at, signals[]}；我方组装器另带 kind/version，出现时必须相符 */
function validEnvelope(j,date){
  if(!j||typeof j!=='object'||!Array.isArray(j.signals))return null;
  if(j.kind&&j.kind!==KIND_DAY)return null;
  return { date:String(j.date||date), generated_at:String(j.generated_at||''), signals:j.signals };
}
/* index.json 给出可用日期列表：{dates:[...]} 或裸数组均可 */
function validIndex(j){
  const arr=Array.isArray(j)?j:(Array.isArray(j?.dates)?j.dates:null);
  if(!arr)return [];
  if(j&&!Array.isArray(j)&&j.kind&&j.kind!==KIND_INDEX)return [];
  return arr.filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d))).map(String).sort();
}
/* 当前应显示的日期：手动翻历史优先 → 今天（若在索引里）→ 索引最新一日 → 今天 */
function targetDate(){
  const v=state.settings.viewDate;
  if(v)return v;
  const t=todayStr();
  if(!state.dates.length||state.dates.includes(t))return t;
  return state.dates[state.dates.length-1];
}
/*
 * 拉取一轮：先 index（尽力而为，失败不阻断当日文件），再当日文件。
 * 失败语义（DESIGN）：已有旧数据 → 保留旧标记 + stale 标过期；
 * 从未成功过 → 无标记、无报错，状态卡写明失败原因。
 */
async function refresh(reason){
  if(state.disposed||state.inflight)return;
  const base=baseUrl();
  if(!base){ state.lastError='未设置信号源'; renderAll(); return; }
  state.inflight=true;
  try{
    try{ const idx=await fetchJson(`${base}/index.json`); const ds=validIndex(idx); if(ds.length)state.dates=ds; }catch(_){ /* 索引失败不阻断 */ }
    const date=targetDate();
    const env=validEnvelope(await fetchJson(`${base}/${date}.json`),date);
    if(!env)throw new Error('信号文件格式不合规');
    state.envelope=env; state.envelopeDate=date;
    state.generatedAt=env.generated_at; state.fetchedAt=Date.now();
    state.stale=false; state.lastError=''; state.failCount=0;
  }catch(e){
    state.lastError=String(e?.message||e||'拉取失败');
    state.failCount=(state.failCount||0)+1;
    if(state.envelope)state.stale=true;
  }finally{
    state.inflight=false;
    renderAll();
  }
}
/* 自动刷新：优先 ctx.resources.interval（宿主托管、停用自动清理） */
function startTimer(){
  stopTimer();
  const sec=Math.max(15,Number(state.settings.refreshSec)||60);
  const tick=()=>{
    if(state.disposed)return;
    if(state.settings.viewDate&&state.settings.viewDate!==todayStr())return;  // 看历史时不自动刷
    if(!isTradingNow())return;
    void refresh('auto');
  };
  try{
    const stop=state.ctx?.resources?.interval?.(tick,sec*1000);
    if(typeof stop==='function'){ state.timerStop=stop; return; }
  }catch(_){ /* 落到兜底 */ }
  const id=setInterval(tick,sec*1000);
  state.timerStop=()=>clearInterval(id);
  try{ state.ctx?.resources?.add?.(state.timerStop); }catch(_){ /* 靠 disposed 兜底 */ }
}
function stopTimer(){ if(state.timerStop){ try{state.timerStop()}catch(_){} state.timerStop=null; } }

/* ---------------- 当前视图（ctx.core.getContext，合同） ---------------- */
function syncView(){
  try{
    const v=state.ctx?.core?.getContext?.()||{};
    const sym=String(v.symbol||'');
    const per=String(v.period||'');
    const changed=(sym&&sym!==state.symbol)||(per&&per!==state.period);
    if(sym&&sym!==state.symbol){ state.settings.seenCount=0; saveSettings(); }
    if(sym)state.symbol=sym;
    if(per)state.period=per;
    return changed;
  }catch(_){ return false; }
}

/* ---------------- 过滤与锚定 ---------------- */
/* 只收 confirmed；按 id 去重；只显示当前股票（code 与宿主 symbol 归一比较） */
function visibleSignals(){
  const env=state.envelope;
  if(!env)return [];
  const seen=new Set(), out=[];
  for(const sig of env.signals){
    if(!sig||typeof sig!=='object')continue;
    if(sig.status&&sig.status!=='confirmed')continue;
    const key=String(sig.id||`${sig.code}|${sig.time}|${sig.type}|${sig.side}`);
    if(seen.has(key))continue; seen.add(key);
    if(state.symbol&&String(sig.code||'').trim()!==state.symbol)continue;
    out.push(sig);
  }
  return out;
}
/* 批量二筛选（与图标窗同套）：强度+方向，筛掉数在状态卡实时显示 */
function filteredSignals(){
  const s=state.settings;
  return visibleSignals().filter(sig=>{
    if(s.directionFilter!=='all'&&sideOf(sig)!==s.directionFilter)return false;
    if(s.typeFilter!=='all'){
      if(s.typeFilter==='kline_signal'&&!String(sig.type||'').startsWith('kline'))return false;
      if(s.typeFilter!=='kline_signal'&&String(sig.type||'')!==s.typeFilter)return false;
    }
    const st=num(sig.strength);
    if(s.minStrength>0&&(!isNum(st)||st<s.minStrength))return false;
    return true;
  });
}
function unreadCount(){ return Math.max(0,visibleSignals().length-state.settings.seenCount); }
/* 信号源断开分类：网络不通/地址错/数据格式不对，三种提示分开写 */
function sourceErrorText(){
  const e=String(state.lastError||'');
  if(!e)return '';
  if(/格式不合规|JSON|Unexpected/.test(e))return `信号源数据格式不对：${e}`;
  if(/404|地址|未设置/.test(e))return `信号源地址错：${e}`;
  return `信号源网络不通：${e}`;
}
/* 日K锚点：用 ctx.data.kline.visible() 的实际 K 棒时间归一（合同） */
function dayBarMs(sig){
  const d=String(sig.date||'').slice(0,10)||shDateStr(msOf(sig.time));
  try{
    const rows=state.ctx?.data?.kline?.visible?.();
    if(Array.isArray(rows)){
      for(const r of rows){ const ts=num(r?.timestamp); if(isNum(ts)&&shDateStr(ts)===d)return ts; }
    }
  }catch(_){ /* data 不可用时落到日期零点锚，宿主会就近吸附 */ }
  const ms=Date.parse(`${d}T00:00:00+08:00`);
  return Number.isFinite(ms)?ms:NaN;
}
/* 信号锚点（毫秒）：分时按分钟对齐；K线按当前宿主周期取同周期信号，
   30m/5m 向下对齐 bar 起点，day 用 visible K 棒归一 */
function anchorFor(sig,context){
  const ms=msOf(sig.time);
  if(!isNum(ms))return NaN;
  if(context===CTX_INTRA)return floorToBarMs(ms,1);
  const period=String(sig.period||'day');
  if(period==='day')return dayBarMs(sig);
  if(period==='30m')return floorToBarMs(ms,30);
  if(period==='5m')return floorToBarMs(ms,5);
  return NaN;
}
/* K线层只画与当前宿主周期同周期的信号（time 模式下 K线层由宿主自动隐藏） */
function klinePeriodMatches(sig){
  const p=String(sig.period||'day');
  const host=state.period;
  if(!host||host==='time')return true;             // 宿主周期未知时不过滤
  if(host==='day')return p==='day';
  if(host==='m30'||host==='30m')return p==='30m';
  if(host==='m5'||host==='5m')return p==='5m';
  return p==='day';
}
function markersFor(context){
  const s=state.settings;
  if(!s.overlayEnabled)return [];
  if(context===CTX_INTRA&&!s.intradayEnabled)return [];
  if(context===CTX_KLINE&&!s.klineEnabled)return [];
  const wantChart=context===CTX_INTRA?'intraday':'kline';
  const list=[];
  for(const sig of filteredSignals()){
    if(String(sig.chart||'')!==wantChart)continue;
    if(context===CTX_KLINE&&!klinePeriodMatches(sig))continue;
    const t=anchorFor(sig,context);
    if(!isNum(t))continue;
    const m=toMarker(sig,t);
    if(!isNum(m.value))continue;
    list.push(m);
  }
  list.sort((a,b)=>a.time-b.time);
  return list.slice(0,MAX_MARKERS);
}

/* ---------------- 渲染 ---------------- */
function renderMarkers(){
  for(const context of [CTX_INTRA,CTX_KLINE]){
    const layer=state.layers[context];
    if(!layer)continue;
    try{ layer.setData(markersFor(context)); }catch(_){ /* 单层失败不影响另一层 */ }
  }
}
function statusSegments(){
  const s=state.settings;
  const date=state.envelopeDate||targetDate();
  const segs=[];
  if(!baseUrl())segs.push({text:`${date} 未设置信号源`});
  else if(!state.envelope)segs.push({text:`${date} ${state.lastError?sourceErrorText():'加载中'}${state.envelope?' 旧信号保留':''}`});
  else if(state.lastError)segs.push({text:`${sourceErrorText()} 旧信号保留`});
  else{
    const gen=state.generatedAt?shTimeStr(Date.parse(state.generatedAt)):'--';
    const got=state.fetchedAt?shTimeStr(state.fetchedAt):'--';
    segs.push({text:`${date} 数据${gen} 拉取${got}${state.stale?' 已过期':''}`});
  }
  if(!s.overlayEnabled)segs.push({text:'标记总开关 关'});
  const all=visibleSignals(), rows=filteredSignals().slice().sort((a,b)=>msOf(b.time)-msOf(a.time));
  const unread=unreadCount();
  const intraN=all.filter(x=>x.chart==='intraday').length, klineN=all.filter(x=>x.chart==='kline').length;
  segs.push({text:`分时 ${intraN} 条 / K线 ${klineN} 条 / 合计 ${all.length} 条`});
  if(state.generatedAt){ const mins=Math.max(0,Math.round((Date.now()-Date.parse(state.generatedAt))/60000)); segs.push({text:`数据新鲜度：生成于 ${mins} 分钟前`}); }
  if(state.failCount>0)segs.push({text:`信号源连续失败 ${state.failCount} 次`});
  if(unread>0)segs.push({text:`未看信号 ${unread} 条（角标）`});
  if(s.minStrength>0||s.directionFilter!=='all')segs.push({text:`筛选：强度≥${s.minStrength} 方向${s.directionFilter==='all'?'全部':s.directionFilter==='buy'?'买':'卖'}，筛掉 ${all.length-rows.length} 条，剩余 ${rows.length} 条`});
  for(const sig of rows.slice(0,10)){
    const ms=msOf(sig.time);
    const pp=isNum(ms)?shParts(ms):{hour:'--',minute:'--'};
    const tag=sig.chart==='intraday'?'分时':(sig.period==='day'?'日K':sig.period);
    const note=s.notes[String(sig.id||'')] ? ` 备注：${s.notes[String(sig.id||'')]}` : '';
    segs.push({text:`${pp.hour}:${pp.minute} ${sideOf(sig)==='buy'?'买':'卖'} ${sig.price} ${labelOf(sig)} ${tag}${note}`.slice(0,80)});
  }
  if(state.envelope&&rows.length===0)segs.push({text:'当日无信号（筛选后）'});
  else if(rows.length>10)segs.push({text:`共 ${rows.length} 条，倒序显示前 10 条`});
  return segs;
}
function renderStatus(){
  const card=state.uiHandles.status;
  if(card){ try{ card.update?.({segments:statusSegments()}); }catch(_){ /* 状态卡更新失败不影响标记 */ } }
}
function renderAll(){ renderMarkers(); renderStatus(); refreshToggleLabels(); emitTidal(); }

/* ---------------- 宿主图标用状态接口（V5 匹配，插件不画图标） ----------------
 * 宿主图标只读这个接口，不直接写插件 workspace、不自己算信号数。
 * 接口不存在时宿主不编数字、不崩；接口在时角标 = badge（今天当前股可见信号数 - 已看数）。 */
const tidalListeners=new Set();
function tidalState(){
  const s=state.settings;
  return {
    id:ID, version:VER, symbol:state.symbol, period:state.period,
    date:state.envelopeDate||targetDate(),
    sourceBaseUrl:baseUrl(),
    badge:unreadCount(), total:visibleSignals().length, filtered:filteredSignals().length,
    switches:{overlayEnabled:s.overlayEnabled,intradayEnabled:s.intradayEnabled,klineEnabled:s.klineEnabled,directLabelEnabled:s.directLabelEnabled,dashedLineEnabled:s.dashedLineEnabled},
    filters:{minStrength:s.minStrength,directionFilter:s.directionFilter,typeFilter:s.typeFilter},
    iconPos:s.iconPos, viewDate:s.viewDate||'',
    lastError:state.lastError||'', stale:!!state.stale
  };
}
function emitTidal(){
  if(!tidalListeners.size)return;
  let snap=null; try{ snap=tidalState(); }catch(_){ return; }
  for(const cb of [...tidalListeners]){ try{ cb(snap); }catch(_){} }
}
const tidalHook={
  getState:()=>tidalState(),
  onChange:(cb)=>{ if(typeof cb!=='function')return ()=>{}; tidalListeners.add(cb); return ()=>tidalListeners.delete(cb); },
  setSwitch:(key,value)=>{
    if(!['overlayEnabled','intradayEnabled','klineEnabled','directLabelEnabled','dashedLineEnabled'].includes(key))return false;
    state.settings[key]=!!value; saveSettings(); renderAll(); return true;
  },
  setFilter:(key,value)=>{
    if(key==='minStrength'){ const v=Math.max(0,Math.min(100,Number(value))); if(!Number.isFinite(v))return false; state.settings.minStrength=v; }
    else if(key==='directionFilter'){ if(!['all','buy','sell'].includes(value))return false; state.settings.directionFilter=value; }
    else if(key==='typeFilter'){ if(!['all','t_signal','t_trade','kline_signal','kline_combo'].includes(value))return false; state.settings.typeFilter=value; }
    else return false;
    saveSettings(); renderAll(); return true;
  },
  setIconPos:(pos)=>{
    let str='';
    if(typeof pos==='string')str=pos.trim();
    else if(pos&&typeof pos==='object'){ const x=Number(pos.x), y=Number(pos.y); if(!Number.isFinite(x)||!Number.isFinite(y))return false; str=`${x},${y}`; }
    else return false;
    const parts=str.split(',').map(Number);
    if(parts.length!==2||!parts.every(n=>Number.isFinite(n)&&n>=0&&n<=100))return false;
    state.settings.iconPos=str; saveSettings(); emitTidal(); return true;
  },
  markSeen:()=>{ state.settings.seenCount=visibleSignals().length; saveSettings(); renderAll(); return true; },
  setViewDate:(date)=>{
    if(date!==''&&!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))return false;
    state.settings.viewDate=String(date); saveSettings(); void refresh('icon-date'); return true;
  },
  refresh:()=>{ void refresh('icon-manual'); return true; }
};
root.__AGP_TIDAL__=tidalHook;

/* ---------------- UI（ctx.ui.mount：settings.plugin + panel.analysis，合同） ---------------- */
function mountUi(spec){
  try{ return state.ctx?.ui?.mount?.(spec)||null; }catch(_){ return null; }
}
function refreshToggleLabels(){
  const s=state.settings;
  const map={
    toggle:`标记总开关：${s.overlayEnabled?'开':'关'}`,
    intra:`分时标记：${s.intradayEnabled?'开':'关'}`,
    kline:`K线标记：${s.klineEnabled?'开':'关'}`,
    interval:`刷新间隔：${s.refreshSec}秒`,
    date:`信号日期：${targetDate()}`
  };
  for(const k of Object.keys(map)){
    const h=state.uiHandles[k];
    if(h){ try{ h.update?.({label:map[k]}); }catch(_){} }
  }
}
function setupUi(){
  const add=(key,slot,label,order,onAction)=>{
    const h=mountUi({slot,kind:'button',label,order,onAction});
    if(h)state.uiHandles[key]=h;
    return h;
  };
  add('source','settings.plugin','潮汐信号源 URL',41,()=>{
    const cur=state.settings.sourceBaseUrl;
    let v=null;
    try{ v=typeof root.prompt==='function'?root.prompt('潮汐信号源基地址（公开 HTTPS 直链目录，含 index.json 与 YYYY-MM-DD.json）',cur):null; }catch(_){ v=null; }
    if(typeof v==='string'){ state.settings.sourceBaseUrl=v.trim(); saveSettings(); void refresh('manual'); }
  });
  add('refresh','settings.plugin','潮汐信号 刷新',42,()=>{ void refresh('manual'); });
  add('toggle','settings.plugin','标记总开关：开',43,()=>{ state.settings.overlayEnabled=!state.settings.overlayEnabled; saveSettings(); renderAll(); });
  add('intra','settings.plugin','分时标记：开',44,()=>{ state.settings.intradayEnabled=!state.settings.intradayEnabled; saveSettings(); renderAll(); });
  add('kline','settings.plugin','K线标记：开',45,()=>{ state.settings.klineEnabled=!state.settings.klineEnabled; saveSettings(); renderAll(); });
  add('interval','settings.plugin','刷新间隔：60秒',46,()=>{
    const i=REFRESH_CHOICES.indexOf(state.settings.refreshSec);
    state.settings.refreshSec=REFRESH_CHOICES[(i+1)%REFRESH_CHOICES.length];
    saveSettings(); startTimer(); refreshToggleLabels();
  });
  add('datePrev','settings.plugin','信号日期 上一日',47,()=>stepDate(-1));
  add('date','settings.plugin','信号日期：今日',48,()=>{ state.settings.viewDate=''; saveSettings(); void refresh('manual'); });
  add('dateNext','settings.plugin','信号日期 下一日',49,()=>stepDate(1));
  add('strength','settings.plugin','强度筛选：0 全显',50,()=>{
    const steps=[0,50,65,80,100];
    const i=steps.indexOf(state.settings.minStrength);
    state.settings.minStrength=steps[(i+1)%steps.length];
    saveSettings(); renderAll();
    const h=state.uiHandles.strength; if(h)try{h.update?.({label:`强度筛选：${state.settings.minStrength===0?'0 全显':`≥${state.settings.minStrength}`}`})}catch(_){}
  });
  add('direction','settings.plugin','方向筛选：全部',51,()=>{
    const steps=['all','buy','sell'];
    const i=steps.indexOf(state.settings.directionFilter);
    state.settings.directionFilter=steps[(i+1)%steps.length];
    saveSettings(); renderAll();
    const h=state.uiHandles.direction; if(h)try{h.update?.({label:`方向筛选：${state.settings.directionFilter==='all'?'全部':state.settings.directionFilter==='buy'?'只看买':'只看卖'}`})}catch(_){}
  });
  add('seen','settings.plugin','已看清零',52,()=>{ state.settings.seenCount=visibleSignals().length; saveSettings(); renderAll(); });
  add('note','settings.plugin','给最新信号加备注',53,()=>{
    const latest=filteredSignals().slice().sort((a,b)=>msOf(b.time)-msOf(a.time))[0];
    if(!latest)return;
    let v=null;
    try{ v=typeof root.prompt==='function'?root.prompt('给最新信号加备注（跟了/没跟/观察）',state.settings.notes[String(latest.id||'')]||''):null; }catch(_){ v=null; }
    if(typeof v==='string'&&v.trim()){ state.settings.notes[String(latest.id||'')]=v.trim(); saveSettings(); renderAll(); }
  });
  add('type','settings.plugin','信号类型：全部',54,()=>{
    const steps=['all','t_signal','t_trade','kline_signal','kline_combo'];
    const labels={all:'全部',t_signal:'分时信号',t_trade:'分时成交',kline_signal:'K线信号',kline_combo:'K线组合'};
    const i=steps.indexOf(state.settings.typeFilter);
    state.settings.typeFilter=steps[(i+1)%steps.length];
    saveSettings(); renderAll();
    const h=state.uiHandles.type; if(h)try{h.update?.({label:`信号类型：${labels[state.settings.typeFilter]}`})}catch(_){}
  });
  add('reset','settings.plugin','恢复默认筛选',55,()=>{
    state.settings.minStrength=0; state.settings.directionFilter='all'; state.settings.typeFilter='all';
    saveSettings(); renderAll();
  });
  add('export','settings.plugin','导出当天信号（复制）',56,()=>{
    const rows=filteredSignals().slice().sort((a,b)=>msOf(a.time)-msOf(b.time));
    const csv=['时间,方向,价格,来源,强度,类型'].concat(rows.map(sig=>`${sig.time},${sideOf(sig)==='buy'?'买':'卖'},${sig.price},${sig.source||''},${sig.strength||''},${sig.type||''}`)).join('\n');
    try{ if(root.navigator?.clipboard?.writeText)void root.navigator.clipboard.writeText(csv); else if(typeof root.prompt==='function')root.prompt('当天信号（复制下面内容）',csv); }catch(_){}
  });
  add('refreshPanel','panel.analysis','潮汐信号 刷新',21,()=>{ void refresh('manual'); });
  const card=mountUi({slot:'panel.analysis',kind:'stat-card',order:22,title:'今日信号',segments:[{text:'潮汐：未获取信号'}]});
  if(card)state.uiHandles.status=card;
  refreshToggleLabels();
}
/* 按 index 在可用日期间翻日；无 index 时按自然日步进 */
function stepDate(dir){
  const cur=targetDate();
  if(state.dates.length){
    let i=state.dates.indexOf(cur);
    if(i<0)i=dir>0?state.dates.filter(d=>d>cur).length-1:state.dates.filter(d=>d<cur).length-1;
    if(i<0)i=dir>0?0:state.dates.length-1;
    const next=state.dates[clamp(i+dir,0,state.dates.length-1)];
    if(next)state.settings.viewDate=next===todayStr()?'':next;
  }else{
    const ms=Date.parse(`${cur}T00:00:00+08:00`)+dir*86400000;
    state.settings.viewDate=shDateStr(ms);
  }
  saveSettings(); void refresh('manual');
}

/* ---------------- activate（合同示例结构） ---------------- */
function activate(ctx){
  state.ctx=ctx; state.disposed=false;
  loadSettings(ctx);
  syncView();
  /* 双主图独立标记层（合同 createMarkerLayer；拿不到时该层不渲染，不抛错） */
  for(const context of [CTX_INTRA,CTX_KLINE]){
    try{
      const layer=ctx?.visual?.createMarkerLayer?.({context,order:80});
      if(layer&&typeof layer.setData==='function')state.layers[context]=layer;
    }catch(_){ /* 权限/宿主差异时静默降级 */ }
  }
  setupUi();
  /* 视图变化：重绑 + 按新 symbol/period 重新投影（合同示例） */
  const onView=()=>{
    if(state.disposed)return;
    const changed=syncView();
    for(const context of [CTX_INTRA,CTX_KLINE]){ try{ state.layers[context]?.rebind?.(); }catch(_){} }
    if(changed)renderAll(); else renderMarkers();
  };
  for(const ev of ['view.change','view.ready']){
    try{ ctx?.resources?.onCore?.(ev,onView); }catch(_){ /* 事件缺失不阻断 */ }
  }
  startTimer();
  void refresh('init');   // 首拉不受开盘时段限制：先把今天/最新一日显示出来
  /* 清理函数（合同示例返回 cleanup；宿主另按 owner 自动回收层与 UI） */
  return ()=>{
    state.disposed=true;
    stopTimer();
    for(const context of [CTX_INTRA,CTX_KLINE]){ try{ state.layers[context]?.remove?.(); }catch(_){} }
    for(const k of Object.keys(state.uiHandles)){ try{ state.uiHandles[k]?.remove?.(); }catch(_){} }
    state.layers={}; state.uiHandles={};
    tidalListeners.clear();
    if(root.__AGP_TIDAL__===tidalHook)delete root.__AGP_TIDAL__;
  };
}

/* ---------------- spec（合同最小示例结构） ---------------- */
bag.plugins.push({
  id:ID,
  name:'潮汐指标-MuseAi',
  version:VER,
  type:'plugin',
  autostart:true,
  slots:['chart.main.overlay','settings.plugin','panel.analysis'],
  permissions:['workspace.write','visual.marker','visual.interact','ui.surface','data.read'],
  requirements:{
    contracts:{ pluginHost:'0.8.0', visualHost:'0.16.9', uiSurfaceHost:'1.16.0' },
    indicatorContexts:[CTX_INTRA,CTX_KLINE]
  },
  activate
});
})();
