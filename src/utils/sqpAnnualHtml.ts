import { SQPRow } from '../types';

type MonthBucket = { fileName: string; rowCount: number; rows: SQPRow[]; period?: string };
type MonthlyData = Record<number, MonthBucket>;
type MonthlySummary = { label: string; rows: SQPRow[]; qc: number; ti: number; imp: number; tc: number; clk: number; to: number; ord: number };

const sum = (rows: SQPRow[], key: keyof SQPRow) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
const pct = (value: number) => `${(Number.isFinite(value) ? value * 100 : 0).toFixed(2)}%`;
const num = (value: number) => Math.round(value || 0).toLocaleString('en-US');
const esc = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]!));

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Browser implementation of the annual SQP portion of amazon-sqp-ad-report.
 * It intentionally does not infer advertising conclusions when ad CSVs are absent.
 */
export function downloadSqpAnnualHtml(monthly: MonthlyData) {
  const months = Object.entries(monthly)
    .map(([month, bucket]) => ({ month: Number(month), bucket, order: bucket.period || `9999-${String(month).padStart(2, '0')}` }))
    .sort((a, b) => a.order.localeCompare(b.order));
  if (!months.length) throw new Error('请先上传月度 SQP 文件。');

  const labels = months.map(({ month, bucket }) => bucket.period || `${month}月`);
  const summaries: MonthlySummary[] = months.map(({ month, bucket }) => ({
    label: bucket.period || `${month}月`, rows: bucket.rows,
    qc: sum(bucket.rows, 'qc'), ti: sum(bucket.rows, 'ti'), imp: sum(bucket.rows, 'imp'),
    tc: sum(bucket.rows, 'tc'), clk: sum(bucket.rows, 'clk'), to: sum(bucket.rows, 'to'), ord: sum(bucket.rows, 'ord'),
  }));
  const all = summaries.flatMap(item => item.rows);
  const byKeyword = new Map<string, { kw: string; months: number; qc: number; ti: number; imp: number; tc: number; clk: number; to: number; ord: number; firstShare: number; lastShare: number }>();
  summaries.forEach((summary, index) => summary.rows.forEach(row => {
    const key = row.kw.trim().toLowerCase();
    const current = byKeyword.get(key) || { kw: row.kw, months: 0, qc: 0, ti: 0, imp: 0, tc: 0, clk: 0, to: 0, ord: 0, firstShare: 0, lastShare: 0 };
    current.months += 1; current.qc += row.qc || 0; current.ti += row.ti || 0; current.imp += row.imp || 0;
    current.tc += row.tc || 0; current.clk += row.clk || 0; current.to += row.to || 0; current.ord += row.ord || 0;
    const share = row.to > 0 ? row.ord / row.to : row.buyShare || 0;
    if (index === 0) current.firstShare = share;
    if (index === summaries.length - 1) current.lastShare = share;
    byKeyword.set(key, current);
  }));
  const keywords = [...byKeyword.values()];
  const stable = keywords.filter(item => item.months === summaries.length);
  const topOrders = [...keywords].sort((a, b) => b.ord - a.ord).slice(0, 15);
  const opportunities = [...keywords]
    .filter(item => item.qc > 0 && item.to > 0 && item.ord > 0)
    .filter(item => (item.ord / item.to) < 0.03 && (item.ord / Math.max(item.clk, 1)) >= (item.to / Math.max(item.tc, 1)))
    .sort((a, b) => b.qc - a.qc).slice(0, 15);
  const risks = stable.filter(item => item.firstShare > 0).sort((a, b) => (a.lastShare / a.firstShare) - (b.lastShare / b.firstShare)).slice(0, 12);

  const category = new Map<string, number>();
  keywords.forEach(item => {
    const root = item.kw.toLowerCase().split(/\s+/).find(word => word && !['for', 'with', 'and', 'the', 'of', 'to', 'in'].includes(word));
    if (root) category.set(root, (category.get(root) || 0) + item.ord);
  });
  const categories = [...category.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const totals = summaries.reduce((acc, item) => ({ qc: acc.qc + item.qc, ti: acc.ti + item.ti, imp: acc.imp + item.imp, tc: acc.tc + item.tc, clk: acc.clk + item.clk, to: acc.to + item.to, ord: acc.ord + item.ord }), { qc: 0, ti: 0, imp: 0, tc: 0, clk: 0, to: 0, ord: 0 });
  const first = summaries[0], last = summaries.at(-1)!;
  const firstShare = first.to ? first.ord / first.to : 0;
  const lastShare = last.to ? last.ord / last.to : 0;
  const asin = all.find(row => row.asin && row.asin !== '未标注')?.asin || '未标注 ASIN';
  const row = (cells: string[]) => `<tr>${cells.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
  const monthlyRows = summaries.map(item => row([esc(item.label), num(item.rows.length), num(item.qc), num(item.ord), pct(item.imp / Math.max(item.ti, 1)), pct(item.clk / Math.max(item.tc, 1)), pct(item.ord / Math.max(item.to, 1))])).join('');
  const keywordRows = topOrders.map((item, index) => row([String(index + 1), esc(item.kw), String(item.months), num(item.qc), num(item.ord), pct(item.ord / Math.max(item.to, 1)), pct(item.ord / Math.max(item.clk, 1))])).join('');
  const opportunityRows = opportunities.length ? opportunities.map(item => row([esc(item.kw), num(item.qc), num(item.ord), pct(item.ord / Math.max(item.to, 1)), pct(item.ord / Math.max(item.clk, 1)), '人工确认相关性后，小预算测试'])).join('') : row(['—', '—', '—', '—', '—', '当前样本未筛出满足条件的机会词']);
  const riskRows = risks.length ? risks.map(item => row([esc(item.kw), pct(item.firstShare), pct(item.lastShare), pct(item.lastShare - item.firstShare), '核验排名、库存、评价与索引'])).join('') : row(['—', '—', '—', '—', '稳定词不足，暂不作趋势风险判断']);
  const categoryRows = categories.map(([name, order]) => row([esc(name), num(order)])).join('');

  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SQP 年度搜索绩效分析 · ${esc(asin)}</title><style>
  :root{--ink:#173b55;--blue:#1483ba;--muted:#64748b;--line:#dce5ec;--bg:#f4f8fb;--card:#fff;--good:#12725c;--risk:#b54437}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:"Microsoft YaHei",Arial,sans-serif;line-height:1.6}.wrap{max-width:1180px;margin:auto;padding:30px 18px 60px}.hero{background:linear-gradient(120deg,#0d314a,#176994);border-radius:18px;padding:32px;color:#fff}.hero h1{margin:0;font-size:28px}.hero p{margin:10px 0 0;color:#d9edf8}.notice{background:#fff5e8;border:1px solid #f6c979;color:#914c00;padding:12px 16px;border-radius:10px;margin:18px 0}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0}.kpi,.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;box-shadow:0 2px 8px #173b5508}.kpi b{display:block;font-size:23px;color:var(--blue)}.kpi span{font-size:12px;color:var(--muted)}.card{margin-top:16px}.card h2{font-size:19px;margin:0 0 10px;border-left:4px solid var(--blue);padding-left:10px}.card h3{font-size:15px;margin:20px 0 6px;color:#225e80}table{border-collapse:collapse;width:100%;font-size:12px;overflow:hidden}th,td{padding:8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{background:#eaf5fa;color:#17455f}tr:nth-child(even) td{background:#fbfdff}.good{color:var(--good);font-weight:700}.risk{color:var(--risk);font-weight:700}.chips{display:flex;gap:8px;flex-wrap:wrap}.chip{background:#edf6fa;color:#176994;border-radius:999px;padding:4px 10px;font-size:12px}@media(max-width:760px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.wrap{padding:14px}.hero{padding:22px}table{font-size:11px}}
  </style></head><body><main class="wrap"><section class="hero"><h1>📊 ${esc(asin)} · 年度搜索绩效分析</h1><p>数据范围：${esc(labels[0])} 至 ${esc(labels.at(-1))}，共 ${labels.length} 个月｜月度 Top100 SQP 样本</p></section>
  <div class="notice"><b>广告交叉分析未生成：</b>本次仅上传 SQP 月度文件，未包含近 30 天“广告活动 / 搜索词 / 投放”CSV。因此不输出 ROAS、ACoS、出价或预算结论。</div>
  <section class="grid"><div class="kpi"><b>${num(totals.qc)}</b><span>年度覆盖词搜索量</span></div><div class="kpi"><b>${num(totals.ord)}</b><span>ASIN 搜索归因订单</span></div><div class="kpi"><b>${pct(totals.ord / Math.max(totals.to,1))}</b><span>购买份额（加权）</span></div><div class="kpi"><b>${stable.length} / ${keywords.length}</b><span>稳定词 / 去重词</span></div></section>
  <section class="card"><h2>① 年度总览与月度趋势</h2><p>购买份额由 <b>${pct(firstShare)}</b>（${esc(first.label)}）变化至 <b>${pct(lastShare)}</b>（${esc(last.label)}）。全量 Top100 词池每月会更替，因此趋势判断应结合稳定词面板，不能把词池变动直接解读为类目需求变化。</p><table><thead><tr><th>月份</th><th>词数</th><th>搜索量</th><th>ASIN订单</th><th>曝光份额</th><th>点击份额</th><th>购买份额</th></tr></thead><tbody>${monthlyRows}</tbody></table></section>
  <section class="card"><h2>② 核心关键词趋势</h2><p>按年度 ASIN 订单排序。词级 CVR 在订单基数很小时仅作方向性参考。</p><table><thead><tr><th>#</th><th>关键词</th><th>出现月数</th><th>累计搜索量</th><th>ASIN订单</th><th>购买份额</th><th>ASIN CVR</th></tr></thead><tbody>${keywordRows}</tbody></table></section>
  <section class="card"><h2>③ 搜索漏斗与 ④ Share of Search</h2><table><thead><tr><th>阶段</th><th>市场总量</th><th>ASIN 总量</th><th>ASIN 份额</th><th>市场效率</th><th>ASIN 效率</th></tr></thead><tbody>${row(['曝光',num(totals.ti),num(totals.imp),pct(totals.imp/Math.max(totals.ti,1)),'—','—'])}${row(['点击',num(totals.tc),num(totals.clk),pct(totals.clk/Math.max(totals.tc,1)),pct(totals.tc/Math.max(totals.ti,1)),pct(totals.clk/Math.max(totals.imp,1))])}${row(['购买',num(totals.to),num(totals.ord),pct(totals.ord/Math.max(totals.to,1)),pct(totals.to/Math.max(totals.tc,1)),pct(totals.ord/Math.max(totals.clk,1))])}</tbody></table><p>若 ASIN 点击-购买效率不弱、但曝光或点击份额偏低，先核验索引、排名、库存、Buy Box 和搜索结果页展示，而不是直接假定详情页转化问题。</p></section>
  <section class="card"><h2>⑤ 关键词聚类</h2><p>词根按关键词首个非停用词作轻量归类，用于识别订单集中的产品词群；并非完整语义分类。</p><div class="chips">${categories.map(([name, order]) => `<span class="chip">${esc(name)} · ${num(order)} 单</span>`).join('')}</div><table><thead><tr><th>词根</th><th>年度 ASIN 订单</th></tr></thead><tbody>${categoryRows}</tbody></table></section>
  <section class="card"><h2>⑥ 价格与履约背景</h2><p>月度导出的市场和 ASIN 价格中位数可能混入变体、套装、材质与不同规格，仅作方向性背景，不可单独得出“价格过高/过低”的结论。配送字段若属于市场口径，也不能推断为本 ASIN 的履约劣势。</p></section>
  <section class="card"><h2>⑦ 机会与风险</h2><h3>高需求、低购买份额且转化不弱的候选词</h3><table><thead><tr><th>关键词</th><th>搜索量</th><th>ASIN订单</th><th>购买份额</th><th>ASIN CVR</th><th>建议</th></tr></thead><tbody>${opportunityRows}</tbody></table><h3>稳定词份额下滑风险</h3><table><thead><tr><th>关键词</th><th>首月份额</th><th>末月份额</th><th>变化</th><th>建议</th></tr></thead><tbody>${riskRows}</tbody></table></section>
  <section class="card"><h2>⑧ 综合执行建议与口径</h2><ol><li><b>先止跌：</b>核验核心词索引、排名、库存、Buy Box 和评价变化，优先恢复曝光与点击份额。</li><li><b>再优化：</b>仅围绕商品真实属性补充产品类型、尺寸、材质/风格及场景相关表达。</li><li><b>受控测试：</b>机会词须先人工确认相关性，再做小范围 SEO 或广告测试；广告预算结论需使用广告报表交叉验证。</li><li><b>月度复盘：</b>同时追踪全量 Top100 与稳定词面板，记录词池更替、曝光份额、点击份额、购买份额及核心词订单。</li></ol><p><b>方法限制：</b>绝对量先汇总后计算加权比率；稳定词指每个已上传月份均出现的词。累计搜索量仅代表月度 Top100 样本累计，不代表完整类目市场。</p></section>
  </main></body></html>`;
  downloadText(`SQP_年度完整分析报告_${labels[0]}-${labels.at(-1)}.html`, html);
}
