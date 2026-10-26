(()=>{ 'use strict';
/* V20（2026-10-26，本地-only，排除自身问题后定稿）：
 * V19 错把宿主快捷面板当成唯一面板，插件从未用过宿主已提供的自有面板与备注编辑器接口，
 * 导致“面板改不了、双击备注做不了”被误判成宿主问题。V20 先修插件自己：
 * ① 自有面板：ctx.ui.mountPanel（宿主 V64 已提供，标题栏自带版本号、右上角 ⚙ 高级设置入口、
 *    股票+日期同行、分组默认折叠且折叠状态持久化），插件自己画主窗口，不再等宿主快捷面板改；
 *    宿主检测到自有面板后会自动隐藏宿主潮汐图标并关闭宿主快捷面板，见 host tidalHostSync。
 * ② 双击备注：标记层 layer.on('dblclick') 注册（V19 从未注册，宿主原生双击路径用 hover 命中、
 *    无监听时直接返回，备注自然接不到）；双击后调 ctx.ui.openNoteEditor（宿主已提供，
 *    轻量文本+保存/取消），存入 setNoteById，失败时回落 prompt；标记仍保持 hoverOnly，
 *    不拦截图表拖动。
 * ③ 高级设置：详细筛选/恢复/刷新全部移到自有面板“高级设置”分组（默认折叠），主窗口只留
 *    股票+日期、开关组（默认折叠）、今日活跃信号，功能不砍只换地方。
 */

/*
 * V19（2026-10-26，用户 12:08 定稿上传）：主窗口尽量简化、功能不简化，详细设置移到高级设置。插件侧可做的：设置对话框去重（删与顶部入口重复的开关组按钮、删恢复默认信号源独立按钮，信号源 URL 留空即恢复默认）、删设置里的翻日导航（翻日走主窗口股票行/宿主快捷面板与 hook setSignalDatePreset）、删设置里的备注按钮（备注入口改到图上信号标签双击，见 hook setNote/editNote，轻量弹出、不搞复杂编辑器）；备注数据与样式走 hook：setNote(id,text,style) 只认文字 + 简单字号/颜色，标记上带 noteLabel/noteStyle 供宿主画在标签上方，宿主未画时备注仍在悬停与信号列表里；宿主快捷面板用的结构化字段见 tidalState 的 quickPanel/settingsForm（标题栏版本号、股票行日期、高级设置右上角入口、开关组默认折叠，均为宿主渲染项，插件只提供数据，不谎报宿主已画）。
 * 潮汐指标-MuseAi（V15，本地-only，未推）
 * V15（2026-10-25，本地-only，未推）：版本号显示 + 折叠展示 + 移除无意义开关。用户看截图后定：取消“标记总开关”和“虚线”两个开关——插件面删掉这两个开关，内部固定开启（总开关恒开、虚线恒开），分时/K线/直接标签各自开关不动；hook 里这两个字段恒 true 兼容宿主，宿主面板不因此变未知；宿主侧删开关另走宿主信，插件不编造宿主行为。随后用户再定全量精简：全部开关/按钮/状态卡行/列表项/筛选项逐个再问一次，无决策信息损失就移除（见报告移除清单），只留精简有意义的。
 * V15（2026-10-25，本地-only，未推）：版本号显示 + 折叠展示。版本号不再只藏在 hook 里，状态卡首行即写“潮汐 V15”，使用者一眼知道装的是哪一版；状态卡分段可折叠（次要段、信号列表），折叠只改状态卡文案，不改标记、不改角标、不改筛选，折叠状态会话内保留、重激活复位；开关组（标记/分时/K线/强度/方向/类型/策略/密集/只看未看）默认收起，只露一个“开关组：展开”入口，点开才挂全部开关按钮，收起时开关本身状态与信号显示不变。被砍的方案：版本号单独成行（多占 1 行，V13 刚压过行数）、每段 6 个独立按钮（设置面板臃肿，V13 刚砍过重复按钮）、折叠时整段删除（看不出该段存在）、折叠状态写进 workspace 持久化（任务定会话内保留，且重激活复位更可预测）、折叠图上标记本身（会丢信号，违背折叠不丢信号）。
 * 潮汐指标-MuseAi（Wed-DP 外部插件）V10（前 V9，本地-only）
 * V14（2026-10-25，本地-only，未推）：历史信号日期清单 1 行 + 翻日跳过已知空日。诚实口径：index.json 只给日期、不给计数，逐日拉取算计数是上一轮已砍的 N 倍拉取，本轮不做；“空”只认会话内已拉取过的缓存信封（当前股 confirmed 信号数为 0），未拉取过的日期不谎称有/无信号，只列日期；翻日时跳过已知空日，全部已知空日时才落回最近一日不卡死。顺手统一 V13 筛选行文案（“图上标记”→“图上”，与筛掉>0 支一致）。
 * V16（2026-10-26，本地-only 大改版，未推）：登记表扩到 9 种形状（V63 合同 star/flag + glyph/glyphColor/glyphSize），日K改 star+日字、K线组合改 flag+组字、新增分时突破 star+突字；状态卡新增三周期总览行，状态行/筛选行在无异常无筛选时并入总览（自我否定）；旧 7 种回归不破。
 * V18（2026-10-26，本地-only，未推，核实后改）：V15/V16 的版本号与开关折叠在截图里看不到，不是功能没做，是放错了面——版本号只在 panel.analysis 状态卡首行，开关按钮只在 settings.plugin 面；宿主把状态卡渲染成单行横条（height 22px、nowrap），把设置按钮放进 display:none 的插件独立设置对话框，主图 + 宿主图标面板截图永远拍不到这两处；分析面板默认折叠（宽 32px），不展开 + 不点“插件”页连首段都看不到。本轮把两者移到使用者能看到的地方：状态卡首段缩短为一屏能看完的“版本 + 股 + 共几条 + 未看 + 开关折叠状态”，不再靠横向溢出的后段；设置面顶部（order 39）新增“潮汐指标 V18 · 开关组”入口按钮，点它即开关组展开/收起，标签随折叠状态同步。V17 小圆点改动原样保留。
 * V17（2026-10-26，本地-only，未推，用户反馈必改）：V16 大星形/旗形压在分时实时价位线上太遮挡。分时实时线一律改小圆点（大小 6，强信号 7，不透明 0.9，无 glyph，不压价位线），买/卖仍靠红/青颜色 + 标签 ▲/▼ + 列表符号区分；大形状（star/flag 及原三角/箭头/菱形/方块）不再压在分时实时价位上，改为提醒/备注用途：上一条信号提醒行、信号列表符号、hook previousSignal/reminderSignals（大形状+glyph+代码），以及 K线历史标注（日K star、日K组合 flag 仍在 K线图上，不属分时实时线）。分时坐标、数量、面板、总览不变。
 * V13（2026-10-25，自我否定迭代，未推）：主动否定自己以前留下的东西。砍：网络图标包拉取（内置+registerIcon 已够，真实目录本就没有 icons.json，包只带来一次额外拉取与 3 秒超时面）；状态卡图标行；联想明细 3 行（只留计数行，明细与列表重复）；信号源行里的拉取/缓存计数（诊断数，不是决策信息）；重复按钮 4 个：信号源默认/自定义切换（与恢复默认信号源重复）、给已定位信号加备注（与给最新信号加备注重复入口）、导出复制按钮（hook exportCsv 保留）、刷新间隔循环按钮（4 档循环点 3 次才到目标档，且无证据用户改过间隔，默认 60 秒保留）。
 * V12（2026-10-25，等待期本地迭代，未推）：在 V11 基础上只补一处筛选行超长——筛掉>0 时零拆解项（强度 0·类型 0·策略 0）同样是零信息，改为只列非零拆解项，实测方向筛 82 字→约 55 字；V11 未推即被本地迭代取代，不产生远程版本 churn。
 * V11（2026-10-25，筛选迭代，非叠加迭代）：按用户新思维——先发散 24 候选、实测、再筛选。只留 3 项：①列表强度条（正强度分档，0/null 无条，不编造）；②列表最新一条行前 ★；③筛掉为 0 时筛选行压短（原 83 字超 80 字上限，零信息拆解不占行）。其余全部砍掉，见 tests/2026-10-25_V11-screening-report.md。
 * V10（2026-10-25，本地-only 图标库，内置优先调整）：核心能力一律内置在插件文件里内部调用，不依赖网络图标包、不依赖宿主往返。STYLE_REGISTRY 即内置图标登记表（形状+颜色成套+符号+大小档），新指标只登记一条；hook registerIcon 可运行时登记；网络图标包（icons.json）只是可选附加，永不在信号关键路径上等待——信号先用内置图标渲染，包到了后台再重绘，拉不到/格式错/超时 3 秒即回落内置，不写进信号 lastError。网络只作为信号源拉取本身，不作为图标与显示逻辑的依赖。分界：插件能做的只是自己图上的标记图标（宿主 7 种形状内）；超出 7 种的新形状、宿主快捷图标本身、宿主按钮面的新按钮，都必须宿主改，插件编不出来。渲染缓存：同一渲染周期内可见信号/过滤信号/图上标记只算一次，重复 getState/renderAll 不重复算。
 * V9（2026-10-25，本地-only 续做）：日K可单独筛（typeFilter 补 kline_single）；只看未看筛选（unreadOnly，角标按股+日期的已看集合反向筛，列表行前 ●未看/○已看）；状态卡信号源地址截断到 32 字（完整地址仍在 hook sourceHealth）；悬停去重（分时T·激进不再重复写两次激进）；重置后全部按钮标签同步刷新；密集分组时间用 +08:00 归一；概览最强写成“强度65”不再只写数字。样式表本身不改，用户已学的形状/颜色/代码不变。
 * V8（2026-10-25，重新设计 + 多样式体系，本地未推）：不再沿用 V3/V4 小箭头+简单标签老样子。显示系统按样式表 STYLE 注册（见下）：方向永远用红系买/青系卖 + ▲/▼/◆/■/● 形状与文字符号三重编码，不只靠颜色；强度分档改大小（弱小、强更大）；直接标签文案由 sourceLabel 承载指标代码（分时T/分时T·激进/分时T·保守/K线T/日K/K线组合），宿主价位线文案即此代码+价+数量/箭头；密集 5 分钟同价同向信号合为 1 个带 ×N 的标记，列表里仍列全部不漏；状态卡重排为概览→状态→筛选→联想→列表，行内带 ▲买/▼卖 与强度--（null 不写 0）。宿主合同内能画的才算插件实现：形状只用 host 7 种、大小 3-24、颜色白描边、价位线样式/长度/标签底色/字体/72 条上限/8 次错开均属宿主，列入宿主派活草稿，不编造。
 * V7（2026-10-25，自主优化攒批，本地未推）：开箱即用默认信号源（未自定义时用公开 CXZB 目录，用户自定义优先）；同点合并（同图同锚同价同方向只画 1 条，tooltip 聚合来源）；策略筛选（激进/保守分开看）；跨周期联想（状态卡 + __AGP_TIDAL__.crossPeriod 给出同股同日分时/30分/日K 计数与对照信号）；信号列表可用（状态卡 20 条倒序 + 定位下一条/上一条 + 已定位信号 + 按定位信号加备注，图上滚动跳转仍需宿主消费 focus 字段，插件无滚动 API，不谎报）；日期/历史缓存（历史日期信封会话内复用、index 300 秒内不重拉、fetch/cache 计数可见）；容错分三类 + 旧信号保留 + 新鲜度；筛选恢复默认含策略；备注 id 与复合键双读双写。
 * V7（2026-10-25，自主优化攒批，本地未推）：开箱即用默认信号源（未自定义时用公开 CXZB 目录，用户自定义优先）；同点合并（同图同锚同价同方向只画 1 条，tooltip 聚合来源）；策略筛选（激进/保守分开看）；跨周期联想（状态卡 + __AGP_TIDAL__.crossPeriod 给出同股同日分时/30分/日K 计数与对照信号）；信号列表可用（状态卡 20 条倒序 + 定位下一条/上一条 + 已定位信号 + 按定位信号加备注，图上滚动跳转仍需宿主消费 focus 字段，插件无滚动 API，不谎报）；日期/历史缓存（历史日期信封会话内复用、index 300 秒内不重拉、fetch/cache 计数可见）；容错分三类 + 旧信号保留 + 新鲜度；筛选恢复默认含策略；备注 id 与复合键双读双写。
 * V6（2026-10-25，V62 宿主实测对齐）：V62 宿主归一化只认 settings（非 switches/filters）、badgeCount/activeSignalCount、setOption/setIconPosition/setSignalDatePreset 等名字，V5 的 switches/filters/markSeen/setIconPos 宿主读不到/写不动，故 getState 改按 V62 口径输出 settings+计数+位置，写方法、位置方法、日期导航、清零方法全部按宿主名补齐，旧名字保留兼容。
 * V6（2026-10-25，V62 宿主实测对齐）：V62 宿主归一化只认 settings（非 switches/filters）、badgeCount/activeSignalCount、setOption/setIconPosition/setSignalDatePreset 等名字，V5 的 switches/filters/markSeen/setIconPos 宿主读不到/写不动，故 getState 改按 V62 口径输出 settings+计数+位置，写方法、位置方法、日期导航、清零方法全部按宿主名补齐，旧名字保留兼容。
 * V5（2026-10-25，图标匹配）：宿主图标用状态接口 window.__AGP_TIDAL__，宿主图标读它画角标/开关、调它改开关/筛选/图标位置/清零；插件本身仍不画图标，图标由宿主画。接口不存在时宿主不编数字、不崩。
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
const ID='wed-ind.chaoxi.tidal', VER='V25';
const DEFAULT_SOURCE='https://raw.githubusercontent.com/G-Lcn/MAi-AG/main/A-GP/Wed-DP/Plugins/external/CXZB-MuseAi-ZT';
const CTX_INTRA='main.intraday', CTX_KLINE='main.kline';
const BUY='#ef5350';        // 买红（与做T标记先例一致）
const SELL='#26a69a';       // 卖绿（DESIGN 定 B 红 / S 绿）
const UNKNOWN_COLOR='#d98a2b';
const KIND_DAY='chaoxi-intraday-signals', KIND_INDEX='chaoxi-intraday-index';
const TZ='Asia/Shanghai';
const MAX_MARKERS=512;      // 合同：每层单次更新最多 512 项
const DEFAULT_SETTINGS=Object.freeze({
  sourceBaseUrl:DEFAULT_SOURCE, // V7 开箱即用：未自定义时用公开 CXZB 目录；用户自定义地址优先，永不被默认覆盖
  sourceCustom:false,      // true＝用户在插件设置里填过地址；false＝用默认地址
  refreshSec:60,           // 自动刷新间隔（秒），开盘时段内生效
  overlayEnabled:true,     // V15 固定开启：标记总开关已取消（无开关），Host 插件全局启停仍是①级
  intradayEnabled:true,    // 分时层开关（③级）
  klineEnabled:true,       // K线层开关（③级）
  directLabelEnabled:true, // 直接标签开关：批量二口径，信号旁直接写精简标签，不只悬停
  dashedLineEnabled:true,  // V15 固定开启：虚线开关已取消（无开关），信号价位恒画虚线
  iconPos:'',              // 潮汐图标位置持久化：''＝默认主图右侧中间，拖动后写 'x,y'（相对主图百分比）
  minStrength:0,           // 强度滑块：0=全显，拉到数值只显该值以上（批量二）
  directionFilter:'all',   // 方向筛选：all/buy/sell，与图标窗开关同套筛选
  notes:{},                // 信号备注：按信号 id 存，跟了/没跟/观察（批量二新增）
  noteStyles:{},           // V19 备注样式：按信号 id 存，只认简单字号/颜色，不搞复杂编辑器；空 = 跟随标签默认
  typeFilter:'all',        // 信号类型筛选：all/分时T/分时信号/K线信号/K线组合（继续优化）
  strategyFilter:'all',    // V7 策略筛选：all/aggressive/conservative，按 source/strategy 含 aggressive/conservative 判定
  denseGroupEnabled:true,  // V8 密集分组：5 分钟内同价同向信号合为 1 个 ×N 标记，列表仍列全部不漏
  unreadOnly:false,          // V9 只看未看：true 时只显示当前股+日期未看过的信号
  seenIds:{},              // V8 按股+日期记已看信号 id：{ "002073|2026-10-26": ["id",...] }，换股/换日期不复活旧已看
  failCount:0,             // 信号源连续失败次数：成功清零，失败累加（源健康度）
  seenCount:0,             // 兼容旧角标：V8 角标改按 seenIds 算，seenCount 仅作兼容回填
  viewDate:''              // 正在查看的日期（''＝跟随今天/索引最新一日），翻历史时写入
});
const REFRESH_CHOICES=[30,60,120,300];

/* type 注册表（DESIGN 拓展条款）：登记文案；未知 type 走通用点 + note */
const TYPE_REGISTRY=Object.freeze({
  t_signal:      { label:'分时信号' },
  t_trade:       { label:'分时成交' },
  kline_signal:  { label:'K线信号' },
  kline_single:  { label:'K线单信号' },
  kline_combo:   { label:'K线组合' },
  t_breakout:    { label:'分时突破' }
});
/* V8 样式表（可扩展：新指标只要登记一条，不用重写显示层；方向=红系买/青系卖，样式=形状+符号+标签代码+大小档）
 * 宿主合同内形状只有 7 种：circle/square/diamond/triangleUp/triangleDown/arrowUp/arrowDown；大小 3-24；颜色白描边由宿主画。
 * 样式区分点（不只靠颜色）：形状 + 文字符号（▲▼◆■●） + sourceLabel 代码 + 大小档；买永远红系、卖永远青系，样式不翻转方向色。 */
/* V10 图标库：STYLE_REGISTRY 即内置图标登记表；ICON_OVERRIDES 为运行时/网络包登记的覆盖层（新指标只登记一条，不改宿主、不改旧表） */
const ICON_REGISTRY_PLACEHOLDER=null;
const STYLE_REGISTRY=Object.freeze({
  't_signal':        { code:'分时T',     shapeBuy:'triangleUp', shapeSell:'triangleDown', symBuy:'▲', symSell:'▼', buy:'#ff5a5f', sell:'#2ec4b6', base:10, text:'' },
  't_trade_aggressive': { code:'分时T·激进', shapeBuy:'arrowUp',    shapeSell:'arrowDown',    symBuy:'⬆', symSell:'⬇', buy:'#ff7043', sell:'#00bfa5', base:12, text:'' },
  't_trade_conservative': { code:'分时T·保守', shapeBuy:'diamond',    shapeSell:'diamond',    symBuy:'◆', symSell:'◆', buy:'#ffb300', sell:'#4db6ac', base:9,  text:'' },
  'kline_signal':    { code:'K线T',      shapeBuy:'square',     shapeSell:'square',     symBuy:'■', symSell:'■', buy:'#ef5350', sell:'#26a69a', base:10, text:'' },
  'kline_single':    { code:'日K',       shapeBuy:'star',       shapeSell:'star',       symBuy:'★', symSell:'★', buy:'#f06292', sell:'#4dd0e1', base:11, text:'', glyph:'日' },
  'kline_combo':     { code:'K线组合',   shapeBuy:'flag',       shapeSell:'flag',       symBuy:'⚑', symSell:'⚑', buy:'#ff5252', sell:'#009688', base:11, text:'组', glyph:'组' },
  't_breakout':      { code:'分时突破', shapeBuy:'star',       shapeSell:'star',       symBuy:'★', symSell:'★', buy:'#ff8a2b', sell:'#00acc1', base:11, text:'', glyph:'突' },
  'default':         { code:'信号',      shapeBuy:'circle',     shapeSell:'circle',     symBuy:'●', symSell:'●', buy:'#ef5350', sell:'#26a69a', base:10, text:'' }
});
const ALLOWED_SHAPES=new Set(['circle','square','diamond','triangleUp','triangleDown','arrowUp','arrowDown','star','flag']);
const ICON_OVERRIDES={};
function validIconDef(d){
  if(!d||typeof d!=='object')return false;
  if(typeof d.code!=='string'||!d.code.trim()||d.code.trim().length>8)return false;
  if(!ALLOWED_SHAPES.has(d.shapeBuy)||!ALLOWED_SHAPES.has(d.shapeSell))return false;
  if(!/^#[0-9a-fA-F]{6}$/.test(String(d.buy||''))||!/^#[0-9a-fA-F]{6}$/.test(String(d.sell||'')))return false;
  if(!Number.isInteger(Number(d.base))||Number(d.base)<3||Number(d.base)>24)return false;
  if(d.symBuy!==undefined&&typeof d.symBuy!=='string')return false;
  if(d.symSell!==undefined&&typeof d.symSell!=='string')return false;
  if(d.text!==undefined&&typeof d.text!=='string')return false;
  if(d.glyph!==undefined&&(typeof d.glyph!=='string'||d.glyph.length>4))return false;
  return true;
}
function registerIcon(key,def){
  if(typeof key!=='string'||!key.trim()||!validIconDef(def))return false;
  const k=key.trim();
  ICON_OVERRIDES[k]={code:def.code.trim(),shapeBuy:def.shapeBuy,shapeSell:def.shapeSell,symBuy:def.symBuy||'●',symSell:def.symSell||'●',buy:def.buy,sell:def.sell,base:Number(def.base),text:def.text||'',glyph:typeof def.glyph==='string'?def.glyph.slice(0,4):''};
  return true;
}
function iconRegistryList(){
  const out=[];
  for(const [k,v] of Object.entries(STYLE_REGISTRY)) out.push({key:k,code:v.code,shapeBuy:v.shapeBuy,shapeSell:v.shapeSell,symBuy:v.symBuy,symSell:v.symSell,buy:v.buy,sell:v.sell,base:v.base,text:v.text,glyph:v.glyph||'',source:'builtin'});
  for(const [k,v] of Object.entries(ICON_OVERRIDES)) out.push({key:k,...v,source:'registered'});
  return out;
}
function styleOf(sig){
  const st=strategyOf(sig);
  if(sig?.type==='t_trade'&&st==='aggressive'&&ICON_OVERRIDES.t_trade_aggressive)return ICON_OVERRIDES.t_trade_aggressive;
  if(sig?.type==='t_trade'&&st==='conservative'&&ICON_OVERRIDES.t_trade_conservative)return ICON_OVERRIDES.t_trade_conservative;
  if(sig?.type==='t_trade'&&ICON_OVERRIDES.t_trade)return ICON_OVERRIDES.t_trade;
  if(sig?.type&&ICON_OVERRIDES[sig.type])return ICON_OVERRIDES[sig.type];
  if(sig?.type==='t_trade'&&st==='aggressive')return STYLE_REGISTRY.t_trade_aggressive;
  if(sig?.type==='t_trade'&&st==='conservative')return STYLE_REGISTRY.t_trade_conservative;
  if(sig?.type==='t_trade')return STYLE_REGISTRY.t_signal;
  return STYLE_REGISTRY[sig?.type]||STYLE_REGISTRY.default;
}
function sizeForStyle(style,sig){
  const st=(sig?.strength===null||sig?.strength===undefined)?null:num(sig.strength);
  if(st===null||!isNum(st))return style.base;
  if(st>=70)return Math.min(14,style.base+2);
  if(st>=50)return style.base;
  return Math.max(8,style.base-1);
}
function strengthText(sig){
  if(sig?.strength===null||sig?.strength===undefined||!isNum(num(sig.strength)))return '--';
  return String(num(sig.strength));
}

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
  disposed:false,
  dateCache:{},           // V7：日期 -> 信封（历史日期会话内复用，不重拉）
  indexCacheAt:0,         // V7：index 最近成功拉取时刻（300 秒内不重拉）
  fetchCount:0,           // V7：本会话实际 fetch 次数（index+日期文件合计）
  cacheHits:0,            // V7：本会话缓存命中次数
  focusIndex:-1,          // V7：定位信号在倒序过滤列表中的下标（会话内，不持久化）
  iconPack:{status:'builtin',source:'',applied:0,skipped:0,error:''}, // V10 网络图标包状态（失败不进 lastError，不影响信号）
  iconPackBase:'',
  iconPackCacheAt:0,
  iconPackFetches:0,
  iconPackLoading:false,
  renderCache:{key:'',visible:null,filtered:null,markersIntra:null,markersKline:null},
  markerComputes:0, filterComputes:0,
  // V15 折叠状态（会话内保留，不进 DEFAULT_SETTINGS、不写 workspace，重激活复位为默认）：
  // 状态卡：watchlist/cross 默认折叠（次要段），list 默认展开（关键段），filter/main 恒展开；
  // 开关组：switchesExpanded 默认 false（收起），只露主入口按钮。
  collapsed:{watchlist:true, cross:true, list:false},
  switchesExpanded:false
};

/* ---------------- 设置（ctx.workspace 持久化，合同） ---------------- */
function loadSettings(ctx){
  let saved={};
  try{ saved=ctx?.workspace?.get?.()||{}; }catch(_){ saved={}; }
  const s={...DEFAULT_SETTINGS};
  // V7/V8：只有用户填过非空且非默认地址才算自定义；空地址、缺字段、默认地址一律落到默认地址，不再出现“未设置信号源就没信号”
  if(typeof saved.sourceBaseUrl==='string'&&saved.sourceBaseUrl.trim()&&saved.sourceBaseUrl.trim()!==DEFAULT_SOURCE){ s.sourceBaseUrl=saved.sourceBaseUrl.trim(); s.sourceCustom=true; }
  else if(typeof saved.sourceBaseUrl==='string'&&saved.sourceBaseUrl.trim()===DEFAULT_SOURCE){ s.sourceBaseUrl=DEFAULT_SOURCE; s.sourceCustom=false; }
  if(typeof saved.sourceCustom==='boolean'&&saved.sourceBaseUrl===DEFAULT_SOURCE)s.sourceCustom=false;
  if(!s.sourceCustom)s.sourceBaseUrl=DEFAULT_SOURCE;
  if(saved.seenIds&&typeof saved.seenIds==='object'){
    s.seenIds={};
    for(const [k,v] of Object.entries(saved.seenIds)) if(Array.isArray(v)) s.seenIds[k]=v.filter(x=>typeof x==='string').slice(0,200);
  }
  if(typeof saved.denseGroupEnabled==='boolean')s.denseGroupEnabled=saved.denseGroupEnabled;
  if(REFRESH_CHOICES.includes(Number(saved.refreshSec)))s.refreshSec=Number(saved.refreshSec);
  for(const k of ['intradayEnabled','klineEnabled','directLabelEnabled']) if(typeof saved[k]==='boolean')s[k]=saved[k];
  // V15 固定开启：旧 workspace 里存过的 overlay/dashed 旧值一律不读，强制 true（宿主全局启停仍在①级）。
  s.overlayEnabled=true; s.dashedLineEnabled=true;
  if(typeof saved.iconPos==='string')s.iconPos=saved.iconPos;
  if(Number.isFinite(Number(saved.minStrength)))s.minStrength=Math.max(0,Math.min(100,Number(saved.minStrength)));
  if(['all','buy','sell'].includes(saved.directionFilter))s.directionFilter=saved.directionFilter;
  if(saved.notes&&typeof saved.notes==='object')s.notes={...saved.notes};
  if(saved.noteStyles&&typeof saved.noteStyles==='object'){ s.noteStyles={}; for(const [k,v] of Object.entries(saved.noteStyles)) if(v&&typeof v==='object'){ const fs=Number(v.fontSize); const col=String(v.color||''); s.noteStyles[k]={fontSize:Number.isFinite(fs)?Math.max(10,Math.min(18,Math.floor(fs))):12, color:/^#[0-9a-fA-F]{6}$/.test(col)?col:''}; } }
  if(Number.isFinite(Number(saved.seenCount)))s.seenCount=Math.max(0,Number(saved.seenCount));
  if(['all','t_signal','t_trade','kline_signal','kline_single','kline_combo','t_breakout'].includes(saved.typeFilter))s.typeFilter=saved.typeFilter;
  if(typeof saved.unreadOnly==='boolean')s.unreadOnly=saved.unreadOnly;
  if(['all','aggressive','conservative'].includes(saved.strategyFilter))s.strategyFilter=saved.strategyFilter;
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(saved.viewDate||'')))s.viewDate=String(saved.viewDate);
  state.settings=s;
}
function saveSettings(){
  try{ state.ctx?.workspace?.set?.({...state.settings}); }catch(_){ /* 持久化失败不影响运行 */ }
}

/* ---------------- 文案 ---------------- */
function sideOf(sig){ return sig?.side==='sell'?'sell':'buy'; }
function strategyOf(sig){
  const hay=`${sig?.strategy||''} ${sig?.source||''} ${sig?.type||''}`.toLowerCase();
  if(hay.includes('conservative'))return 'conservative';
  if(hay.includes('aggressive'))return 'aggressive';
  return '';
}
function noteKey(sig){ return String(sig?.id||''); }
function noteKeyComposite(sig){ return `${sig?.code||state.symbol}|${String(sig?.date||'').slice(0,10)}|${sig?.id||''}`; }
function noteOf(sig){ return state.settings.notes[noteKey(sig)]||state.settings.notes[noteKeyComposite(sig)]||''; }
function noteStyleOf(sig){ const st=state.settings.noteStyles||{}; return st[noteKey(sig)]||st[noteKeyComposite(sig)]||{fontSize:12,color:''}; }
function sanitizeNoteStyle(style){ if(!style||typeof style!=='object')return {fontSize:12,color:''}; const fs=Number(style.fontSize); const col=String(style.color||''); return {fontSize:Number.isFinite(fs)?Math.max(10,Math.min(18,Math.floor(fs))):12, color:/^#[0-9a-fA-F]{6}$/.test(col)?col:''}; }
// V19 备注：轻量，只认文字 + 简单字号/颜色；空文字 = 删除该条备注与样式。宿主双击标签时调 hook setNote/editNote，不走设置对话框。
function setNoteById(id,text,style){ const key=String(id||''); if(!key)return false; if(typeof text!=='string'||!text.trim()){ delete state.settings.notes[key]; if(state.settings.noteStyles)delete state.settings.noteStyles[key]; } else { state.settings.notes[key]=text.trim().slice(0,200); if(style!==undefined)state.settings.noteStyles[key]=sanitizeNoteStyle(style); } saveSettings(); state.renderCache.key=''; state.renderCache.visible=null; state.renderCache.filtered=null; state.renderCache.markersIntra=null; state.renderCache.markersKline=null; renderAll(); return true; }
function tooltipOf(sig){
  const ms=msOf(sig.time);
  const p=isNum(ms)?shParts(ms):{hour:'--',minute:'--'};
  const buy=sideOf(sig)==='buy';
  const style=styleOf(sig);
  const sym=buy?style.symBuy:style.symSell;
  // V8 悬停一行可读：时间 + 方向符号 + 买卖 + 价格 + 指标代码 + 强度（null 写 -- 不写 0） + 原因/备注；方向由符号+文字+颜色三重编码
  const strength=`｜强度${strengthText(sig)}`;
  const note=sig.note?`｜${sig.note}`:'';
  const myNote=noteOf(sig);
  const reason=sig.reason?`｜原因 ${sig.reason}`:'';
  const stratWord=strategyOf(sig); const strat=(stratWord&&!style.code.includes(stratWord==='aggressive'?'激进':'保守'))?`｜${stratWord==='aggressive'?'激进':'保守'}`:'';
  return `${p.hour}:${p.minute} ${sym}${buy?'买':'卖'} ${sig.price}｜${style.code}·${sig.chart==='intraday'?'分时':(sig.period||'')} ${strength}${strat}${note}${reason}${myNote?`｜备注 ${myNote}`:''}`.slice(0,240);
}
/* 直接标签（批量二定稿）：分时 T · 价 14.88 +300，+为买、-为卖、数字为数量；
 * 信号里没有数量字段时只写价，不编造数量。时间由横轴位置给出，标签里不写时间。 */
function labelOf(sig,groupedCount){
  const buy=sideOf(sig)==='buy';
  const style=styleOf(sig);
  const kind=style.code;
  const q=num(sig.qty??sig.quantity??sig.shares??sig.amount);
  const qty=isNum(q)?(buy?` +${q}`:` -${q}`):'';
  // V8：标签代码 + 价 + 数量/方向符号；密集分组时后缀 ×N，宿主价位线文案即 sourceLabel+价+数量/箭头，代码本身已区分指标
  const grp=(groupedCount&&groupedCount>1)?` ×${groupedCount}`:'';
  return `${kind} · 价 ${sig.price}${qty} ${buy?'▲':'▼'}${grp}`;
}
/* 信号 → 合同 marker 对象：老字段按 V44 合同原样发（老宿主能跑）；
 * label / dashedLine / labelColor 为批量二新宿主用字段，老宿主忽略多余字段。 */
function toMarker(sig,anchorMs,groupedCount){
  const buy=sideOf(sig)==='buy';
  const known=Object.prototype.hasOwnProperty.call(TYPE_REGISTRY,sig.type);
  const style=styleOf(sig);
  const color=known?(buy?style.buy:style.sell):UNKNOWN_COLOR;
  const q=num(sig.qty??sig.quantity??sig.shares??sig.amount);
  // V17：分时实时线一律小圆点，不压价位线。largeShape/largeGlyph 只作提醒/备注数据（hook/列表/上一条行），不发给图上标记；
  // K线图（历史/30分/日K）仍用原大形状，属历史标注，不属分时实时线。
  const isIntraday=String(sig.chart||'')==='intraday';
  const largeShape=known?(buy?style.shapeBuy:style.shapeSell):'circle';
  const stv=num(sig.strength);
  const intraSize=(isNum(stv)&&stv>=70)?7:6;
  return {
    time:anchorMs,
    value:num(sig.price),
    shape:isIntraday?'circle':largeShape,
    color,
    size:isIntraday?intraSize:sizeForStyle(style,sig),
    width:1, opacity:isIntraday?0.9:1, outline:true,
    largeShape, largeGlyph:style.glyph||'', largeSym:buy?style.symBuy:style.symSell,
    // V8：组合标记用 text 字段在宿主图上画“组”，密集分组用 text 画“×N”；普通标记不设 text，避免与宿主价位线双标签拥挤
    text:(style.text&&!groupedCount)?style.text:(groupedCount&&groupedCount>1)?`×${groupedCount}`:'',
    fontSize:11,
    eventKey:String(sig.id||''),
    tooltip:tooltipOf(sig),
    interactive:true,
    hoverOnly:true,
    label:state.settings.directLabelEnabled?labelOf(sig,groupedCount):'',
    note:noteOf(sig), noteLabel:noteOf(sig)?`备注：${noteOf(sig)}`:'', noteStyle:noteStyleOf(sig),
    direction:buy?'buy':'sell', side:buy?'buy':'sell',
    strategy:strategyOf(sig), period:String(sig.period||''), chart:String(sig.chart||''),
    styleCode:style.code, styleKey:(sig?.type==='t_trade'&&strategyOf(sig))?`${sig.type}_${strategyOf(sig)}`:String(sig?.type||'default'),
    sourceLabel:style.code,
    quantity:isNum(q)&&q>0?Math.floor(q):0,
    dashedLine:{price:num(sig.price),color}, // V15 固定开启：虚线开关已取消，恒画虚线
    labelColor:color,
    glyph:isIntraday?'':(style.glyph||''), glyphColor:'#ffffff', glyphSize:Math.min(14, sizeForStyle(style,sig)+2)
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
/* V14 历史日期清单：只复用已拉取的 index，不逐日拉取、不算每日期计数。
 * “空”只认会话内已拉取过的缓存信封：当前股 confirmed 信号数为 0 才算空；
 * 未拉取过的日期不谎称有/无信号，只原样列出。行 ≤80 字：日期多时只取当前日前后窗口。 */
function historyDateInfo(){
  const dates=[...state.dates];
  const cur=targetDate();
  const short=d=>String(d).slice(5); // MM-DD
  const countForSymbol=(env)=>{
    if(!env||!Array.isArray(env.signals))return null;
    let n=0;
    for(const sig of env.signals){
      if(!sig||typeof sig!=='object')continue;
      if(sig.status&&sig.status!=='confirmed')continue;
      if(state.symbol&&String(sig.code||'').trim()!==state.symbol)continue;
      n++;
    }
    return n;
  };
  const knownEmpty=[], knownNonEmpty=[], unknown=[];
  for(const d of dates){
    const env=state.dateCache[d];
    if(!env){ unknown.push(d); continue; }
    const n=countForSymbol(env);
    if(n===0)knownEmpty.push(d); else knownNonEmpty.push(d);
  }
  // 窗口：当前日居中，最多 9 个日期（9×8 字 ≈ 72 字，留给前缀与“空，已跳过”）
  let windowDates=dates;
  if(dates.length>9){
    const ci=dates.indexOf(cur);
    const start=ci<0?Math.max(0,dates.length-9):Math.max(0,Math.min(ci-4,dates.length-9));
    windowDates=dates.slice(start,start+9);
  }
  const shown=windowDates.map(d=>d===cur?`▸${short(d)}`:short(d)).join(' · ');
  const emptyShown=knownEmpty.filter(d=>windowDates.includes(d)).map(short).join('、');
  const emptyOutside=knownEmpty.filter(d=>!windowDates.includes(d)).length;
  let line=`历史日期：${shown}`;
  if(knownEmpty.length)line+=`（${emptyShown||'窗口外'}空，已跳过${emptyOutside?`，窗口外另${emptyOutside}空日`:''}）`;
  if(dates.length>windowDates.length)line+=` …共${dates.length}日`;
  return {dates, current:cur, knownEmpty, knownNonEmpty, unknown, windowDates, line:line.slice(0,80)};
}
function isKnownEmptyDate(d){
  const env=state.dateCache[d];
  if(!env||!Array.isArray(env.signals))return false;
  for(const sig of env.signals){
    if(!sig||typeof sig!=='object')continue;
    if(sig.status&&sig.status!=='confirmed')continue;
    if(state.symbol&&String(sig.code||'').trim()!==state.symbol)continue;
    return false;
  }
  return true;
}
/*
 * 拉取一轮：先 index（尽力而为，失败不阻断当日文件），再当日文件。
 * 失败语义（DESIGN）：已有旧数据 → 保留旧标记 + stale 标过期；
 * 从未成功过 → 无标记、无报错，状态卡写明失败原因。
 */
async function fetchCounted(url){ state.fetchCount++; return fetchJson(url); }
/* V10 网络图标包：与信号源同目录的 icons.json，格式 {version, icons:[{key|type, code, shapeBuy, shapeSell, symBuy, symSell, buy, sell, base, text}]}。
 * 只做插件自己的标记图标；拉不到、格式错、超时 3 秒一律回落内置，错误只记 iconPack.error，绝不写进信号 lastError、不阻塞当日信号。 */
async function loadIconPackIfStale(base){ /* V13 自我否定：网络图标包已砍——内置图标库 + registerIcon 已覆盖新图标，真实信号目录本无 icons.json，包只带来额外拉取与超时面；不再拉取，永不阻塞信号 */ return false; }
async function refresh(reason){
  if(state.disposed||state.inflight)return;
  const base=baseUrl();
  if(!base){ state.lastError='未设置信号源'; renderAll(); return; }
  state.inflight=true;
  try{
    // V7：index 300 秒内不重拉；历史日期信封会话内复用（历史数据不变，今天+交易日除外）
    const now=Date.now();
    if(now-state.indexCacheAt>300000){
      try{ const idx=await fetchCounted(`${base}/index.json`); const ds=validIndex(idx); if(ds.length){ state.dates=ds; state.indexCacheAt=now; } }catch(_){ /* 索引失败不阻断 */ }
    } else state.cacheHits++;
    const date=targetDate();
    const cached=state.dateCache[date];
    if(cached&&!(date===todayStr()&&isTradingNow())){
      state.cacheHits++;
      state.envelope=cached; state.envelopeDate=date;
      state.generatedAt=cached.generated_at; state.stale=false; state.lastError=''; state.failCount=0;
      state.focusIndex=-1;
      return;
    }
    const env=validEnvelope(await fetchCounted(`${base}/${date}.json`),date);
    if(!env)throw new Error('信号文件格式不合规');
    state.envelope=env; state.envelopeDate=date; state.dateCache[date]=env;
    state.generatedAt=env.generated_at; state.fetchedAt=Date.now();
    state.stale=false; state.lastError=''; state.failCount=0; state.focusIndex=-1;
  }catch(e){
    state.lastError=String(e?.message||e||'拉取失败');
    state.failCount=(state.failCount||0)+1;
    if(state.envelope)state.stale=true;
  }finally{
    state.inflight=false;
    renderAll();
  }
}
function errorKind(){
  const e=String(state.lastError||'');
  if(!e)return 'none';
  if(/格式不合规|JSON|Unexpected|not valid JSON/.test(e))return 'format';
  if(/404|地址|未设置|403/.test(e))return 'address';
  return 'network';
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
function seenKey(symbol,date){ return `${symbol||state.symbol}|${date||state.envelopeDate||targetDate()}`; }
function sigKey(sig){ return String(sig?.id||`${sig?.code||''}|${sig?.time||''}|${sig?.type||''}|${sig?.side||''}`); }
function syncView(){
  try{
    const v=state.ctx?.core?.getContext?.()||{};
    const sym=String(v.symbol||'');
    const per=String(v.period||'');
    const changed=(sym&&sym!==state.symbol)||(per&&per!==state.period);
    // V8：换股不再把全局 seenCount 清零；已看按股+日期记，回到旧股旧日期不复活
    if(sym)state.symbol=sym;
    if(per)state.period=per;
    return changed;
  }catch(_){ return false; }
}

/* ---------------- 过滤与锚定 ---------------- */
/* V10 内部调用效率：渲染缓存键 = 日期+数据时间+股+周期+全部筛选开关+已看数；键不变时可见/过滤/标记直接复用，不重复算、不往返宿主 */
function renderKey(){
  const s=state.settings;
  const iconKey=Object.entries(ICON_OVERRIDES).map(([k,v])=>`${k}:${v.code}:${v.buy}:${v.sell}:${v.base}:${v.glyph||''}`).join(';');
  return [state.envelopeDate,state.generatedAt,state.symbol,state.period,s.overlayEnabled,s.intradayEnabled,s.klineEnabled,s.directLabelEnabled,s.dashedLineEnabled,s.minStrength,s.directionFilter,s.typeFilter,s.strategyFilter,s.denseGroupEnabled,s.unreadOnly,(state.settings.seenIds[seenKey()]||[]).length,iconKey].join('|');
}
/* 只收 confirmed；按 id 去重；只显示当前股票（code 与宿主 symbol 归一比较） */
function visibleSignals(){
  const k=renderKey();
  if(state.renderCache.key===k&&state.renderCache.visible)return state.renderCache.visible;
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
  state.renderCache.key=renderKey(); state.renderCache.visible=out; state.renderCache.filtered=null; state.renderCache.markersIntra=null; state.renderCache.markersKline=null;
  return out;
}
/* 批量二筛选（与图标窗同套）：强度+方向，筛掉数在状态卡实时显示 */
function filteredSignals(){
  const k=renderKey();
  if(state.renderCache.key===k&&state.renderCache.filtered)return state.renderCache.filtered;
  const s=state.settings;
  const seenSet=s.unreadOnly?new Set(state.settings.seenIds[seenKey()]||[]):null;
  const out=visibleSignals().filter(sig=>{
    if(seenSet&&seenSet.has(sigKey(sig)))return false;
    if(s.directionFilter!=='all'&&sideOf(sig)!==s.directionFilter)return false;
    if(s.typeFilter!=='all'){
      if(s.typeFilter==='kline_signal'&&!String(sig.type||'').startsWith('kline'))return false;
      if(s.typeFilter!=='kline_signal'&&String(sig.type||'')!==s.typeFilter)return false;
    }
    const st=(sig.strength===null||sig.strength===undefined)?null:num(sig.strength);
    if(s.minStrength>0&&(st===null||!isNum(st)||st<s.minStrength))return false;
    if(s.strategyFilter!=='all'&&strategyOf(sig)!==s.strategyFilter)return false;
    return true;
  });
  state.filterComputes++; state.renderCache.key=renderKey(); state.renderCache.filtered=out;
  return out;
}
/* V7 跨周期联想：同股同日、不分图区的全部信号，按图区/周期计数 + 对照信号（不改图上标记，只给状态卡与接口） */
function crossPeriod(){
  const env=state.envelope;
  if(!env)return {counts:{}, linked:[]};
  const all=[];
  const seen=new Set();
  for(const sig of env.signals){
    if(!sig||typeof sig!=='object')continue;
    if(sig.status&&sig.status!=='confirmed')continue;
    const key=String(sig.id||`${sig.code}|${sig.time}|${sig.type}|${sig.side}`);
    if(seen.has(key))continue; seen.add(key);
    if(state.symbol&&String(sig.code||'').trim()!==state.symbol)continue;
    all.push(sig);
  }
  const counts={};
  for(const sig of all){ const k=`${sig.chart||'?'}/${sig.period||'?'}`; counts[k]=(counts[k]||0)+1; }
  const linked=all.slice().sort((a,b)=>msOf(b.time)-msOf(a.time)).slice(0,8).map(sig=>({
    id:String(sig.id||''), time:sig.time||'', price:num(sig.price), side:sideOf(sig),
    chart:String(sig.chart||''), period:String(sig.period||''), type:String(sig.type||''),
    source:sig.source||'', strength:(sig.strength===null||sig.strength===undefined)?null:num(sig.strength), strategy:strategyOf(sig)
  }));
  return {counts, linked};
}
function focusedSignal(){
  const rows=filteredSignals().slice().sort((a,b)=>msOf(b.time)-msOf(a.time));
  if(state.focusIndex<0||state.focusIndex>=rows.length)return null;
  return rows[state.focusIndex];
}
function focusInfo(){
  const sig=focusedSignal();
  if(!sig)return null;
  return {id:String(sig.id||''), time:sig.time||'', price:num(sig.price), side:sideOf(sig),
    chart:String(sig.chart||''), period:String(sig.period||''), type:String(sig.type||''),
    anchorMs:anchorFor(sig, sig.chart==='intraday'?CTX_INTRA:CTX_KLINE), label:labelOf(sig)};
}
function unreadCount(){
  const seen=new Set(state.settings.seenIds[seenKey()]||[]);
  if(!seen.size&&!Object.keys(state.settings.seenIds||{}).length){
    // 旧版升级：seenIds 为空时沿用 seenCount 兼容一次，避免升级当天角标全复活为总数
    return Math.max(0,visibleSignals().length-state.settings.seenCount);
  }
  return visibleSignals().filter(sig=>!seen.has(sigKey(sig))).length;
}
function markAllSeen(){
  const key=seenKey();
  const ids=visibleSignals().map(sigKey);
  state.settings.seenIds[key]=[...new Set(ids)].slice(0,200);
  state.settings.seenCount=ids.length;
  // 只保留最近 20 个股+日期键，防止 workspace 膨胀
  const keys=Object.keys(state.settings.seenIds);
  if(keys.length>20){ for(const k of keys.slice(0,keys.length-20)) delete state.settings.seenIds[k]; }
  saveSettings(); renderAll(); return true;
}
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
  const ck=renderKey()+'|'+context;
  if(state.renderCache.key===renderKey()&&((context===CTX_INTRA&&state.renderCache.markersIntra)||(context===CTX_KLINE&&state.renderCache.markersKline)))return context===CTX_INTRA?state.renderCache.markersIntra:state.renderCache.markersKline;
  if(!s.overlayEnabled)return [];
  if(context===CTX_INTRA&&!s.intradayEnabled)return [];
  if(context===CTX_KLINE&&!s.klineEnabled)return [];
  const wantChart=context===CTX_INTRA?'intraday':'kline';
  const byKey=new Map();
  for(const sig of filteredSignals()){
    if(String(sig.chart||'')!==wantChart)continue;
    if(context===CTX_KLINE&&!klinePeriodMatches(sig))continue;
    const t=anchorFor(sig,context);
    if(!isNum(t))continue;
    const m=toMarker(sig,t);
    if(!isNum(m.value))continue;
    const key=`${t}|${m.value}|${sideOf(sig)}`;
    const prev=byKey.get(key);
    if(prev){
      const src=sig.source||'';
      if(src&&!String(prev.tooltip).includes(src))prev.tooltip=(String(prev.tooltip)+`｜另有 ${src}`).slice(0,240);
      prev.mergedCount=(prev.mergedCount||1)+1;
      prev.mergedSources=[...(prev.mergedSources||[]), src].filter(Boolean);
    } else { m.mergedCount=1; m.mergedSources=[sig.source||''].filter(Boolean); byKey.set(key,m); }
  }
  let list=[...byKey.values()];
  // V8 密集分组（修 R1 键错 bug）：按时间排序后顺序成组，同图、同向、同价、与组首差 ≤5 分钟才合组；列表与计数仍保留全部信号，不漏
  if(s.denseGroupEnabled){
    list.sort((a,b)=>a.time-b.time);
    const groups=[];
    for(const m of list){
      const last=groups[groups.length-1];
      if(last&&last.first.value===m.value&&last.first.shape===m.shape&&last.first.direction===m.direction&&Math.abs(m.time-last.firstTime)<=300000){
        last.items.push(m);
      } else {
        groups.push({first:m, firstTime:m.time, items:[m]});
      }
    }
    const out=[];
    for(const g of groups){
      if(g.items.length<=1){ out.push(g.first); continue; }
      const first=g.first;
      const times=g.items.map(x=>{ const pp=shParts(x.time); return `${pp.hour}:${pp.minute}`; }).join('、');
      const rep={...first, label:`${first.label||''} ×${g.items.length}`};
      rep.text=`×${g.items.length}`;
      rep.groupedCount=g.items.length;
      rep.mergedCount=g.items.reduce((a,x)=>a+(x.mergedCount||1),0);
      rep.tooltip=(String(first.tooltip)+`｜共 ${g.items.length} 条（${times}）`).slice(0,240);
      out.push(rep);
    }
    list=out;
  }
  list.sort((a,b)=>a.time-b.time);
  const final=list.slice(0,MAX_MARKERS);
  state.markerComputes++; state.renderCache.key=renderKey();
  if(context===CTX_INTRA)state.renderCache.markersIntra=final; else state.renderCache.markersKline=final;
  return final;
}
function markerCounts(){
  const mi=markersFor(CTX_INTRA), mk=markersFor(CTX_KLINE);
  const intra=mi.length, kline=mk.length;
  const rawIntra=filteredSignals().filter(x=>x.chart==='intraday').length;
  const rawKline=filteredSignals().filter(x=>x.chart==='kline'&&klinePeriodMatches(x)).length;
  const grouped=[...mi,...mk].filter(m=>m.groupedCount&&m.groupedCount>1).length;
  return {intra, kline, merged:(rawIntra-intra)+(rawKline-kline), grouped};
}
function filterBreakdown(){
  const all=visibleSignals();
  let cur=all;
  const step=(fn)=>{ const before=cur.length; cur=cur.filter(fn); return before-cur.length; };
  const s=state.settings;
  const byStrength=step(sig=>{ const st=(sig.strength===null||sig.strength===undefined)?null:num(sig.strength); return !(s.minStrength>0&&(st===null||!isNum(st)||st<s.minStrength)); });
  const byDirection=step(sig=>!(s.directionFilter!=='all'&&sideOf(sig)!==s.directionFilter));
  const byType=step(sig=>{ if(s.typeFilter==='all')return true; if(s.typeFilter==='kline_signal')return String(sig.type||'').startsWith('kline'); return String(sig.type||'')===s.typeFilter; });
  const byStrategy=step(sig=>!(s.strategyFilter!=='all'&&strategyOf(sig)!==s.strategyFilter));
  const byUnread=step(sig=>{ if(!s.unreadOnly)return true; const seen=new Set(state.settings.seenIds[seenKey()]||[]); return !seen.has(sigKey(sig)); });
  return {total:all.length, remaining:cur.length, filteredOut:all.length-cur.length, byStrength, byDirection, byType, byStrategy, byUnread};
}
function watchlistSummary(){
  const env=state.envelope;
  if(!env)return [];
  const map=new Map();
  for(const sig of env.signals){
    if(!sig||typeof sig!=='object'||(sig.status&&sig.status!=='confirmed'))continue;
    const code=String(sig.code||'').trim(); if(!code)continue;
    let e=map.get(code); if(!e){ e={code,total:0,buy:0,sell:0,unread:0,latest:null}; map.set(code,e); }
    e.total++; if(sideOf(sig)==='buy')e.buy++; else e.sell++;
    const seen=new Set(state.settings.seenIds[`${code}|${state.envelopeDate||targetDate()}`]||[]);
    if(!seen.has(sigKey(sig)))e.unread++;
    const ms=msOf(sig.time);
    if(isNum(ms)&&(!e.latest||ms>msOf(e.latest.time)))e.latest={time:sig.time,price:num(sig.price),side:sideOf(sig)};
  }
  return [...map.values()].sort((a,b)=>a.code.localeCompare(b.code));
}
function statusKind(){
  if(!state.envelope){
    if(state.lastError)return errorKind()==='network'?'error-network':errorKind()==='address'?'error-address':'error-format';
    return 'loading';
  }
  if(state.lastError)return errorKind()==='network'?'error-network':errorKind()==='address'?'error-address':'error-format';
  if(!visibleSignals().length)return 'empty';
  return 'ok';
}
function statusText(){
  const date=state.envelopeDate||targetDate();
  const k=statusKind();
  if(k==='loading')return `加载中：${date} 信号正在拉取，稍等再看`;
  if(k==='empty')return `今日无信号：${date} 该日期文件为空，不是断源`;
  if(k==='error-network')return `信号源断了（网络不通）：${state.lastError}，旧信号保留，可点刷新重试`;
  if(k==='error-address')return `信号源断了（地址错）：${state.lastError}，可在插件设置里改地址或恢复默认源`;
  if(k==='error-format')return `信号源断了（格式不对）：${state.lastError}，旧信号保留`;
  return `正常：${date} 信号已更新`;
}
function summaryLine(){
  const all=visibleSignals(), rows=filteredSignals();
  const buy=all.filter(x=>sideOf(x)==='buy').length, sell=all.length-buy;
  const sorted=[...all].sort((a,b)=>msOf(b.time)-msOf(a.time));
  const latest=sorted[0];
  const withStrength=all.filter(x=>x.strength!==null&&x.strength!==undefined&&isNum(num(x.strength)));
  const strongest=withStrength.sort((a,b)=>num(b.strength)-num(a.strength))[0];
  const viewMode=state.settings.viewDate?'history':'follow';
  const latestText=latest?`${String(latest.time||'').slice(11,16)} ${sideOf(latest)==='buy'?'▲买':'▼卖'} ${latest.price} ${styleOf(latest).code}`:'无';
  const strongestText=strongest?`强度${strongest.strength} ${sideOf(strongest)==='buy'?'▲买':'▼卖'} ${strongest.price}`:'--';
  return {symbol:state.symbol, date:state.envelopeDate||targetDate(), viewMode, total:all.length, buy, sell, unread:unreadCount(), filtered:rows.length, latest:latestText, strongest:strongestText,
    text:`${state.symbol||'--'} · ${state.envelopeDate||targetDate()}${viewMode==='history'?'（查看历史）':'（跟随最新）'} · 共${all.length}条 买${buy} 卖${sell} · 未看${unreadCount()}条 · 最新 ${latestText} · 最强 ${strongestText}`};
}

function previousSignalInfo(){
  // V17 上一条信号提醒：不压在分时实时价位上，大形状只出现在这里（提醒/备注用途）。
  // 取过滤后倒序第 2 条；只有 1 条或无信号时返回 null，状态卡不写空行。
  const rows=filteredSignals().slice().sort((a,b)=>msOf(b.time)-msOf(a.time));
  if(rows.length<2)return null;
  const sig=rows[1], style=styleOf(sig), buy=sideOf(sig)==='buy';
  const info={id:String(sig.id||''), time:sig.time||'', price:num(sig.price), side:sideOf(sig), code:style.code,
    chart:String(sig.chart||''), period:String(sig.period||''), type:String(sig.type||''),
    largeShape:buy?style.shapeBuy:style.shapeSell, glyph:style.glyph||'', sym:buy?style.symBuy:style.symSell,
    note:noteOf(sig)};
  const sideArrow=buy?'▲':'▼';
  const extraSym=(info.sym&&info.sym!==sideArrow)?` ${info.sym}`:'';
  info.line=`上一条提醒：${String(sig.time||'').slice(11,16)} ${buy?'▲买':'▼卖'} ${sig.price} ${style.code}${extraSym}${style.glyph?`（${style.glyph}）`:''}`.slice(0,80);
  return info;
}
function reminderSignals(){
  // V17 大形状提醒清单：只列带 glyph 的大形状信号（分时突破/日K/K线组合），图上分时线不画大形状，
  // 这些信号的提醒形态只出现在这里、列表符号与上一条行里，不压价位。
  return filteredSignals().slice().sort((a,b)=>msOf(b.time)-msOf(a.time)).filter(sig=>{
    const style=styleOf(sig); return !!style.glyph;
  }).slice(0,10).map(sig=>{ const style=styleOf(sig), buy=sideOf(sig)==='buy';
    return {id:String(sig.id||''), time:sig.time||'', price:num(sig.price), side:sideOf(sig), code:style.code,
      chart:String(sig.chart||''), period:String(sig.period||''), type:String(sig.type||''),
      largeShape:buy?style.shapeBuy:style.shapeSell, glyph:style.glyph||'', sym:buy?style.symBuy:style.symSell}; });
}
function periodOverview(){
  // V16 三周期总览：用当日已确认信号（当前股，不经筛选，这样总览不随筛选变脸）按周期分组；
  // 分时=intraday，30分=period 30m，日K=period day；每组给总数/买/卖/最新一条，行 ≤80 字。
  const all=visibleSignals();
  const groups={intraday:{total:0,buy:0,sell:0,latest:null},kline30:{total:0,buy:0,sell:0,latest:null},day:{total:0,buy:0,sell:0,latest:null}};
  for(const sig of all){
    const g=sig.chart==='intraday'?groups.intraday:(String(sig.period||'')==='30m'?groups.kline30:(String(sig.period||'')==='day'?groups.day:null));
    if(!g)continue;
    g.total++; if(sideOf(sig)==='buy')g.buy++; else g.sell++;
    const ms=msOf(sig.time);
    if(isNum(ms)&&(!g.latest||ms>msOf(g.latest.time)))g.latest=sig;
  }
  const fmt=(g,label)=>{ if(!g.total)return `${label} 0条`; const l=g.latest; return `${label} ${g.total}条（买${g.buy}卖${g.sell}·最新${sideOf(l)==='buy'?'▲买':'▼卖'} ${l.price}）`; };
  const line=`三周期：${fmt(groups.intraday,'分时')} ｜ ${fmt(groups.kline30,'30分')} ｜ ${fmt(groups.day,'日K')}`;
  return {intraday:groups.intraday,kline30:groups.kline30,day:groups.day,line:line.slice(0,80)};
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
  // V8 状态卡排版（插件能控的文案与分组）：概览一行 → 状态一行 → 分隔 → 筛选/自选/联想 → 分隔 → 列表（≤15 条）→ 尾部提示；每行 ≤80 字，方向用 ▲买/▼卖 + 文字，不只靠颜色
  const sum=summaryLine();
  // V15 版本号显示：首行即写版本，不单独成行、不占额外行数；hook 里原有 version 字段不变。
  // V18：宿主把状态卡渲染成单行横条（nowrap），后段在 276px 分析面板里横向溢出看不到，故首段必须是“一屏能看完”的版本+折叠摘要；完整概览（买卖/日期/跟随）仍在第二段，数据不丢，只是首段不再靠后段。
  segs.push({text:`📊 潮汐 ${VER} · ${sum.symbol||'--'} · 共${sum.total}条 · 开关${state.switchesExpanded?'已展开':'已折叠'}`});
  segs.push({text:`${sum.symbol||'--'} · ${sum.date}${sum.viewMode==='history'?'（查看历史）':'（跟随最新）'} · 买${sum.buy} 卖${sum.sell} · 未看${sum.unread}条`});
  segs.push({text:`最新 ${sum.latest} · 最强 ${sum.strongest}`});
  const prev=previousSignalInfo();
  if(prev)segs.push({text:prev.line});
  segs.push({text:periodOverview().line});
  // V16 自我否定：状态 ok 且无筛选时，状态行与筛选行都是“一切正常”的重复话，并入总览，不再单独成行；
  // 有异常（断源/空/过期）或有筛选时仍单独成行，因为那时是需要行动的信息。
  const fb0=filterBreakdown();
  const showStatusRow=statusKind()!=='ok'||state.stale||fb0.filteredOut>0;
  if(showStatusRow)segs.push({text:`${statusText()}${state.generatedAt?` · 数据 ${shTimeStr(Date.parse(state.generatedAt))}`:''}${state.stale?' · 已过期':''}`});
  const urlShort=(()=>{ const u=baseUrl(); return u.length>32?u.slice(0,32)+'…':u; })();
  segs.push({text:`信号源：${s.sourceCustom?'自定义':'默认公开'} · ${urlShort}${state.failCount>0?` · 连续失败 ${state.failCount} 次`:''}`});
  const all=visibleSignals(), rows=filteredSignals().slice().sort((a,b)=>msOf(b.time)-msOf(a.time));
  const mc=markerCounts();
  const fb=filterBreakdown();
  // V11 筛选：筛掉为 0 时拆解全是 0、零信息，压短（原行 83 字超 80 字上限）；筛掉 >0 时保留拆解（此时细节有用）
  if(fb.filteredOut===0){ /* V16：无筛选时图上计数已在三周期总览与概览里，不再重复成行 */ }
  else { const parts=[]; if(fb.byStrength)parts.push(`强度 ${fb.byStrength}`); if(fb.byDirection)parts.push(`方向 ${fb.byDirection}`); if(fb.byType)parts.push(`类型 ${fb.byType}`); if(fb.byStrategy)parts.push(`策略 ${fb.byStrategy}`); if(s.unreadOnly&&fb.byUnread)parts.push(`未看 ${fb.byUnread}`); segs.push({text:`筛选：剩余 ${fb.remaining} 条 · 筛掉 ${fb.filteredOut} 条（${parts.join(' · ')||'—'}） · 图上 分时 ${mc.intra} + K线 ${mc.kline}${mc.merged?`（合并 ${mc.merged} 条，含密集分组 ${mc.grouped} 组）`:''}`}); }
  const wl=watchlistSummary();
  // V15 折叠：自选（次要段，默认折叠）——折叠时只露 1 行摘要，不丢任何股的计数，展开才列明细。
  if(wl.length){
    if(state.collapsed.watchlist)segs.push({text:`▸ 自选信号（已折叠，共 ${wl.length} 股）`});
    else segs.push({text:`自选信号：${wl.map(w=>`${w.code} ${w.total}条（买${w.buy}卖${w.sell}·未看${w.unread}）`).join(' / ')}`});
  }
  segs.push({text:`─ ─ ─`});
  const cp=crossPeriod();
  // V15 折叠：联想+历史（次要段，默认折叠）——折叠时合为 1 行摘要，省 1 行；联想计数与历史日期数据仍在 hook 里，展开才列。
  if(state.collapsed.cross){
    if(state.envelope&&all.length)segs.push({text:`▸ 联想+历史日期（已折叠）`});
  } else {
    if(state.envelope&&all.length){
      const cpText=Object.entries(cp.counts).map(([k,v])=>`${k} ${v}条`).join(' / ');
      segs.push({text:`联想（同股同日）：${cpText}`});
      // V13 自我否定：联想明细行与信号列表重复（同股同日信号列表里已有），只留计数行，省 3 行
    }
    // V14：历史日期清单 1 行（复用 index，不逐日拉取、不算计数）；无 index 时不写空行
    if(state.dates.length)segs.push({text:historyDateInfo().line});
  }
  const foc=focusInfo();
  // V15 折叠：信号列表（关键段，默认展开）——折叠时只露 1 行摘要（共 N 条、未看 M 条），标记、角标、筛选计数全不受影响；已定位行随列表段折叠，focusIndex 本身保留。
  if(state.collapsed.list){
    segs.push({text:`▸ 信号列表（已折叠，共 ${rows.length} 条，未看 ${unreadCount()} 条）`});
    if(statusKind().startsWith('error'))segs.push({text:'提示：点“潮汐信号 刷新”重试，或点“恢复默认信号源”回默认公开地址'});
    return segs;
  }
  if(foc)segs.push({text:`已定位：${String(foc.time||'').slice(11,16)} ${foc.side==='buy'?'▲买':'▼卖'} ${foc.price} ${foc.chart}/${foc.period} ${foc.label}（图上滚动需宿主消费 focus 字段）`});
  segs.push({text:`─ 信号列表（倒序） ─`});
  const seenRow=new Set(state.settings.seenIds[seenKey()]||[]);
  for(let li=0; li<rows.slice(0,15).length; li++){
    const sig=rows.slice(0,15)[li];
    const ms=msOf(sig.time);
    const pp=isNum(ms)?shParts(ms):{hour:'--',minute:'--'};
    const style=styleOf(sig);
    const note=noteOf(sig) ? ` 备注：${noteOf(sig)}` : '';
    const strat=strategyOf(sig)?` ${strategyOf(sig)==='aggressive'?'激进':'保守'}`:'';
    const seenMark=seenRow.has(sigKey(sig))?'○':'●';
    // V11 胜者：强度条（正强度才有条，0/null 无条）+ 最新一条 ★；行仍 ≤80 字
    const stv=num(sig.strength);
    const bar=(isNum(stv)&&stv>0)?' '+('▓'.repeat(stv>=70?4:stv>=50?3:stv>=30?2:1)):'';
    const star=li===0?'★':'';
    segs.push({text:`${seenMark} ${star}${pp.hour}:${pp.minute} ${sideOf(sig)==='buy'?'▲买':'▼卖'} ${sig.price} ${style.code} 强度${strengthText(sig)}${bar}${strat}${note}`.slice(0,80)});
  }
  if(state.envelope&&rows.length===0)segs.push({text:'当日无信号（筛选后）：放宽筛选或换日期再看'});
  else if(rows.length>15)segs.push({text:`共 ${rows.length} 条，倒序显示前 15 条，导出可看全部`});
  if(statusKind().startsWith('error'))segs.push({text:'提示：点“潮汐信号 刷新”重试，或点“恢复默认信号源”回默认公开地址'});
  return segs;
}
function exportCsv(){
  const rows=filteredSignals().slice().sort((a,b)=>msOf(a.time)-msOf(b.time));
  return ['时间,方向,价格,来源,强度,类型,策略,图区,周期,原因,备注'].concat(rows.map(sig=>`${sig.time},${sideOf(sig)==='buy'?'买':'卖'},${sig.price},${sig.source||''},${sig.strength||''},${sig.type||''},${strategyOf(sig)},${sig.chart||''},${sig.period||''},${(sig.reason||sig.note||'').replace(/,/g,'；')},${noteOf(sig).replace(/,/g,'；')}`)).join('\n');
}
function renderStatus(){
  const card=state.uiHandles.status;
  if(card){ try{ card.update?.({segments:statusSegments()}); }catch(_){ /* 状态卡更新失败不影响标记 */ } }
}
function renderAll(){ renderMarkers(); renderStatus(); refreshToggleLabels(); updateSelfPanel(); emitTidal(); }

/* ---------------- 宿主图标用状态接口（V5 匹配，插件不画图标） ----------------
 * 宿主图标只读这个接口，不直接写插件 workspace、不自己算信号数。
 * 接口不存在时宿主不编数字、不崩；接口在时角标 = badge（今天当前股可见信号数 - 已看数）。 */
const tidalListeners=new Set();
function tidalIconPosFrac(){
  const parts=String(state.settings.iconPos||'').split(',').map(Number);
  if(parts.length!==2||!parts.every(n=>Number.isFinite(n)))return null;
  return {xPct:parts[0]/100, yPct:parts[1]/100, x:parts[0]/100, y:parts[1]/100};
}
function tidalState(){
  const s=state.settings;
  const all=visibleSignals(), rows=filteredSignals();
  const date=state.envelopeDate||targetDate();
  const switches={overlayEnabled:true,intradayEnabled:s.intradayEnabled,klineEnabled:s.klineEnabled,directLabelEnabled:s.directLabelEnabled,dashedLineEnabled:true}; // V15：已取消的两个开关恒 true 兼容宿主
  const settings={...switches,
    minStrength:s.minStrength, strengthThreshold:s.minStrength,
    direction:s.directionFilter, directionFilter:s.directionFilter,
    signalType:s.typeFilter, signalTypeFilter:s.typeFilter,
    strategy:s.strategyFilter, strategyFilter:s.strategyFilter,
    sourceUrl:baseUrl(), signalSourceUrl:baseUrl(), sourceBaseUrl:baseUrl(),
    sourceCustom:s.sourceCustom, sourceIsDefault:!s.sourceCustom,
    denseGroupEnabled:s.denseGroupEnabled, denseGroup:s.denseGroupEnabled,
    unreadOnly:s.unreadOnly,
    signalDate:date, iconPos:s.iconPos};
  const pos=tidalIconPosFrac();
  return {
    id:ID, version:VER, symbol:state.symbol, period:state.period,
    date, signalDate:date,
    sourceBaseUrl:baseUrl(), sourceUrl:baseUrl(), signalSourceUrl:baseUrl(),
    badge:unreadCount(), badgeCount:unreadCount(), unreadCount:unreadCount(),
    total:all.length, activeSignalCount:all.length, todayActiveCount:all.length,
    filtered:rows.length, remainingCount:rows.length, filteredCount:all.length-rows.length,
    counts:{remaining:rows.length, filtered:all.length-rows.length},
    settings, switches, filters:{minStrength:s.minStrength,directionFilter:s.directionFilter,typeFilter:s.typeFilter},
    signalTypes:[{value:'t_signal',label:'分时信号'},{value:'t_trade',label:'分时成交'},{value:'t_breakout',label:'分时突破'},{value:'kline_signal',label:'K线信号'},{value:'kline_single',label:'日K'},{value:'kline_combo',label:'K线组合'}],
    positions:pos?{intraday:pos,kline:pos}:{},
    iconPositions:pos?{intraday:pos,kline:pos}:{},
    iconPos:s.iconPos, viewDate:s.viewDate||'',
    lastError:state.lastError||'', errorKind:errorKind(), stale:!!state.stale,
    crossPeriod:crossPeriod(), focus:focusInfo(),
    previousSignal:previousSignalInfo(), reminderSignals:reminderSignals(),
    historyDates:historyDateInfo(),
    versionLabel:`潮汐 ${VER}`,
    // V19 宿主快捷面板用结构化数据（插件只提供，宿主渲染与否、画成什么样由宿主定，不谎报已画）：标题栏版本号、股票行日期、开关组默认折叠、高级设置右上角入口、主窗口简化但功能不减。
    quickPanel:{version:VER, versionLabel:`潮汐 ${VER}`, signalDate:date, switchGroupCollapsed:!state.switchesExpanded, advancedEntrance:'top-right', simplified:true, functionsPreserved:true},
    settingsForm:{version:VER, sourceBaseUrl:baseUrl(), sourceCustom:s.sourceCustom, signalDate:date, display:{intradayEnabled:s.intradayEnabled, klineEnabled:s.klineEnabled, directLabelEnabled:s.directLabelEnabled, secondaryCollapsed:!!(state.collapsed.watchlist&&state.collapsed.cross), listCollapsed:!!state.collapsed.list}, filters:{minStrength:s.minStrength, directionFilter:s.directionFilter, typeFilter:s.typeFilter, strategyFilter:s.strategyFilter, denseGroupEnabled:s.denseGroupEnabled, unreadOnly:s.unreadOnly}},
    noteEditor:{entry:'marker double-click', lightweight:true, fields:['text','fontSize','color']},
    sections:{watchlistCollapsed:!!state.collapsed.watchlist, crossCollapsed:!!state.collapsed.cross, listCollapsed:!!state.collapsed.list, filterCollapsed:false, mainCollapsed:false},
    switchesExpanded:!!state.switchesExpanded,
    summary:summaryLine(), periodOverview:periodOverview(), filterBreakdown:filterBreakdown(), watchlist:watchlistSummary(),
    status:{kind:statusKind(), text:statusText()},
    sourceHealth:{url:baseUrl(), custom:s.sourceCustom, isDefault:!s.sourceCustom, lastOkAt:state.fetchedAt||0, failCount:state.failCount||0, errorKind:errorKind(), error:state.lastError||''},
    viewMode:s.viewDate?'history':'follow',
    diagnostics:{fetchCount:state.fetchCount, cacheHits:state.cacheHits, markerCounts:markerCounts(), iconPackFetches:state.iconPackFetches, markerComputes:state.markerComputes, filterComputes:state.filterComputes},
    iconPack:{...state.iconPack},
    iconRegistry:iconRegistryList(),
    signalList:filteredSignals().slice().sort((a,b)=>msOf(b.time)-msOf(a.time)).slice(0,20).map(sig=>({id:String(sig.id||''), time:sig.time||'', price:num(sig.price), side:sideOf(sig), chart:String(sig.chart||''), period:String(sig.period||''), type:String(sig.type||''), source:sig.source||'', strength:(sig.strength===null||sig.strength===undefined)?null:num(sig.strength), strategy:strategyOf(sig), note:noteOf(sig)}))
  };
}
function emitTidal(){
  if(!tidalListeners.size)return;
  let snap=null; try{ snap=tidalState(); }catch(_){ return; }
  for(const cb of [...tidalListeners]){ try{ cb(snap); }catch(_){} }
}
function tidalSetIconPosRaw(a,b){
  // 宿主调 setIconPosition(context, {xPct,yPct})；旧调 setIconPos(pos)；xPct/yPct 为 0-1 小数，x/y 为 0-100 百分比时也兼容
  let pos=b!==undefined?b:a;
  let x,y;
  if(typeof pos==='string'){ const parts=pos.split(',').map(Number); if(parts.length!==2)return false; [x,y]=parts; if(x>1||y>1){ /* 已是百分比 */ } else { x*=100; y*=100; } }
  else if(pos&&typeof pos==='object'){
    const xv=Number(pos.xPct??pos.x), yv=Number(pos.yPct??pos.y);
    if(!Number.isFinite(xv)||!Number.isFinite(yv))return false;
    // 宿主给 0-1 小数；若给的是 0-100 百分比（>1），直接用
    x=xv>1?xv:xv*100; y=yv>1?yv:yv*100;
  } else return false;
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>100||y<0||y>100)return false;
  state.settings.iconPos=`${x},${y}`; saveSettings(); emitTidal(); return true;
}
function tidalSetOption(key,value){
  if(key==='denseGroup'||key==='denseGroupEnabled'){ state.settings.denseGroupEnabled=!!value; saveSettings(); renderAll(); return true; }
  if(key==='unreadOnly'||key==='unreadOnlyFilter'){ state.settings.unreadOnly=!!value; saveSettings(); renderAll(); return true; }
  if(key==='overlayEnabled'||key==='dashedLineEnabled'){ state.settings[key]=true; saveSettings(); renderAll(); return true; } // V15 已取消开关：写什么都恒开，宿主回读恒 true
  if(['intradayEnabled','klineEnabled','directLabelEnabled'].includes(key)){
    state.settings[key]=!!value; saveSettings(); renderAll(); return true;
  }
  if(key==='minStrength'){ const v=Math.max(0,Math.min(100,Number(value))); if(!Number.isFinite(v))return false; state.settings.minStrength=v; saveSettings(); renderAll(); return true; }
  if(key==='direction'||key==='directionFilter'){ if(!['all','buy','sell'].includes(value))return false; state.settings.directionFilter=value; saveSettings(); renderAll(); return true; }
  if(key==='signalType'||key==='typeFilter'||key==='signalTypeFilter'){ if(!['all','t_signal','t_trade','kline_signal','kline_single','kline_combo','t_breakout'].includes(value))return false; state.settings.typeFilter=value; saveSettings(); renderAll(); return true; }
  if(key==='strategy'||key==='strategyFilter'){ if(!['all','aggressive','conservative'].includes(value))return false; state.settings.strategyFilter=value; saveSettings(); renderAll(); return true; }
  if(key==='sourceUrl'||key==='sourceBaseUrl'||key==='signalSourceUrl'){ if(typeof value!=='string'||!value.trim())return false; state.settings.sourceBaseUrl=value.trim(); state.settings.sourceCustom=true; saveSettings(); state.dateCache={}; state.indexCacheAt=0; state.iconPackCacheAt=0; void refresh('source-change'); return true; }
  return false;
}
function tidalFocusStep(dir){
  const rows=filteredSignals().slice().sort((a,b)=>msOf(b.time)-msOf(a.time));
  if(!rows.length)return null;
  if(state.focusIndex<0)state.focusIndex=dir>0?0:rows.length-1;
  else state.focusIndex=(state.focusIndex+dir+rows.length)%rows.length;
  renderAll(); return focusInfo();
}
function tidalMarkSeen(){ return markAllSeen(); }
const tidalHook={
  getState:()=>tidalState(),
  snapshot:()=>tidalState(),
  onChange:(cb)=>{ if(typeof cb!=='function')return ()=>{}; tidalListeners.add(cb); return ()=>tidalListeners.delete(cb); },
  subscribe:(cb)=>{ if(typeof cb!=='function')return ()=>{}; tidalListeners.add(cb); return ()=>tidalListeners.delete(cb); },
  setSwitch:(key,value)=>{
    if(key==='overlayEnabled'||key==='dashedLineEnabled'){ state.settings[key]=true; saveSettings(); renderAll(); return true; } // V15 已取消开关：恒开
    if(!['intradayEnabled','klineEnabled','directLabelEnabled'].includes(key))return false;
    state.settings[key]=!!value; saveSettings(); renderAll(); return true;
  },
  setFilter:(key,value)=>{
    if(key==='minStrength'){ const v=Math.max(0,Math.min(100,Number(value))); if(!Number.isFinite(v))return false; state.settings.minStrength=v; }
    else if(key==='directionFilter'||key==='direction'){ if(!['all','buy','sell'].includes(value))return false; state.settings.directionFilter=value; }
    else if(key==='typeFilter'||key==='signalType'){ if(!['all','t_signal','t_trade','kline_signal','kline_single','kline_combo','t_breakout'].includes(value))return false; state.settings.typeFilter=value; }
    else return false;
    saveSettings(); renderAll(); return true;
  },
  setOption:(key,value)=>{
    if(key==='denseGroup'||key==='denseGroupEnabled'){ state.settings.denseGroupEnabled=!!value; saveSettings(); renderAll(); return true; }
    return tidalSetOption(key,value);
  },
  setSourcePreset:(preset)=>{
    if(preset==='default'){ state.settings.sourceBaseUrl=DEFAULT_SOURCE; state.settings.sourceCustom=false; saveSettings(); state.dateCache={}; state.indexCacheAt=0; state.iconPackCacheAt=0; void refresh('source-preset'); return true; }
    return false;
  },
  updateSettings:(obj)=>{ if(!obj||typeof obj!=='object')return false; let ok=true; for(const [k,v] of Object.entries(obj)) if(!tidalSetOption(k,v)) ok=false; return ok; },
  setSettings:(obj)=>{ if(!obj||typeof obj!=='object')return false; let ok=true; for(const [k,v] of Object.entries(obj)) if(!tidalSetOption(k,v)) ok=false; return ok; },
  setIconPos:(...args)=>tidalSetIconPosRaw(...args),
  setIconPosition:(...args)=>tidalSetIconPosRaw(...args),
  setPosition:(...args)=>tidalSetIconPosRaw(...args),
  markSeen:tidalMarkSeen,
  markViewed:tidalMarkSeen,
  acknowledgeViewed:tidalMarkSeen,
  clearUnreadCount:tidalMarkSeen,
  setViewDate:(date)=>{
    if(date!==''&&!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))return false;
    state.settings.viewDate=String(date); saveSettings(); void refresh('icon-date'); return true;
  },
  setSignalDatePreset:(preset)=>{
    if(preset==='today'){ state.settings.viewDate=''; saveSettings(); void refresh('icon-date'); return true; }
    if(preset==='previous'){ stepDate(-1); return true; }
    if(preset==='next'){ stepDate(1); return true; }
    return false;
  },
  setSignalDateToday:()=>{ state.settings.viewDate=''; saveSettings(); void refresh('icon-date'); return true; },
  shiftSignalDate:(delta)=>{
    if(delta===-1||delta==='previous'){ stepDate(-1); return true; }
    if(delta===1||delta==='next'){ stepDate(1); return true; }
    return false;
  },
  refresh:()=>{ void refresh('icon-manual'); return true; },
  getSignalList:()=>tidalState().signalList,
  registerIcon:(key,def)=>{ const ok=registerIcon(key,def); if(ok)renderAll(); return ok; },
  getIconRegistry:()=>iconRegistryList(),
  getIconPack:()=>({...state.iconPack}),
  getCrossPeriod:()=>crossPeriod(),
  focusSignal:(id)=>{ const rows=filteredSignals().slice().sort((a,b)=>msOf(b.time)-msOf(a.time)); const i=rows.findIndex(x=>String(x.id||'')===String(id)); if(i<0)return null; state.focusIndex=i; renderAll(); return focusInfo(); },
  focusNext:()=>tidalFocusStep(1),
  focusPrev:()=>tidalFocusStep(-1),
  exportCsv:()=>exportCsv(),
  toggleSection:(name)=>{
    if(name==='secondary'){ const v=!(state.collapsed.watchlist&&state.collapsed.cross); state.collapsed.watchlist=v; state.collapsed.cross=v; renderAll(); return {...state.collapsed}; }
    if(name==='watchlist'||name==='cross'||name==='list'){ state.collapsed[name]=!state.collapsed[name]; renderAll(); return {...state.collapsed}; }
    return null;
  },
  setSectionCollapsed:(name,value)=>{
    if(name==='secondary'){ state.collapsed.watchlist=!!value; state.collapsed.cross=!!value; renderAll(); return {...state.collapsed}; }
    if(name==='watchlist'||name==='cross'||name==='list'){ state.collapsed[name]=!!value; renderAll(); return {...state.collapsed}; }
    return null;
  },
  expandAllSections:()=>{ state.collapsed={watchlist:false,cross:false,list:false}; renderAll(); return {...state.collapsed}; },
  collapseSecondarySections:()=>{ state.collapsed.watchlist=true; state.collapsed.cross=true; renderAll(); return {...state.collapsed}; },
  getSections:()=>({...state.collapsed}),
  toggleSwitches:()=>{ setSwitchesExpanded(!state.switchesExpanded); return state.switchesExpanded; },
  setSwitchesExpanded:(v)=>{ setSwitchesExpanded(!!v); return state.switchesExpanded; },
  getSwitchesExpanded:()=>!!state.switchesExpanded,
  resetFilters:()=>{ state.settings.minStrength=0; state.settings.directionFilter='all'; state.settings.typeFilter='all'; state.settings.strategyFilter='all'; state.settings.unreadOnly=false; saveSettings(); renderAll(); return true; },
  resetSettings:()=>{ const keep={sourceBaseUrl:state.settings.sourceBaseUrl, sourceCustom:state.settings.sourceCustom, notes:state.settings.notes, noteStyles:state.settings.noteStyles, iconPos:state.settings.iconPos}; state.settings={...DEFAULT_SETTINGS, ...keep}; saveSettings(); renderAll(); return true; },
  // V19 备注：轻量，双击图上标签时宿主调 setNote/editNote；样式只认简单字号/颜色。
  setNote:(id,text,style)=>setNoteById(id,text,style),
  getNote:(id)=>{ const key=String(id||''); return state.settings.notes[key]||''; },
  editNote:(id)=>{ const key=String(id||''); if(!key)return false; try{ const api=state.ctx?.ui; if(api&&typeof api.openNoteEditor==='function'){ api.openNoteEditor({id:key, title:'信号备注', text:state.settings.notes[key]||'', style:state.settings.noteStyles?.[key]||{}, onSave:(sid,text,style)=>setNoteById(sid,text,style)}); return true; } }catch(_){} let v=null; try{ v=typeof root.prompt==='function'?root.prompt('备注（轻量，写完显示在标签上方）',state.settings.notes[key]||''):null; }catch(_){ v=null; } if(typeof v!=='string')return false; return setNoteById(key,v); },
};
root.__AGP_TIDAL__=tidalHook;

/* ---------------- UI（ctx.ui.mount：settings.plugin + panel.analysis，合同） ---------------- */
function mountUi(spec){
  try{ return state.ctx?.ui?.mount?.(spec)||null; }catch(_){ return null; }
}
// V15 折叠控制（会话内，不写 workspace）：状态卡段与开关组共用“只改 UI 呈现、不改信号/筛选/角标”原则。
function setSwitchesExpanded(v){
  state.switchesExpanded=!!v;
  if(state.switchesExpanded){
    mountSwitchButtons();
  } else {
    for(const k of SWITCH_BUTTON_KEYS){ const h=state.uiHandles[k]; if(h){ try{ h.remove?.(); }catch(_){} delete state.uiHandles[k]; } }
  }
  refreshToggleLabels();
  renderStatus();
}
const SWITCH_BUTTON_KEYS=['intra','kline','strength','direction','type','strategy','dense','unread']; // V15：标记总开关已取消，不在开关组里
function mountSwitchButtons(){
  const defs=[
    ['intra','分时标记：开',44,()=>{ state.settings.intradayEnabled=!state.settings.intradayEnabled; saveSettings(); renderAll(); }],
    ['kline','K线标记：开',45,()=>{ state.settings.klineEnabled=!state.settings.klineEnabled; saveSettings(); renderAll(); }],
    ['strength','强度筛选：0 全显',50,()=>{
      const steps=[0,50,65,80,100];
      const i=steps.indexOf(state.settings.minStrength);
      state.settings.minStrength=steps[(i+1)%steps.length];
      saveSettings(); renderAll();
      const h=state.uiHandles.strength; if(h)try{h.update?.({label:`强度筛选：${state.settings.minStrength===0?'0 全显':`≥${state.settings.minStrength}`}`})}catch(_){}
    }],
    ['direction','方向筛选：全部',51,()=>{
      const steps=['all','buy','sell'];
      const i=steps.indexOf(state.settings.directionFilter);
      state.settings.directionFilter=steps[(i+1)%steps.length];
      saveSettings(); renderAll();
      const h=state.uiHandles.direction; if(h)try{h.update?.({label:`方向筛选：${state.settings.directionFilter==='all'?'全部':state.settings.directionFilter==='buy'?'只看买':'只看卖'}`})}catch(_){}
    }],
    ['type','信号类型：全部',54,()=>{
      const steps=['all','t_signal','t_trade','kline_signal','kline_single','kline_combo','t_breakout'];
      const labels={all:'全部',t_signal:'分时信号',t_trade:'分时成交',kline_signal:'K线信号',kline_single:'日K',kline_combo:'K线组合'};
      const i=steps.indexOf(state.settings.typeFilter);
      state.settings.typeFilter=steps[(i+1)%steps.length];
      saveSettings(); renderAll();
      const h=state.uiHandles.type; if(h)try{h.update?.({label:`信号类型：${labels[state.settings.typeFilter]}`})}catch(_){}
    }],
    ['strategy','策略筛选：全部',61,()=>{
      const steps=['all','aggressive','conservative'];
      const labels={all:'全部',aggressive:'只看激进',conservative:'只看保守'};
      const i=steps.indexOf(state.settings.strategyFilter);
      state.settings.strategyFilter=steps[(i+1)%steps.length];
      saveSettings(); renderAll();
      const h=state.uiHandles.strategy; if(h)try{h.update?.({label:`策略筛选：${labels[state.settings.strategyFilter]}`})}catch(_){}
    }],
    ['dense','密集分组：开',62,()=>{ state.settings.denseGroupEnabled=!state.settings.denseGroupEnabled; saveSettings(); renderAll(); const h=state.uiHandles.dense; if(h)try{h.update?.({label:`密集分组：${state.settings.denseGroupEnabled?'开':'关'}`})}catch(_){} }],
    ['unread','只看未看：关',64,()=>{ state.settings.unreadOnly=!state.settings.unreadOnly; saveSettings(); renderAll(); const h=state.uiHandles.unread; if(h)try{h.update?.({label:`只看未看：${state.settings.unreadOnly?'开':'关'}`})}catch(_){} }],
  ];
  for(const [key,label,order,onAction] of defs){
    const old=state.uiHandles[key]; if(old){ try{ old.remove?.(); }catch(_){} }
    const h=mountUi({slot:'settings.plugin',kind:'button',label,order,onAction});
    if(h)state.uiHandles[key]=h;
  }
}
function refreshToggleLabels(){
  const s=state.settings;
  const map={
    intra:`分时标记：${s.intradayEnabled?'开':'关'}`,
    kline:`K线标记：${s.klineEnabled?'开':'关'}`,
    date:`信号日期：${targetDate()}`,
    strength:`强度筛选：${s.minStrength===0?'0 全显':`≥${s.minStrength}`}`,
    direction:`方向筛选：${s.directionFilter==='all'?'全部':s.directionFilter==='buy'?'只看买':'只看卖'}`,
    type:`信号类型：${{all:'全部',t_signal:'分时信号',t_trade:'分时成交',kline_signal:'K线信号',kline_single:'日K',kline_combo:'K线组合'}[s.typeFilter]||'全部'}`,
    strategy:`策略筛选：${s.strategyFilter==='all'?'全部':s.strategyFilter==='aggressive'?'只看激进':'只看保守'}`,
    dense:`密集分组：${s.denseGroupEnabled?'开':'关'}`,
    unread:`只看未看：${s.unreadOnly?'开':'关'}`,
    secondary:`次要段：${(state.collapsed.watchlist&&state.collapsed.cross)?'已折叠':'已展开'}`,
    listToggle:`信号列表：${state.collapsed.list?'已折叠':'已展开'}`,
    switches:`开关组：${state.switchesExpanded?'已展开':'已折叠'}`,
    versionTop:`潮汐指标 ${VER} · 开关组：${state.switchesExpanded?'已展开':'已折叠'}`
  };
  for(const k of Object.keys(map)){
    const h=state.uiHandles[k];
    if(h){ try{ h.update?.({label:map[k]}); }catch(_){} }
  }
}

/* V20 自有面板与双击备注：插件自己能动的面，先用完再定宿主问题 */
function selfPanelGroups(){
  const s=state.settings, sum=summaryLine(), fb=filterBreakdown();
  const date=state.envelopeDate||targetDate();
  return [
    {id:'switches', title:'开关组', defaultCollapsed:true, rows:[
      {id:'intraday', kind:'toggle', label:'分时标记', value:!!s.intradayEnabled},
      {id:'kline', kind:'toggle', label:'K线标记', value:!!s.klineEnabled},
      {id:'direct', kind:'toggle', label:'直接标签', value:!!s.directLabelEnabled},
    ]},
    {id:'signals', title:'今日活跃信号', defaultCollapsed:false, rows:[
      {id:'active', kind:'text', label:`共${sum.total}条 · 剩余${fb.remaining||sum.total}条 · 未看${sum.unread}条`, value:''},
      {id:'prevDay', kind:'button', label:'上一日', value:'上一日'},
      {id:'today', kind:'button', label:'当日', value:'当日'},
      {id:'nextDay', kind:'button', label:'下一日', value:'下一日'},
    ]},
    {id:'advanced', title:'高级设置', defaultCollapsed:true, rows:[
      {id:'source', kind:'text', label:`信号源：${baseUrl()}`, value:''},
      {id:'refresh', kind:'button', label:'刷新信号', value:'刷新信号'},
      {id:'seen', kind:'button', label:'已看清零', value:'已看清零'},
      {id:'resetFilters', kind:'button', label:'恢复默认筛选', value:'恢复默认筛选'},
      {id:'resetAll', kind:'button', label:'恢复默认设置', value:'恢复默认设置'},
      {id:'dense', kind:'toggle', label:'密集信号合并 ×N', value:!!s.denseGroupEnabled},
      {id:'direction', kind:'select', label:'方向筛选', value:s.directionFilter, options:[{value:'all',label:'全部'},{value:'buy',label:'买入'},{value:'sell',label:'卖出'}]},
      {id:'type', kind:'select', label:'信号类型', value:s.typeFilter, options:[{value:'all',label:'全部'},{value:'t_signal',label:'分时信号'},{value:'kline_signal',label:'K线信号'},{value:'kline_single',label:'日K'},{value:'kline_combo',label:'K线组合'}]},
      {id:'strength', kind:'range', label:'强度筛选', value:s.minStrength, min:0, max:100, step:1},
    ]},
  ];
}
/* V21 卡片面板（本地-only，未推）：全部三个分组按卡片方式画，不再用宿主单列行。
 * 宿主标准分组渲染是标题前小三角 + 每行一整行，插件改不了宿主渲染，所以改用宿主
 * 已提供的自定义 HTML 面板（html/frameHeight/onMessage，V64/V65 均有）：卡片、标题左、
 * 折叠按钮在标题行最右且放大、多列网格，全部在 iframe 内画，功能与标准分组一一对应。
 * 折叠状态会话内保留在 state.cardCollapsed，默认开关组折叠、今日活跃展开、高级设置折叠。 */
function escHtml(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function cardCollapsed(){ if(!state.cardCollapsed) state.cardCollapsed={switches:true, signals:false, advanced:true}; return state.cardCollapsed; }
function selfPanelHtml(){
  const s=state.settings, sum=summaryLine(), fb=filterBreakdown(), cc=cardCollapsed();
  const css='*{box-sizing:border-box}.wrap{font-family:inherit;color:#dce8ee;padding:2px;width:100%;overflow-x:hidden}.meta{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:2px 2px 6px;border-bottom:1px solid #293747;color:#97b5c6;font-size:12px}.meta span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.card{border:1px solid #3d6074;border-radius:8px;background:#162636;padding:6px 8px;margin:6px 0;width:100%}.card-head{display:flex;align-items:center;justify-content:space-between;gap:6px}.card-title{font-weight:700;font-size:13px}.collapse{font-size:14px;line-height:1;padding:2px 7px;border:1px solid #435668;border-radius:5px;background:#203044;color:#dce8ee;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:4px;width:100%}.gridAuto{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:4px;width:100%}.gridAutoBtn{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:4px;width:100%}.gridAutoWide{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:4px;width:100%}.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;width:100%}.item{display:flex;align-items:center;justify-content:space-between;gap:4px;background:#101b27;border:1px solid #273644;border-radius:5px;padding:4px 6px;font-size:12px;min-width:0}.item span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.item button,.item select{background:#203044;color:#dce8ee;border:1px solid #435668;border-radius:4px;padding:3px 5px;cursor:pointer;max-width:100%}.full{margin:4px 0;font-size:12px;color:#97b5c6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.btn{width:100%;background:#203044;color:#dce8ee;border:1px solid #435668;border-radius:5px;padding:5px 6px;cursor:pointer}';
  const card=(id,title,body)=>{ const c=!!cc[id]; return '<div class="card"><div class="card-head"><span class="card-title">'+escHtml(title)+'</span><button class="collapse" data-collapse="'+id+'" aria-label="折叠">'+(c?'▸':'▾')+'</button></div>'+(c?'':'<div class="card-body">'+body+'</div>')+'</div>'; };
  const sw='<div class="gridAuto">'
    +'<label class="item"><span>分时标记</span><input type="checkbox" data-row="intraday" '+(s.intradayEnabled?'checked':'')+'></label>'
    +'<label class="item"><span>K线标记</span><input type="checkbox" data-row="kline" '+(s.klineEnabled?'checked':'')+'></label>'
    +'<label class="item"><span>直接标签</span><input type="checkbox" data-row="direct" '+(s.directLabelEnabled?'checked':'')+'></label></div>';
  const sig='<div class="full">共'+sum.total+'条 · 剩余'+(fb.remaining||sum.total)+'条 · 未看'+sum.unread+'条</div><div class="gridAutoBtn">'
    +'<button class="btn" data-row="prevDay">上一日</button><button class="btn" data-row="today">当日</button><button class="btn" data-row="nextDay">下一日</button></div>';
  const adv='<div class="full" title="'+escHtml(baseUrl())+'">信号源：'+escHtml(baseUrl())+'</div><div class="gridAutoWide">'
    +'<button class="btn" data-row="refresh">刷新信号</button><button class="btn" data-row="seen">已看清零</button>'
    +'<button class="btn" data-row="resetFilters">恢复默认筛选</button><button class="btn" data-row="resetAll">恢复默认设置</button></div><div class="gridAutoWide" style="margin-top:6px">'
    +'<label class="item"><span>密集合并 ×N</span><input type="checkbox" data-row="dense" '+(s.denseGroupEnabled?'checked':'')+'></label>'
    +'<label class="item"><span>方向</span><select data-row="direction"><option value="all"'+(s.directionFilter==='all'?' selected':'')+'>全部</option><option value="buy"'+(s.directionFilter==='buy'?' selected':'')+'>买入</option><option value="sell"'+(s.directionFilter==='sell'?' selected':'')+'>卖出</option></select></label>'
    +'<label class="item"><span>类型</span><select data-row="type"><option value="all"'+(s.typeFilter==='all'?' selected':'')+'>全部</option><option value="t_signal"'+(s.typeFilter==='t_signal'?' selected':'')+'>分时信号</option><option value="kline_signal"'+(s.typeFilter==='kline_signal'?' selected':'')+'>K线信号</option><option value="kline_single"'+(s.typeFilter==='kline_single'?' selected':'')+'>日K</option><option value="kline_combo"'+(s.typeFilter==='kline_combo'?' selected':'')+'>K线组合</option></select></label>'
    +'<label class="item"><span>强度 ≥'+s.minStrength+'</span><input type="range" data-row="strength" min="0" max="100" step="1" value="'+s.minStrength+'"></label></div>';
  const js="document.addEventListener('click',function(e){var c=e.target.closest('[data-collapse]');if(c){var card=c.closest('.card');var body=card&&card.querySelector('.card-body');if(body){var hid=body.style.display==='none';body.style.display=hid?'':'none';c.textContent=hid?'▾':'▸';}parent.postMessage({type:'card-collapse',group:c.getAttribute('data-collapse')},'*');return;}var t=e.target.closest('[data-row]');if(t&&t.tagName==='BUTTON'){parent.postMessage({type:'card-control',row:t.getAttribute('data-row'),value:true},'*');}});document.addEventListener('change',function(e){var t=e.target.closest('[data-row]');if(!t)return;var v=t.type==='checkbox'?t.checked:(t.type==='range'?Number(t.value):t.value);parent.postMessage({type:'card-control',row:t.getAttribute('data-row'),value:v},'*');});";
  const meta='<div class="meta"><span>'+escHtml(sum.symbol||'--')+' · 接口已连接</span><span>更新日期：'+escHtml(state.envelopeDate||targetDate())+'</span></div>';
  return '<style>'+css+'</style><div class="wrap">'+meta+card('switches','开关组',sw)+card('signals','今日活跃信号',sig)+card('advanced','高级设置',adv)+'</div><script>'+js+'</'+'script>';
}
function panelFrameHeight(){ const cc=cardCollapsed(); let h=40; h+=40*3; if(!cc.switches) h+=50; if(!cc.signals) h+=70; if(!cc.advanced) h+=200; return Math.max(160, Math.min(620, h)); }
function panelCardControl(rid,v){
    if(rid==='intraday'){ state.settings.intradayEnabled=!!v; }
    else if(rid==='kline'){ state.settings.klineEnabled=!!v; }
    else if(rid==='direct'){ state.settings.directLabelEnabled=!!v; }
    else if(rid==='dense'){ state.settings.denseGroupEnabled=!!v; }
    else if(rid==='direction'){ state.settings.directionFilter=String(v); }
    else if(rid==='type'){ state.settings.typeFilter=String(v); }
    else if(rid==='strength'){ state.settings.minStrength=Number(v)||0; }
    else if(rid==='prevDay'){ stepDate(-1); return; }
    else if(rid==='today'){ state.settings.viewDate=''; saveSettings(); void refresh('icon-date'); return; }
    else if(rid==='nextDay'){ stepDate(1); return; }
    else if(rid==='refresh'){ void refresh('manual'); return; }
    else if(rid==='seen'){ markAllSeen(); return; }
    else if(rid==='resetFilters'){ state.settings.minStrength=0; state.settings.directionFilter='all'; state.settings.typeFilter='all'; state.settings.strategyFilter='all'; state.settings.unreadOnly=false; }
    else if(rid==='resetAll'){ const keep={sourceBaseUrl:state.settings.sourceBaseUrl, sourceCustom:state.settings.sourceCustom, notes:state.settings.notes, noteStyles:state.settings.noteStyles, iconPos:state.settings.iconPos}; state.settings={...DEFAULT_SETTINGS, ...keep}; }
    else return;
    saveSettings(); renderAll();
}
function selfPanelSpec(){
  const sum=summaryLine(), date=state.envelopeDate||targetDate();
  return {key:'main-v23', title:'潮汐 Muse Ai', version:VER, icon:'潮', triggerStyle:{size:36, fontSize:26}, signal:{active:sum.total>0, symbol:sum.symbol||''}, badge:{kind:'number', metric:'today-active', value:sum.total, visible:sum.total>0}, areas:['main.intraday','main.kline'], stock:`${sum.symbol||'--'} · 接口已连接`, date:date, settings:true, width:500, minWidth:260, maxWidth:900, html:selfPanelHtml(), frameHeight:panelFrameHeight(), onMessage:(msg)=>{ if(!msg||typeof msg!=='object')return; if(msg.type==='card-collapse'){ const cc=cardCollapsed(); cc[msg.group]=!cc[msg.group]; updateSelfPanel(); return; } if(msg.type==='card-control'){ panelCardControl(msg.row, msg.value); updateSelfPanel(); } }, groups:selfPanelGroups(), onAction:(detail)=>{
    const a=detail?.action, gid=detail?.groupId, rid=detail?.rowId, v=detail?.value;
    if(a==='settings'){ cardCollapsed().advanced=false;
      try{ const h=state.uiHandles.selfPanel; if(h) h.update(selfPanelSpec()); }catch(_){}
      return; }
    if(a!=='control')return;
    if(rid==='intraday'){ state.settings.intradayEnabled=!!v; }
    else if(rid==='kline'){ state.settings.klineEnabled=!!v; }
    else if(rid==='direct'){ state.settings.directLabelEnabled=!!v; }
    else if(rid==='dense'){ state.settings.denseGroupEnabled=!!v; }
    else if(rid==='direction'){ state.settings.directionFilter=String(v); }
    else if(rid==='type'){ state.settings.typeFilter=String(v); }
    else if(rid==='strength'){ state.settings.minStrength=Number(v)||0; }
    else if(rid==='prevDay'){ stepDate(-1); return; }
    else if(rid==='today'){ state.settings.viewDate=''; saveSettings(); void refresh('icon-date'); return; }
    else if(rid==='nextDay'){ stepDate(1); return; }
    else if(rid==='refresh'){ void refresh('manual'); return; }
    else if(rid==='seen'){ markAllSeen(); return; }
    else if(rid==='resetFilters'){ state.settings.minStrength=0; state.settings.directionFilter='all'; state.settings.typeFilter='all'; state.settings.strategyFilter='all'; state.settings.unreadOnly=false; }
    else if(rid==='resetAll'){ const keep={sourceBaseUrl:state.settings.sourceBaseUrl, sourceCustom:state.settings.sourceCustom, notes:state.settings.notes, noteStyles:state.settings.noteStyles, iconPos:state.settings.iconPos}; state.settings={...DEFAULT_SETTINGS, ...keep}; }
    else return;
    saveSettings(); renderAll();
  }};
}
function mountSelfPanel(){
  try{
    const api=state.ctx?.ui;
    if(!api?.mountPanel) return null;
    if(state.uiHandles.selfPanel) return state.uiHandles.selfPanel;
    const h=api.mountPanel(selfPanelSpec());
    if(h) state.uiHandles.selfPanel=h;
    return h;
  }catch(_){ return null; }
}
function updateSelfPanel(){
  try{ const h=state.uiHandles.selfPanel; if(h&&typeof h.update==='function') h.update(selfPanelSpec()); }catch(_){}
}
function openNoteEditorFor(id){
  const key=String(id||''); if(!key) return false;
  try{
    const api=state.ctx?.ui;
    if(api&&typeof api.openNoteEditor==='function'){
      api.openNoteEditor({id:key, title:'信号备注', text:state.settings.notes[key]||'', style:state.settings.noteStyles?.[key]||{}, onSave:(sid,text,style)=>setNoteById(sid,text,style)});
      return true;
    }
  }catch(_){}
  return tidalHook.editNote(key);
}
function registerDblclick(){
  for(const context of [CTX_INTRA,CTX_KLINE]){
    const layer=state.layers[context];
    if(layer&&typeof layer.on==='function'){
      try{ layer.on('dblclick',(detail)=>{ const id=detail?.eventKey||detail?.id||''; if(id) openNoteEditorFor(id); }); }catch(_){}
    }
  }
}

function setupUi(){
  const add=(key,slot,label,order,onAction)=>{
    const h=mountUi({slot,kind:'button',label,order,onAction});
    if(h)state.uiHandles[key]=h;
    return h;
  };
  add('source','settings.plugin','潮汐信号源 URL（留空恢复默认）',41,()=>{
    const cur=state.settings.sourceBaseUrl;
    let v=null;
    try{ v=typeof root.prompt==='function'?root.prompt('潮汐信号源基地址（公开 HTTPS 直链目录，含 index.json 与 YYYY-MM-DD.json；留空则恢复默认公开地址）',cur):null; }catch(_){ v=null; }
    if(typeof v==='string'){
      if(!v.trim()){ state.settings.sourceBaseUrl=DEFAULT_SOURCE; state.settings.sourceCustom=false; }
      else { state.settings.sourceBaseUrl=v.trim(); state.settings.sourceCustom=true; }
      saveSettings(); state.dateCache={}; state.indexCacheAt=0; state.iconPackCacheAt=0; void refresh('manual');
    }
  });
  // V18：设置面顶部入口——版本号 + 开关折叠状态同在一个按钮里，点它即展开/收起开关组；order 39 在原有 40+ 按钮之前，打开插件独立设置对话框第一眼就能看到。
  add('versionTop','settings.plugin',`潮汐指标 ${VER} · 开关组：已折叠`,39,()=>{ setSwitchesExpanded(!state.switchesExpanded); });
  // V19：恢复默认信号源不再单独成按钮，信号源 URL 留空即恢复默认；开关组重复按钮已删，只留顶部 versionTop 一个入口。
  add('refresh','settings.plugin','潮汐信号 刷新',42,()=>{ void refresh('manual'); });
  // V15 状态卡折叠入口（恒显示，否则折叠后无处展开）：次要段合一 + 信号列表各 1 个按钮，不搞每段 1 个按钮。
  add('secondary','settings.plugin','次要段：已折叠',63,()=>{ const v=!(state.collapsed.watchlist&&state.collapsed.cross); state.collapsed.watchlist=v; state.collapsed.cross=v; renderAll(); });
  add('listToggle','settings.plugin','信号列表：已展开',65,()=>{ state.collapsed.list=!state.collapsed.list; renderAll(); });

  // V19：翻日导航不在高级设置里，翻日走主窗口股票行 / 宿主快捷面板 / hook setSignalDatePreset；备注不在设置里，备注走图上标签双击 + hook setNote/editNote。
  add('seen','settings.plugin','已看清零',52,()=>{ markAllSeen(); });
  add('reset','settings.plugin','恢复默认筛选',55,()=>{
    state.settings.minStrength=0; state.settings.directionFilter='all'; state.settings.typeFilter='all'; state.settings.strategyFilter='all'; state.settings.unreadOnly=false;
    saveSettings(); renderAll();
  });
  add('resetAll','settings.plugin','恢复默认设置（不改信号源/备注/图标位置）',56,()=>{
    const keep={sourceBaseUrl:state.settings.sourceBaseUrl, sourceCustom:state.settings.sourceCustom, notes:state.settings.notes, noteStyles:state.settings.noteStyles, iconPos:state.settings.iconPos};
    state.settings={...DEFAULT_SETTINGS, ...keep};
    saveSettings(); renderAll();
  });
  // V15 精简移除：定位信号下一条/上一条按钮——宿主至今不消费 focus 字段，按钮只改状态卡已定位行、无图上效果（V13 已写好此砍条件）；hook 的 focusNext/focusPrev/focusSignal 保留供宿主将来消费，信号本身不受影响。
  add('refreshPanel','panel.analysis','潮汐信号 刷新',21,()=>{ void refresh('manual'); });
  const card=mountUi({slot:'panel.analysis',kind:'stat-card',order:22,title:'今日信号',segments:[{text:'潮汐：未获取信号'}]});
  if(card)state.uiHandles.status=card;
  mountSelfPanel();
  refreshToggleLabels();
}
/* 按 index 在可用日期间翻日；无 index 时按自然日步进
 * V14：翻日跳过会话内已知空日（缓存信封当前股 0 条），未知日期不跳过（不谎称空）；
 * 若沿方向全部都是已知空日，落回最近一个 index 日，不卡死在原地。 */
function stepDate(dir){
  const cur=targetDate();
  if(state.dates.length){
    let i=state.dates.indexOf(cur);
    if(i<0)i=dir>0?state.dates.filter(d=>d>cur).length-1:state.dates.filter(d=>d<cur).length-1;
    if(i<0)i=dir>0?0:state.dates.length-1;
    let next=null;
    for(let j=i+dir; j>=0&&j<state.dates.length; j+=dir){
      if(!isKnownEmptyDate(state.dates[j])){ next=state.dates[j]; break; }
    }
    if(!next)next=state.dates[clamp(i+dir,0,state.dates.length-1)];
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
  // V7 修：停用清理删了 __AGP_TIDAL__，再启用必须重挂，否则热拔插第二轮起宿主图标读不到接口
  root.__AGP_TIDAL__=tidalHook;
  // V15：折叠状态会话内保留、重激活复位为默认（次要段折叠、列表展开、开关组收起）。
  state.collapsed={watchlist:true,cross:true,list:false};
  state.switchesExpanded=false;
  // V8 修 R1：重激活/换源时会话缓存必须清零，否则旧源的 index/日期信封会残留到新源（实测：合成源切回真实源后仍显示合成空日期）
  state.dates=[]; state.dateCache={}; state.indexCacheAt=0; state.iconPackCacheAt=0; state.iconPackBase=''; state.iconPack={status:'builtin',source:'',applied:0,skipped:0,error:''}; for(const k of Object.keys(ICON_OVERRIDES)) delete ICON_OVERRIDES[k]; state.envelope=null; state.envelopeDate=''; state.generatedAt=''; state.fetchedAt=0; state.lastError=''; state.failCount=0; state.stale=false; state.focusIndex=-1;
  loadSettings(ctx);
  syncView();
  /* 双主图独立标记层（合同 createMarkerLayer；拿不到时该层不渲染，不抛错） */
  for(const context of [CTX_INTRA,CTX_KLINE]){
    try{
      const layer=ctx?.visual?.createMarkerLayer?.({context,order:80});
      if(layer&&typeof layer.setData==='function')state.layers[context]=layer;
    }catch(_){ /* 权限/宿主差异时静默降级 */ }
  }
  registerDblclick();
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
