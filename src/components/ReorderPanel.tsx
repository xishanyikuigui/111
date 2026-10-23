import { useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CircleDollarSign, Info, PackageCheck, SearchCheck, TrendingUp } from 'lucide-react';
import { SQPRow } from '../types';

type Props = { sqpRows: SQPRow[] };
type Inputs = {
  profitRate30: number; returnRate: number; rating: number; conversionRate30: number; acoas: number; acos: number;
  salesM1: number; salesM2: number; salesM3: number;
  adBudget: number; cpc: number; adCvr: number; adOrderShare: number;
  planningDays: number; safetyDays: number; totalStock: number;
};
const initialInputs: Inputs = {
  profitRate30: 18, returnRate: 3.5, rating: 4.3, conversionRate30: 12, acoas: 16, acos: 28,
  salesM1: 150, salesM2: 190, salesM3: 220, adBudget: 900, cpc: 0.9, adCvr: 10, adOrderShare: 35,
  planningDays: 30, safetyDays: 20, totalStock: 180,
};
const pct = (value: number) => (value * 100).toFixed(1) + '%';
const qty = (value: number) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(Math.max(0, value));

export default function ReorderPanel({ sqpRows }: Props) {
  const [inputs, setInputs] = useState<Inputs>(initialInputs);
  const update = (key: keyof Inputs, value: string) => {
    const numberValue = Number(value);
    setInputs((current) => ({ ...current, [key]: Number.isFinite(numberValue) ? Math.max(0, numberValue) : 0 }));
  };
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
    return {
      asinCvr: clicks ? orders / clicks : 0,
      marketCvr: marketClicks ? marketOrders / marketClicks : 0,
      ci: impWeight ? coreKeywords.reduce((sum, row) => sum + row.clickImpRatio * Math.max(row.imp, 1), 0) / impWeight : 0,
      bi: clickWeight ? coreKeywords.reduce((sum, row) => sum + row.buyClickRatio * Math.max(row.clk, 1), 0) / clickWeight : 0,
    };
  }, [coreKeywords]);
  const model = useMemo(() => {
    const factor = inputs.planningDays / 30;
    const historical = (inputs.salesM1 * 0.2 + inputs.salesM2 * 0.3 + inputs.salesM3 * 0.5) * factor;
    const adOrders = inputs.adBudget / Math.max(inputs.cpc, 0.01) * (inputs.adCvr / 100);
    const adImplied = adOrders / Math.max(inputs.adOrderShare / 100, 0.01) * factor;
    const futureSales = historical * 0.6 + adImplied * 0.4;
    const safetyStock = inputs.planningDays ? futureSales / inputs.planningDays * inputs.safetyDays : 0;
    const targetStock = futureSales + safetyStock;
    return { historical, adOrders, adImplied, futureSales, safetyStock, targetStock, orderQty: Math.max(0, targetStock - inputs.totalStock) };
  }, [inputs]);

  const sqpReady = coreKeywords.length >= 10;
  const productHealthy = inputs.profitRate30 > 0 && inputs.returnRate <= 5 && inputs.rating >= 4 && inputs.acoas <= inputs.profitRate30;
  const searchHealthy = sqpReady && core.asinCvr >= core.marketCvr && core.ci > 1 && core.bi > 1;
  const decision = !sqpReady ? '待补齐搜索绩效数据' : model.orderQty <= 0 ? '暂不需要返单' : productHealthy && searchHealthy ? '建议返单' : '需人工复核后返单';
  const field = (label: string, key: keyof Inputs, suffix: string, step = '0.1') => (
    <label className="block rounded-xl border border-slate-200 bg-white p-3">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className="mt-1 flex items-center gap-1">
        <input className="w-full bg-transparent text-lg font-semibold text-slate-900 outline-none" type="number" min="0" step={step} value={inputs[key]} onChange={(event) => update(key, event.target.value)} />
        <span className="text-xs text-slate-400">{suffix}</span>
      </div>
    </label>
  );
  return <div className="space-y-6">
    <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 p-5">
      <div className="flex items-start gap-3"><PackageCheck className="mt-0.5 h-6 w-6 text-blue-600" /><div><h2 className="text-lg font-bold text-slate-900">新品返单决策模型</h2><p className="mt-1 text-sm text-slate-600">基于近三个月销量、广告反推销量、搜索绩效核心词和安全库存，计算实际返单量。</p></div></div>
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="mb-3 flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-emerald-600" /><h3 className="font-semibold text-slate-900">近30天产品健康度</h3></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{field('近30天利润率', 'profitRate30', '%')}{field('退货率', 'returnRate', '%')}{field('产品评分', 'rating', '分')}{field('转化率', 'conversionRate30', '%')}{field('ACoAS', 'acoas', '%')}{field('ACOS', 'acos', '%')}</div></section>
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-violet-600" /><h3 className="font-semibold text-slate-900">最近3个月销量（人工填写）</h3></div><div className="grid grid-cols-3 gap-3">{field('第1个月（较早）', 'salesM1', '件', '1')}{field('第2个月', 'salesM2', '件', '1')}{field('最近1个月', 'salesM3', '件', '1')}</div><p className="mt-3 text-xs leading-5 text-slate-500">历史基准按 20% / 30% / 50% 加权，近期销量权重更高。</p></section>
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-orange-600" /><h3 className="font-semibold text-slate-900">广告反推销量（人工填写）</h3></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{field('广告预算', 'adBudget', '$', '1')}{field('广告 CPC', 'cpc', '$')}{field('广告转化率', 'adCvr', '%')}{field('广告出单占比', 'adOrderShare', '%')}</div><p className="mt-3 text-xs leading-5 text-slate-500">广告订单 = 预算 ÷ CPC × 广告转化率；广告反推总销量 = 广告订单 ÷ 广告出单占比。</p></section>
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="mb-3 flex items-center gap-2"><PackageCheck className="h-4 w-4 text-blue-600" /><h3 className="font-semibold text-slate-900">库存与补货周期</h3></div><div className="grid grid-cols-3 gap-3">{field('预测周期', 'planningDays', '天', '1')}{field('安全库存天数', 'safetyDays', '天', '1')}{field('当前总库存', 'totalStock', '件', '1')}</div><p className="mt-3 text-xs leading-5 text-slate-500">当前总库存请填可售、在途等可用于本周期销售的库存总和。</p></section>
    </div>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><SearchCheck className="h-5 w-5 text-blue-600" /><h3 className="font-semibold text-slate-900">搜索绩效核心关键词（自动生成 Top 10）</h3></div><span className={'rounded-full px-3 py-1 text-xs font-semibold ' + (sqpReady ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>{sqpReady ? '已提取 10 个核心词' : '有效词 ' + coreKeywords.length + ' / 10'}</span></div>
      {sqpRows.length === 0 ? <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800"><Info className="mr-2 inline h-4 w-4" />请先在“搜索查询绩效”页面上传数据；上传后此处将自动选出核心词。</div> : <>
        <div className="mt-4 grid gap-3 md:grid-cols-4"><Metric label="核心词 CVR" value={pct(core.asinCvr)} /><Metric label="核心词大盘 CVR" value={pct(core.marketCvr)} /><Metric label="Ci / 流量力" value={core.ci.toFixed(2) + (core.ci > 1 ? ' ✓' : ' ✕')} good={core.ci > 1} /><Metric label="Bi / 承接力" value={core.bi.toFixed(2) + (core.bi > 1 ? ' ✓' : ' ✕')} good={core.bi > 1} /></div>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-slate-200 text-xs text-slate-500"><tr><th className="pb-2">核心关键词</th><th className="pb-2">本品 CVR</th><th className="pb-2">大盘 CVR</th><th className="pb-2">Ci / 流量力</th><th className="pb-2">Bi / 承接力</th><th className="pb-2">判断</th></tr></thead><tbody>{coreKeywords.map((row) => { const pass = row.asinCVR >= row.marketCVR && row.clickImpRatio > 1 && row.buyClickRatio > 1; return <tr key={row.kw} className="border-b border-slate-100"><td className="py-2.5 font-medium text-slate-800">{row.kw}</td><td>{pct(row.asinCVR)}</td><td>{pct(row.marketCVR)}</td><td className={row.clickImpRatio > 1 ? 'text-emerald-700' : 'text-amber-700'}>{row.clickImpRatio.toFixed(2)}</td><td className={row.buyClickRatio > 1 ? 'text-emerald-700' : 'text-amber-700'}>{row.buyClickRatio.toFixed(2)}</td><td><span className={'rounded-full px-2 py-1 text-xs ' + (pass ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>{pass ? '漏斗更精准' : '待优化'}</span></td></tr>; })}</tbody></table></div>
        {!sqpReady && <p className="mt-3 text-xs text-amber-700">有效关键词不足 10 个，模型不会虚构数据；请上传更多搜索绩效记录。</p>}
      </>}
    </section>
    <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium text-blue-700">返单结论</p><h3 className="mt-1 text-2xl font-bold text-slate-900">{decision}</h3><p className="mt-1 text-sm text-slate-600">实际返单量 = 未来销量 + 安全库存 − 当前总库存</p></div><div className="rounded-2xl bg-blue-600 px-6 py-4 text-center text-white"><p className="text-xs text-blue-100">建议返单量</p><p className="mt-1 text-3xl font-bold">{qty(model.orderQty)} <span className="text-base">件</span></p></div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Stat label="近3月加权基准" value={qty(model.historical)} /><Stat label="广告反推总销量" value={qty(model.adImplied)} /><Stat label="未来销量预测" value={qty(model.futureSales)} /><Stat label="安全库存" value={qty(model.safetyStock)} /><Stat label="目标库存" value={qty(model.targetStock)} /></div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs"><span className={'rounded-full px-3 py-1 ' + (productHealthy ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>{productHealthy ? '产品经营指标通过' : '产品经营指标需复核'}</span><span className={'rounded-full px-3 py-1 ' + (searchHealthy ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>{searchHealthy ? '核心搜索漏斗通过' : '核心搜索漏斗待优化'}</span></div>
      <p className="mt-3 flex gap-2 text-xs leading-5 text-slate-600"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />未来销量 = 近3月加权基准 × 60% + 广告反推总销量 × 40%。修改经营假设后，返单量即时重算。</p>
    </section>
  </div>;
}
function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className={'mt-1 text-xl font-bold ' + (good === undefined ? 'text-slate-900' : good ? 'text-emerald-600' : 'text-amber-600')}>{value}</p></div>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-bold text-slate-900">{value} 件</p></div>;
}
