import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDollarSign, PackageCheck, TrendingUp } from 'lucide-react';

type Inputs = {
  dailySales: number; demandAdjust: number; budget: number; cpc: number; adCvr: number; organicShare: number;
  onHand: number; inbound: number; reserved: number; leadTime: number; safetyDays: number; reviewDays: number;
  contribution: number; returnRate: number; asinCvr: number; marketCvr: number; shareChange: number;
};

const initial: Inputs = {
  dailySales: 10.5, demandAdjust: 0, budget: 4500, cpc: 0.72, adCvr: 3.7, organicShare: 38,
  onHand: 280, inbound: 0, reserved: 0, leadTime: 45, safetyDays: 15, reviewDays: 30,
  contribution: 8, returnRate: 2, asinCvr: 3.2, marketCvr: 2.7, shareChange: 0.2,
};

const n = (value: number) => Math.max(0, Number(value) || 0);
const unit = (value: number) => `${Math.round(value).toLocaleString()} 件`;

function scenario(i: Inputs, multiplier: number) {
  const daily = n(i.dailySales) * (1 + i.demandAdjust / 100) * multiplier;
  const period = n(i.reviewDays);
  const adOrders = n(i.budget) / Math.max(0.01, n(i.cpc)) * (n(i.adCvr) / 100);
  const organicOrders = adOrders * n(i.organicShare) / Math.max(1, 100 - n(i.organicShare));
  const runRateOrders = daily * period;
  const forecast = (adOrders + organicOrders + runRateOrders) / 2;
  const inventory = n(i.onHand) + n(i.inbound) - n(i.reserved);
  const dailyForecast = forecast / Math.max(1, period);
  const beforeArrival = dailyForecast * n(i.leadTime);
  const safety = dailyForecast * n(i.safetyDays);
  const arrivalInventory = inventory - beforeArrival;
  const reorderPoint = beforeArrival + safety;
  const quantity = Math.max(0, dailyForecast * period + safety - arrivalInventory);
  return { forecast, inventory, beforeArrival, safety, arrivalInventory, reorderPoint, quantity };
}

export default function ReorderPanel() {
  const [inputs, setInputs] = useState<Inputs>(initial);
  const update = (key: keyof Inputs, value: string) => setInputs(prev => ({ ...prev, [key]: Number(value) }));
  const base = useMemo(() => scenario(inputs, 1), [inputs]);
  const checks = [
    { label: '广告后单件贡献利润为正', ok: inputs.contribution > 0, value: `$${inputs.contribution.toFixed(2)}` },
    { label: '退款/退货率不高于 5%', ok: inputs.returnRate <= 5, value: `${inputs.returnRate.toFixed(1)}%` },
    { label: '核心词 CVR 不低于大盘', ok: inputs.asinCvr >= inputs.marketCvr, value: `${inputs.asinCvr.toFixed(1)}% / ${inputs.marketCvr.toFixed(1)}%` },
    { label: '核心词购买份额未下降', ok: inputs.shareChange >= 0, value: `${inputs.shareChange >= 0 ? '+' : ''}${inputs.shareChange.toFixed(1)}pp` },
  ];
  const passed = checks.filter(item => item.ok).length;
  const needsOrder = base.inventory <= base.reorderPoint;
  const decision = !needsOrder ? '暂不下单，继续监控' : passed === 4 ? '建议正常返单' : passed >= 3 ? '建议小批返单 / 人工复核' : '暂缓放量，先修复产品指标';
  const decisionClass = !needsOrder ? 'text-slate-700 bg-slate-100 border-slate-200' : passed === 4 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200';
  const cases: Array<[string, number, string]> = [['保守', .9, '需求或转化低于预期'], ['基准', 1, '维持当前经营假设'], ['进取', 1.1, '搜索与自然单持续改善']];

  const fields: Array<[keyof Inputs, string, string, number]> = [
    ['dailySales', '近 4 周平均日销', '件/天', .1], ['demandAdjust', '基准需求调整', '%', 1], ['budget', '计划广告预算', '美元/周期', 100],
    ['cpc', '预期 CPC', '美元', .01], ['adCvr', '预期广告 CVR', '%', .1], ['organicShare', '自然订单占比', '%', 1],
    ['onHand', 'FBA / AWD / 海外仓可用', '件', 1], ['inbound', '已确认在途库存', '件', 1], ['reserved', '不可售、预留、移除', '件', 1],
    ['leadTime', '总补货周期', '天', 1], ['safetyDays', '安全库存天数', '天', 1], ['reviewDays', '下一批补货间隔', '天', 1],
  ];

  return <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
    <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border border-blue-900/70 text-white p-6 sm:p-8 shadow-xl overflow-hidden relative">
      <div className="absolute -right-10 -top-14 w-56 h-56 bg-cyan-400/10 rounded-full blur-2xl" />
      <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-5">
        <div><div className="text-cyan-300 text-[11px] tracking-[.2em] font-bold uppercase">New Product Replenishment Model</div><h2 className="text-2xl sm:text-3xl font-black mt-2">新品返单决策模型</h2><p className="text-sm text-blue-100/80 mt-2 max-w-2xl">先判断产品是否值得继续投放，再按未来销量、供应链周期与库存位置，计算保守、基准、进取三档返单量。</p></div>
        <div className="rounded-xl px-4 py-3 bg-white/10 border border-white/15 text-xs text-blue-100 max-w-xs"><b className="text-white">本地计算：</b> 所有输入与计算仅在浏览器中运行，不上传经营数据。</div>
      </div>
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_.8fr] gap-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-1"><PackageCheck className="w-5 h-5 text-blue-600" /><h3 className="font-bold text-slate-900">输入经营与库存假设</h3></div><p className="text-xs text-slate-500 mb-5">新品优先使用上架后近 4 周真实数据；各颜色、尺寸变体需分别测算。</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-4">
          {fields.map(([key, label, suffix, step], index) => <label key={key} className={index === 0 || index === 6 ? 'sm:col-span-2 lg:col-span-3 border-t border-slate-100 pt-4 mt-1' : ''}><span className="block text-xs font-semibold text-slate-600 mb-1.5">{label}<span className="text-slate-400 font-normal ml-1">{suffix}</span></span><input type="number" min="0" step={step} value={inputs[key]} onChange={event => update(key, event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" /></label>)}
        </div>
      </div>

      <div className="space-y-5">
        <div className={`rounded-2xl border p-5 ${decisionClass}`}><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider opacity-75"><TrendingUp className="w-4 h-4" />返单决策</div><div className="font-black text-2xl mt-3">{decision}</div><p className="text-sm mt-2 opacity-80">{needsOrder ? '库存位置已低于补货周期需求与安全库存之和。' : '库存仍能覆盖补货周期与安全库存，不建议提前压货。'}</p><div className="grid grid-cols-3 gap-2 mt-5"><Metric label="库存位置" value={unit(base.inventory)} /><Metric label="下单触发点" value={unit(base.reorderPoint)} /><Metric label="基准返单" value={unit(base.quantity)} /></div></div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5"><div className="flex items-center gap-2"><CircleDollarSign className="w-5 h-5 text-blue-600" /><h3 className="font-bold text-slate-900">产品健康门槛</h3></div><div className="mt-4 space-y-2.5">{checks.map(item => <div key={item.label} className="flex items-center justify-between gap-3 text-xs rounded-lg bg-slate-50 px-3 py-2.5"><span className="text-slate-600">{item.label}</span><span className={`font-bold flex items-center gap-1 ${item.ok ? 'text-emerald-600' : 'text-amber-600'}`}>{item.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}{item.value}</span></div>)}</div></div>
      </div>
    </div>

    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"><div className="p-5 sm:p-6 border-b border-slate-100"><h3 className="font-bold text-slate-900">未来销量与返单量情景</h3><p className="text-xs text-slate-500 mt-1">广告销量 = 广告预算 ÷ CPC × 广告 CVR；自然销量按自然订单占比推算，再与近期实际日销进行校准。</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50 text-slate-500 text-xs"><tr><th className="text-left px-6 py-3 font-semibold">情景</th><th className="text-right px-5 py-3 font-semibold">未来周期预测销量</th><th className="text-right px-5 py-3 font-semibold">到货前预计销量</th><th className="text-right px-5 py-3 font-semibold">预计到货时库存</th><th className="text-right px-6 py-3 font-semibold">建议返单量</th></tr></thead><tbody>{cases.map(([name, multiplier, note]) => { const data = scenario(inputs, multiplier); return <tr key={name} className="border-t border-slate-100"><td className="px-6 py-4"><b className="text-slate-800">{name}</b><span className="block text-xs text-slate-400 mt-0.5">{note}</span></td><td className="px-5 py-4 text-right text-slate-700">{unit(data.forecast)}</td><td className="px-5 py-4 text-right text-slate-700">{unit(data.beforeArrival)}</td><td className={`px-5 py-4 text-right font-medium ${data.arrivalInventory < 0 ? 'text-red-600' : 'text-slate-700'}`}>{unit(data.arrivalInventory)}</td><td className="px-6 py-4 text-right font-black text-blue-700">{unit(data.quantity)}</td></tr>})}</tbody></table></div><div className="px-6 py-4 text-xs text-slate-500 bg-slate-50 border-t border-slate-100"><b className="text-slate-700">计算逻辑：</b>返单量 = 预计到货至下一批可到货期间的预测销量 + 安全库存 − 预计到货时库存位置。</div></div>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-white/50 border border-white/40 p-2.5"><span className="block text-[10px] opacity-70">{label}</span><b className="block mt-1 text-sm">{value}</b></div>;
}
