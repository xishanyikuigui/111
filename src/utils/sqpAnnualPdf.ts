declare global { interface Window { jspdf?: { jsPDF: new (options?: object) => any } } }

type Row = { kw: string; qc: number; imp: number; clk: number; ord: number; ti: number; tc: number; to: number; buyShare: number; marketPrice?: number; asinPrice?: number };
type MonthData = Record<number, { fileName: string; rowCount: number; rows: Row[] }>;
const n = (x: number) => x.toLocaleString('en-US');
const p = (x: number) => `${(x * 100).toFixed(2)}%`;
const sum = (rows: Row[], key: keyof Row) => rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);

/** Creates an image-based Chinese PDF so it renders consistently without a server font dependency. */
async function getJsPdf() {
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  await new Promise<void>((resolve, reject) => {
    const script=document.createElement('script');
    script.src=`${import.meta.env.BASE_URL}vendor/jspdf.umd.min.js`;
    script.onload=()=>resolve(); script.onerror=()=>reject(new Error('PDF 引擎加载失败，请刷新页面后重试。'));
    document.head.appendChild(script);
  });
  if (!window.jspdf?.jsPDF) throw new Error('PDF 引擎未正确初始化。');
  return window.jspdf.jsPDF;
}

export async function downloadSqpAnnualPdf(monthly: MonthData) {
  const months = Object.keys(monthly).map(Number).sort((a, b) => a - b);
  if (!months.length) throw new Error('请先上传至少一个月度 SQP 文件。');
  const all = months.flatMap(m => monthly[m].rows);
  const stable = [...new Set(all.map(r => r.kw))].filter(kw => months.every(m => monthly[m].rows.some(r => r.kw === kw)));
  const mi=sum(all,'ti'), ai=sum(all,'imp'), mc=sum(all,'tc'), ac=sum(all,'clk'), mo=sum(all,'to'), ao=sum(all,'ord');
  const top = [...all.reduce((map, r) => { const old=map.get(r.kw) || { ...r, appearances: 0 }; old.qc += r.qc; old.ord += r.ord; old.to += r.to; old.clk += r.clk; old.tc += r.tc; old.appearances++; map.set(r.kw, old); return map; }, new Map<string, Row & { appearances:number }>()).values()].sort((a,b)=>b.ord-a.ord).slice(0, 8);
  const canvas = document.createElement('canvas'); canvas.width=1600; canvas.height=2260;
  const ctx=canvas.getContext('2d')!; ctx.fillStyle='#fff'; ctx.fillRect(0,0,1600,2260); ctx.textBaseline='top';
  const line=(y:number)=>{ctx.strokeStyle='#cbd5e1';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(90,y);ctx.lineTo(1510,y);ctx.stroke();};
  const text=(s:string,x:number,y:number,size=28,color='#173b55',weight='normal')=>{ctx.fillStyle=color;ctx.font=`${weight} ${size}px Microsoft YaHei, SimSun, sans-serif`;ctx.fillText(s,x,y);};
  const para=(s:string,x:number,y:number,width:number,size=25,color='#475569')=>{ctx.fillStyle=color;ctx.font=`${size}px Microsoft YaHei, SimSun, sans-serif`;let cur='';let yy=y;for(const ch of s){if(ctx.measureText(cur+ch).width>width){ctx.fillText(cur,x,yy);cur=ch;yy+=size*1.55}else cur+=ch}if(cur)ctx.fillText(cur,x,yy);return yy+size*1.55};
  const section=(i:string,title:string,y:number)=>{ctx.fillStyle='#1483ba';ctx.beginPath();ctx.arc(112,y+18,22,0,Math.PI*2);ctx.fill();text(i,105,y+4,18,'#fff','bold');text(title,150,y,32,'#173b55','bold');line(y+48)};
  ctx.fillStyle='#12324a';ctx.fillRect(0,0,1600,190);text('SQP 年度趋势分析报告',90,58,48,'#fff','bold');text(`月度 Top100 样本 | 覆盖 ${months[0]} 月至 ${months.at(-1)} 月 | 本地浏览器生成`,90,125,21,'#dcecf5');
  let y=235; y=para(`经营结论：ASIN 搜索端曝光份额 ${p(ai/mi)}、购买份额 ${p(ao/mo)}。请优先核验可见度、索引、库存和 Buy Box；只有在订单样本足够时，才对单关键词转化作扩量判断。`,90,y,1420,29,'#173b55');
  const cards=[['覆盖月数',`${months.length}`],['累计搜索量',n(sum(all,'qc'))],['ASIN 订单',n(ao)],['稳定词数',`${stable.length}`]]; cards.forEach(([a,b],i)=>{const x=90+i*365;ctx.fillStyle='#f1f5f9';ctx.fillRect(x,y+25,320,150);ctx.fillStyle=['#1683ba','#d88718','#bf4d42','#22725b'][i];ctx.fillRect(x,y+25,320,12);text(a,x+22,y+55,21,'#64748b');text(b,x+22,y+92,38,'#173b55','bold')}); y+=220;
  section('1','概览与月度趋势',y); y+=75; text('月份',100,y,22,'#334155','bold');text('词数',280,y,22,'#334155','bold');text('搜索量',430,y,22,'#334155','bold');text('ASIN订单',760,y,22,'#334155','bold');text('购买份额',1030,y,22,'#334155','bold');y+=38;
  months.forEach((m,i)=>{const r=monthly[m].rows; if(i%2===0){ctx.fillStyle='#f8fafc';ctx.fillRect(90,y-5,1420,36)} const mm=sum(r,'to'),aa=sum(r,'ord');text(`${m}月`,100,y,21);text(`${r.length}`,280,y,21);text(n(sum(r,'qc')),430,y,21);text(n(aa),760,y,21);text(p(aa/mm),1030,y,21);y+=42});
  y+=22;section('2','核心关键词趋势',y);y+=70;text('关键词',100,y,21,'#334155','bold');text('出现月数',720,y,21,'#334155','bold');text('累计搜索量',900,y,21,'#334155','bold');text('ASIN订单',1230,y,21,'#334155','bold');y+=36;
  top.forEach((r,i)=>{if(i%2===0){ctx.fillStyle='#f8fafc';ctx.fillRect(90,y-4,1420,34)}text(r.kw.slice(0,42),100,y,19);text(`${r.appearances}`,735,y,19);text(n(r.qc),900,y,19);text(n(r.ord),1240,y,19);y+=38});
  y+=15;section('3','漏斗比较与 Share of Search',y);y+=70; const funnel:[string,number,number][]=[['曝光',mi,ai],['点击',mc,ac],['订单',mo,ao]];funnel.forEach((r,i)=>{const x=100+i*470;ctx.fillStyle='#eaf5fa';ctx.fillRect(x,y,410,120);text(r[0],x+20,y+18,22,'#475569','bold');text(`市场 ${n(r[1])}`,x+20,y+52,20);text(`ASIN ${n(r[2])} | 份额 ${p(r[2]/r[1])}`,x+20,y+82,18,'#1677a8')});
  y+=175;section('4','关键词词群与机会筛选',y);y+=65;y=para('将完整产品类型词与尺寸、材质、风格、使用场景词分开管理。优先保护稳定、高份额且订单基数足够的相关词；高需求低份额词须先验证产品相关性和索引状态，不能因搜索量直接扩量。',90,y,1420,24);
  section('5','价格与履约背景',y+25);y+=90;y=para('月度导出中的中位价可能混合变体、套装和材质，仅作为方向性背景；配送速度字段若为市场字段，不能推断本 ASIN 自身履约劣势。',90,y,1420,24);
  section('6','机会与风险',y+30);y+=95;y=para(`风险提示：本报告基于每月 Top100 词池，词池变动会影响全量趋势；稳定词面板为 ${stable.length} 个词。词级订单较小的 CVR 已在报告中按低置信处理。`,90,y,1420,24,'#b54437');
  section('7','行动建议',y+30);y+=95;y=para('1) 核验库存、Buy Box、类目节点和核心词索引；2) 对真实适配的产品类型、尺寸和风格词完善页面覆盖与搜索结果展示；3) 相关机会词仅做受控测试，并以曝光份额、点击率、订单和 CVR 复盘。',90,y,1420,24);
  section('8','方法与限制',y+30);y+=95;para('计算口径：先汇总绝对量再计算 CTR、CVR 与阶段份额；稳定词指每个已上传月份均出现的词。累计搜索量仅是月度 Top100 样本累计，不代表类目总盘。未上传广告报表时，不输出 ROAS、ACoS、出价、预算或增量结论。',90,y,1420,23);
  // Full report pages: the first page is the executive overview above; subsequent pages retain the Skill's eight-section framework.
  const detailPage=(title:string, subtitle:string, blocks:{heading:string; body:string; rows?:string[][]}[])=>{
    const c=document.createElement('canvas');c.width=1600;c.height=2260;const g=c.getContext('2d')!;g.fillStyle='#fff';g.fillRect(0,0,1600,2260);g.textBaseline='top';
    const tx=(s:string,x:number,yy:number,sz=26,col='#173b55',weight='normal')=>{g.fillStyle=col;g.font=`${weight} ${sz}px Microsoft YaHei, SimSun, sans-serif`;g.fillText(s,x,yy)};
    const pa=(s:string,x:number,yy:number,w=1400,sz=24,col='#475569')=>{g.fillStyle=col;g.font=`${sz}px Microsoft YaHei, SimSun, sans-serif`;let q='';for(const ch of s){if(g.measureText(q+ch).width>w){g.fillText(q,x,yy);q=ch;yy+=sz*1.55}else q+=ch}if(q)g.fillText(q,x,yy);return yy+sz*1.7};
    g.fillStyle='#12324a';g.fillRect(0,0,1600,180);tx(title,90,55,44,'#fff','bold');tx(subtitle,90,120,20,'#dcecf5');let yy=230;
    blocks.forEach((b,bi)=>{g.fillStyle='#1483ba';g.beginPath();g.arc(112,yy+18,22,0,Math.PI*2);g.fill();tx(String(bi+1),105,yy+4,17,'#fff','bold');tx(b.heading,150,yy,31,'#173b55','bold');g.strokeStyle='#cbd5e1';g.beginPath();g.moveTo(150,yy+49);g.lineTo(1510,yy+49);g.stroke();yy=pa(b.body,90,yy+76);if(b.rows?.length){const cols=b.rows[0].length, cw=1420/cols;b.rows.forEach((row,ri)=>{const h=38;g.fillStyle=ri===0?'#12324a':ri%2?'#f1f5f9':'#fff';g.fillRect(90,yy,cw*cols,h);row.forEach((cell,ci)=>tx(cell,100+ci*cw,yy+8,ri===0?18:17,ri===0?'#fff':'#173b55',ri===0?'bold':'normal'));yy+=h});}yy+=38;});
    tx('范围：月度 Top100 样本；累计搜索量不代表类目总盘。数据仅在本地浏览器处理。',90,2185,17,'#64748b');return c;
  };
  const stableByMonth=months.map(m=>monthly[m].rows.filter(r=>stable.includes(r.kw)));
  const price=(rows:Row[],key:'marketPrice'|'asinPrice')=>{const valid=rows.filter(r=>(r[key]||0)>0);return valid.length?valid.reduce((a,r)=>a+(r[key]||0),0)/valid.length:0};
  const p2=detailPage('核心关键词与漏斗诊断','关键词趋势与市场/ASIN 加权漏斗',[
    {heading:'核心关键词趋势',body:`按 ASIN 订单汇总的前列关键词如下。订单基数较低时，关键词 CVR 仅作方向性参考，不将极端值视为确定优势。`,rows:[['关键词','出现月数','累计搜索量','ASIN订单','购买份额'],...top.map(r=>[r.kw.slice(0,28),String(r.appearances),n(r.qc),n(r.ord),p(r.ord/r.to)])]},
    {heading:'漏斗比较',body:`市场 CTR ${p(mc/mi)}，ASIN CTR ${p(ac/ai)}；市场点击-购买 ${p(mo/mc)}，ASIN 点击-购买 ${p(ao/ac)}。应先以绝对量核验曝光、点击、订单的短板，而不是先假定详情页转化问题。`,rows:[['阶段','市场样本量','ASIN样本量','ASIN阶段份额'],['曝光',n(mi),n(ai),p(ai/mi)],['点击',n(mc),n(ac),p(ac/mc)],['订单',n(mo),n(ao),p(ao/mo)]]}
  ]);
  const p3=detailPage('搜索份额与关键词词群','全量与稳定词双面板，避免词池更替误导趋势',[
    {heading:'Share of Search',body:`曝光、点击、购买份额分别为 ${p(ai/mi)}、${p(ac/mc)}、${p(ao/mo)}。若 ASIN 转化不弱但曝光份额偏低，应优先排查索引、排名、库存和搜索结果页呈现。`},
    {heading:'月度全量与稳定词面板',body:'稳定词定义为每个已上传月份均出现的查询词；该面板用于趋势方向判断。',rows:[['月份','全量搜索量','全量订单','稳定词订单','稳定词数'],...months.map((m,i)=>[`${m}月`,n(sum(monthly[m].rows,'qc')),n(sum(monthly[m].rows,'ord')),n(sum(stableByMonth[i],'ord')),String(stable.length)])]},
    {heading:'词群管理',body:'完整产品类型词与修饰词分开管理：产品类型、尺寸、材质/风格、使用场景、季节和语言。只有与商品真实属性相符的词才进入 SEO 或受控测试。'}
  ]);
  const p4=detailPage('价格、履约与机会筛选','价格和配送均只作方向性背景',[
    {heading:'价格与履约环境',body:`点击/订单阶段的市场与 ASIN 价格中位数按词均值仅作背景：市场 ${price(all,'marketPrice')?`$${price(all,'marketPrice').toFixed(2)}`:'未提供'}，ASIN ${price(all,'asinPrice')?`$${price(all,'asinPrice').toFixed(2)}`:'未提供'}。市场中位价混合变体、套装和材质，不可直接得出“过高/过低”定价结论。`},
    {heading:'机会与风险',body:`机会词筛选规则：高需求、低购买份额、且 ASIN 订单/点击基数足够，并须先人工核对产品相关性。当前样本中前列词的订单基数需与实际搜索词、广告或库存状态交叉验证；不因高搜索量直接建议放量。`},
    {heading:'数据风险',body:`已上传 ${months.length} 个月份，共 ${all.length} 条月度记录、${new Set(all.map(r=>r.kw)).size} 个去重词。词数明显少于其他月份或月份缺失时，应在复盘中显式标注，不能按完整年度解释。`}
  ]);
  const p5=detailPage('建议与复盘节奏','将诊断转为可验证的运营动作',[
    {heading:'0-7 天：修复可见度',body:'检查库存、停售状态、Buy Box、类目节点、父子变体和核心词索引；以核心产品词是否可检索、曝光份额是否止跌作为验收。'},
    {heading:'第 2-3 周：优化搜索结果页',body:'以真实规格为约束，完善产品类型、尺寸和风格相关的标题、五点与图片表达；观察点击份额、ASIN CTR 与点击-购买 CVR，而不是只看搜索量。'},
    {heading:'第 4 周：受控扩词测试',body:'只对已人工确认相关的高需求低份额词做小范围 SEO 或广告测试。广告投入需要额外的广告报表，不能从 SQP 单独推导 ROAS、ACoS、出价或预算。'},
    {heading:'每月：双面板复盘',body:'同步追踪全量 Top100 和稳定词面板；记录每月词数、异常月份、曝光/点击/购买份额、核心词归因订单及稳定词数量。'}
  ]);
  const p6=detailPage('方法、来源与校验口径','数据质量和计算边界',[
    {heading:'来源校验',body:`本报告读取已上传的 ${months.length} 个文件；月份范围为 ${months[0]} 月至 ${months.at(-1)} 月。建议在上传前确认每份文件表头、ASIN、报告日期和文件月份一致，并识别重复文件或不同 ASIN。`,rows:[['月份','文件行数','校验提示'],...months.map(m=>[`${m}月`,String(monthly[m].rowCount),monthly[m].rowCount===100?'Top100 样本':'词数异常，需复核'])]},
    {heading:'计算口径',body:'绝对量先按关键词和月份汇总后计算加权比率；市场 CTR=市场点击/市场曝光，ASIN CTR=ASIN 点击/ASIN 曝光，点击-购买=订单/点击，阶段份额=ASIN 阶段计数/市场阶段计数。'},
    {heading:'范围限制',body:'月度 Top100 是采样词池，不是类目总盘；稳定词仅用于减少词池更替的干扰。关键词订单过小、价格字段混合变体、以及市场配送字段均应按低置信或方向性背景处理。'}
  ]);
  const JsPdf=await getJsPdf(); const pdf=new JsPdf({unit:'px',format:[1600,2260],compress:true}); const add=(c:HTMLCanvasElement)=>{pdf.addPage([1600,2260]);pdf.addImage(c.toDataURL('image/jpeg',0.94),'JPEG',0,0,1600,2260)};pdf.addImage(canvas.toDataURL('image/jpeg',0.94),'JPEG',0,0,1600,2260);[p2,p3,p4,p5,p6].forEach(add); pdf.save(`SQP_年度完整分析报告_${months[0]}-${months.at(-1)}月.pdf`);
}
