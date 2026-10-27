declare global { interface Window { jspdf?: { jsPDF: new (options?: object) => any } } }

type Row = { kw: string; qc: number; imp: number; clk: number; ord: number; ti: number; tc: number; to: number; buyShare: number };
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
  const JsPdf=await getJsPdf(); const pdf=new JsPdf({unit:'px',format:[1600,2260],compress:true}); pdf.addImage(canvas.toDataURL('image/jpeg',0.94),'JPEG',0,0,1600,2260); pdf.save(`SQP_年度趋势分析_${months[0]}-${months.at(-1)}月.pdf`);
}
