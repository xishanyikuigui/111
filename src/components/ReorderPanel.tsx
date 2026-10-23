import { useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CircleDollarSign, Info, PackageCheck, SearchCheck, TrendingUp } from 'lucide-react';
import { SQPRow } from '../types';

type Props = { sqpRows: SQPRow[] };
type InputValue = number | '';
type Inputs = {
  profitRate30: InputValue; returnRate: InputValue; rating: InputValue; conversionRate30: InputValue; acoas: InputValue; acos: InputValue;
  m1Budget: InputValue; m1Cpc: InputValue; m1AdCvr: InputValue; m1AdOrderShare: InputValue;
  m2Budget: InputValue; m2Cpc: InputValue; m2AdCvr: InputValue; m2AdOrderShare: InputValue;
  m3Budget: InputValue; m3Cpc: InputValue; m3AdCvr: InputValue; m3AdOrderShare: InputValue;
  m4Budget: InputValue; m4Cpc: InputValue; m4AdCvr: InputValue; m4AdOrderShare: InputValue;
  m5Budget: InputValue; m5Cpc: InputValue; m5AdCvr: InputValue; m5AdOrderShare: InputValue;
  safetyStock: InputValue; localStock: InputValue; inTransitStock: InputValue; fbaStock: InputValue;
};
const initialInputs: Inputs = {
  profitRate30: '', returnRate: '', rating: '', conversionRate30: '', acoas: '', acos: '',
  m1Budget: '', m1Cpc: '', m1AdCvr: '', m1AdOrderShare: '',
  m2Budget: '', m2Cpc: '', m2AdCvr: '', m2AdOrderShare: '',
  m3Budget: '', m3Cpc: '', m3AdCvr: '', m3AdOrderShare: '',
  m4Budget: '', m4Cpc: '', m4AdCvr: '', m4AdOrderShare: '',
  m5Budget: '', m5Cpc: '', m5AdCvr: '', m5AdOrderShare: '',
  safetyStock: '', localStock: '', inTransitStock: '', fbaStock: '',
};
const pct = (value: number) => (value * 100).toFixed(1) + '%';
const qty = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(Math.max(0, value));

export default function ReorderPanel({ sqpRows }: Props) {
  const [inputs, setInputs] = useState<Inputs>(initialInputs);
  const [listingMonth, setListingMonth] = useState('');
  const update = (key: keyof Inputs, raw: string) => {
    if (raw === '') { setInputs((current) => ({ ...current, [key]: '' })); return; }
    const value = Number(raw);
    setInputs((current) => ({ ...current, [key]: Number.isFinite(value) ? Math.max(0, value) : '' }));
  };
  const filled = (...keys: (keyof Inputs)[]) => keys.every((key) => inputs[key] !== '');
  const field = (label: string, key: keyof Inputs, suffix: string, step = '0.1') => (
    <label className="block rounded-xl border border-slate-200 bg-white p-3">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className="mt-1 flex items-center gap-1">
        <input className="w-full bg-transparent text-lg font-semibold text-slate-900 outline-none" type="number" min="0" step={step} placeholder="待填写" value={inputs[key]} onChange={(event) => update(key, event.target.value)} />
        <span className="text-xs text-slate-400">{suffix}</span>
      </div>
    </label>
  );
  const coreKeywords = useMemo(() => [...sqpRows]
    .filter((row) => row.kw?.trim() && row.imp > 0 && row.clk > 0)
    .sort((a, b) => b.ord * 100 + b.clk + b.qc * 0.01 - (a.ord * 100 + a.clk + a.qc * 0.01))
    .slice(0, 10), [sqpRows]);
  const core = useMemo(() => {
    const clicks = coreKeywords.reduce((sum, row) => sum + row.clk, 0);
    const orders = coreKeywords.reduce((sum, row) => sum + row.ord, 0);
    const marketClicks = coreKeywords.reduce((sum, row) => sum + row.tc, 0);
    const marketOrders = coreKeywords.reduce((sum, row) => sum + row.to, 0);
    const impWeight = coreKeywords.reduce((sum, row) => sum + Math.max(row.imp, 1), 0);
    const clickWeight = coreKeywords.reduce((sum, row) => sum + Math.max(row.clk, 1), 0);
    return { asinCvr: clicks ? orders / clicks : 0, marketCvr: marketClicks ? marketOrders / marketClicks : 0,
      ci: impWeight ? coreKeywords.reduce((sum, row) => sum + row.clickImpRatio * Math.max(row.imp, 1), 0) / impWeight : 0,
      bi: clickWeight ? coreKeywords.reduce((sum, row) => sum + row.buyClickRatio * Math.max(row.clk, 1), 0) / clickWeight : 0 };
  }, [coreKeywords]);
  const model = useMemo(() => {
    const monthSales = (budget: keyof Inputs, cpc: keyof Inputs, cvr: keyof Inputs, share: keyof Inputs) => {
      if (!filled(budget, cpc, cvr, share) || Number(inputs[cpc]) <= 0 || Number(inputs[share]) <= 0) return { clicks: null, sales: null };
      const clicks = Number(inputs[budget]) / Number(inputs[cpc]);
      return { clicks, sales: clicks * (Number(inputs[cvr]) / 100) / (Number(inputs[share]) / 100) };
    };
    const month1 = monthSales('m1Budget', 'm1Cpc', 'm1AdCvr', 'm1AdOrderShare');
    const month2 = monthSales('m2Budget', 'm2Cpc', 'm2AdCvr', 'm2AdOrderShare');
    const month3 = monthSales('m3Budget', 'm3Cpc', 'm3AdCvr', 'm3AdOrderShare');
    const month4 = monthSales('m4Budget', 'm4Cpc', 'm4AdCvr', 'm4AdOrderShare');
    const month5 = monthSales('m5Budget', 'm5Cpc', 'm5AdCvr', 'm5AdOrderShare');
    const inventoryReady = filled('localStock', 'inTransitStock', 'fbaStock');
    const totalStock = inventoryReady ? Number(inputs.localStock) + Number(inputs.inTransitStock) + Number(inputs.fbaStock) : null;
    const orderReady = month1.sales !== null && month2.sales !== null && totalStock !== null && filled('safetyStock');
    const targetStock = orderReady ? month1.sales! + month2.sales! + Number(inputs.safetyStock) : null;
    return { month1, month2, month3, month4, month5, totalStock, targetStock, orderQty: orderReady ? Math.max(0, targetStock! - totalStock!) : null };
  }, [inputs]);
  const sqpReady = coreKeywords.length >= 10;
  const productInputsReady = filled('profitRate30', 'returnRate', 'rating', 'acoas');
  const productHealthy = productInputsReady && Number(inputs.profitRate30) > 0 && Number(inputs.returnRate) <= 5 && Number(inputs.rating) >= 4 && Number(inputs.acoas) <= Number(inputs.profitRate30);
  const searchHealthy = sqpReady && core.asinCvr >= core.marketCvr && core.ci > 1 && core.bi > 1;
  const decision = model.orderQty === null ? '待补齐返单测算字段' : !sqpReady ? '待补齐搜索绩效数据' : model.orderQty <= 0 ? '暂不需要返单' : productHealthy && searchHealthy ? '建议返单' : '需人工复核后返单';
  const monthLabels = useMemo(() => Array.from({ length: 5 }, (_, index) => {
    if (!listingMonth) return index === 0 ? '第1月（上架月）' : '第' + (index + 1) + '月';
    const [year, month] = listingMonth.split('-').map(Number);
    const date = new Date(year, month - 1 + index, 1);
    return date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + (index === 0 ? '（上架月）' : '');
  }), [listingMonth]);
  const tableInput = (key: keyof Inputs, suffix: string, step = '0.1') => <div className="flex items-center justify-center gap-1"><input className="w-20 bg-transparent text-center font-semibold text-slate-900 outline-none placeholder:text-slate-300" type="number" min="0" step={step} placeholder="—" value={inputs[key]} onChange={(event) => update(key, event.target.value)} /><span className="text-xs text-slate-400">{suffix}</span></div>;
  return <div className="space-y-6">
    <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 p-5"><div className="flex items-start gap-3"><PackageCheck className="mt-0.5 h-6 w-6 text-blue-600" /><div><h2 className="text-lg font-bold text-slate-900">新品返单决策模型</h2><p className="mt-1 text-sm text-slate-600">依据广告反推的月度销量、实际库存和安全库存，计算本轮需下单量。未填写的数据保持为空，不使用示例值。</p></div></div></div>
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="mb-3 flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-emerald-600" /><h3 className="font-semibold text-slate-900">近30天产品健康度（有实际数据再填写）</h3></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{field('近30天利润率', 'profitRate30', '%')}{field('退货率', 'returnRate', '%')}{field('产品评分', 'rating', '分')}{field('转化率', 'conversionRate30', '%')}{field('ACoAS', 'acoas', '%')}{field('ACOS', 'acos', '%')}</div></section>
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-orange-600" /><h3 className="font-semibold text-slate-900">广告反推销量（人工填写）</h3></div><label className="flex items-center gap-2 text-sm text-slate-600">产品上架月份<input className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-900 outline-none" type="month" value={listingMonth} onChange={(event) => setListingMonth(event.target.value)} /></label></div><div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="min-w-[980px] w-full border-collapse text-center text-sm"><thead className="bg-slate-100 text-slate-700"><tr><th className="border-b border-r border-slate-200 p-3 text-left">实际广告花费 / 月份</th>{monthLabels.map((label) => <th key={label} className="border-b border-slate-200 p-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-200"><tr><th className="border-r border-slate-200 bg-slate-50 p-3 text-left font-medium">CPC</th>{['m1Cpc', 'm2Cpc', 'm3Cpc', 'm4Cpc', 'm5Cpc'].map((key) => <td key={key} className="p-2">{tableInput(key as keyof Inputs, '$')}</td>)}</tr><tr><th className="border-r border-slate-200 bg-slate-50 p-3 text-left font-medium">广告点击（自动计算）</th>{[model.month1, model.month2, model.month3, model.month4, model.month5].map((month, index) => <td key={index} className="p-3 font-semibold text-slate-700">{qty(month.clicks)}</td>)}</tr><tr><th className="border-r border-slate-200 bg-slate-50 p-3 text-left font-medium">广告转化率</th>{['m1AdCvr', 'm2AdCvr', 'm3AdCvr', 'm4AdCvr', 'm5AdCvr'].map((key) => <td key={key} className="p-2">{tableInput(key as keyof Inputs, '%')}</td>)}</tr><tr><th className="border-r border-slate-200 bg-slate-50 p-3 text-left font-medium">广告订单占比</th>{['m1AdOrderShare', 'm2AdOrderShare', 'm3AdOrderShare', 'm4AdOrderShare', 'm5AdOrderShare'].map((key) => <td key={key} className="p-2">{tableInput(key as keyof Inputs, '%')}</td>)}</tr><tr><th className="border-r border-slate-200 bg-slate-50 p-3 text-left font-medium">目标广告预算</th>{['m1Budget', 'm2Budget', 'm3Budget', 'm4Budget', 'm5Budget'].map((key) => <td key={key} className="p-2">{tableInput(key as keyof Inputs, '$', '1')}</td>)}</tr><tr className="bg-blue-50"><th className="border-r border-slate-200 p-3 text-left font-semibold text-blue-800">预计销量（自动计算）</th>{[model.month1, model.month2, model.month3, model.month4, model.month5].map((month, index) => <td key={index} className="p-3 text-base font-bold text-blue-700">{qty(month.sales)} 件</td>)}</tr></tbody></table></div><p className="mt-3 text-xs leading-5 text-slate-500">月度销量 = 广告预算 ÷ CPC × 广告转化率 ÷ 广告订单占比。五个月从产品上架月开始顺延；本轮下单量仅使用第一、第二月销量。</p></section>
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-violet-600" /><h3 className="font-semibold text-slate-900">库存与补货周期</h3></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{field('安全库存', 'safetyStock', '件', '1')}{field('本地库存', 'localStock', '件', '1')}{field('在途库存', 'inTransitStock', '件', '1')}{field('FBA库存', 'fbaStock', '件', '1')}</div></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><SearchCheck className="h-5 w-5 text-blue-600" /><h3 className="font-semibold text-slate-900">搜索绩效核心关键词（自动生成 Top 10）</h3></div><span className={'rounded-full px-3 py-1 text-xs font-semibold ' + (sqpReady ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>{sqpReady ? '已提取 10 个核心词' : '有效词 ' + coreKeywords.length + ' / 10'}</span></div>
      {sqpRows.length === 0 ? <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800"><Info className="mr-2 inline h-4 w-4" />请先在“搜索查询绩效”页面上传数据；上传后此处将自动选出核心词。</div> : <><div className="mt-4 grid gap-3 md:grid-cols-4"><Metric label="核心词 CVR" value={pct(core.asinCvr)} /><Metric label="核心词大盘 CVR" value={pct(core.marketCvr)} /><Metric label="Ci / 流量力" value={core.ci.toFixed(2) + (core.ci > 1 ? ' ✓' : ' ✕')} good={core.ci > 1} /><Metric label="Bi / 承接力" value={core.bi.toFixed(2) + (core.bi > 1 ? ' ✓' : ' ✕')} good={core.bi > 1} /></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-slate-200 text-xs text-slate-500"><tr><th className="pb-2">核心关键词</th><th className="pb-2">本品 CVR</th><th className="pb-2">大盘 CVR</th><th className="pb-2">Ci / 流量力</th><th className="pb-2">Bi / 承接力</th><th className="pb-2">判断</th></tr></thead><tbody>{coreKeywords.map((row) => { const pass = row.asinCVR >= row.marketCVR && row.clickImpRatio > 1 && row.buyClickRatio > 1; return <tr key={row.kw} className="border-b border-slate-100"><td className="py-2.5 font-medium text-slate-800">{row.kw}</td><td>{pct(row.asinCVR)}</td><td>{pct(row.marketCVR)}</td><td className={row.clickImpRatio > 1 ? 'text-emerald-700' : 'text-amber-700'}>{row.clickImpRatio.toFixed(2)}</td><td className={row.buyClickRatio > 1 ? 'text-emerald-700' : 'text-amber-700'}>{row.buyClickRatio.toFixed(2)}</td><td><span className={'rounded-full px-2 py-1 text-xs ' + (pass ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>{pass ? '漏斗更精准' : '待优化'}</span></td></tr>; })}</tbody></table></div>{!sqpReady && <p className="mt-3 text-xs text-amber-700">有效关键词不足 10 个，模型不会虚构数据；请上传更多搜索绩效记录。</p>}</>}</section>
    <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium text-blue-700">返单结论</p><h3 className="mt-1 text-2xl font-bold text-slate-900">{decision}</h3><p className="mt-1 text-sm text-slate-600">需下单量 = 第一月销量 + 第二月销量 + 安全库存 −（本地库存 + 在途库存 + FBA库存）</p></div><div className="rounded-2xl bg-blue-600 px-6 py-4 text-center text-white"><p className="text-xs text-blue-100">建议下单量</p><p className="mt-1 text-3xl font-bold">{qty(model.orderQty)} <span className="text-base">件</span></p></div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Stat label="第一月销量" value={model.month1.sales} /><Stat label="第二月销量" value={model.month2.sales} /><Stat label="安全库存" value={filled('safetyStock') ? Number(inputs.safetyStock) : null} /><Stat label="库存合计" value={model.totalStock} /><Stat label="覆盖目标库存" value={model.targetStock} /></div><div className="mt-4 flex flex-wrap gap-2 text-xs"><span className={'rounded-full px-3 py-1 ' + (productHealthy ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>{productHealthy ? '产品经营指标通过' : '产品经营指标待补齐或需复核'}</span><span className={'rounded-full px-3 py-1 ' + (searchHealthy ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>{searchHealthy ? '核心搜索漏斗通过' : '核心搜索漏斗待优化'}</span></div><p className="mt-3 flex gap-2 text-xs leading-5 text-slate-600"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />只有填齐第一、第二月的广告参数、安全库存及三类库存后，系统才会输出需下单量。</p></section>
  </div>;
}
function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className={'mt-1 text-xl font-bold ' + (good === undefined ? 'text-slate-900' : good ? 'text-emerald-600' : 'text-amber-600')}>{value}</p></div>; }
function Stat({ label, value }: { label: string; value: number | null }) { return <div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-bold text-slate-900">{qty(value)} 件</p></div>; }
