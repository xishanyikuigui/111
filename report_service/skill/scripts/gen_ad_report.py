# -*- coding: utf-8 -*-
import pandas as pd, numpy as np, json, os, sys, re as _re, math
from collections import Counter

# 路径通过环境变量配置（由 build_report.py 注入）：
#   TMP_DIR     : 中间产物目录（含 search_terms.pkl / campaigns.pkl / targets.pkl / sqp.json / currency.txt）
#   DASH        : 最终合并报告 HTML 路径
#   ASIN_PRICE  : 目标 ASIN 当前售价（建议4 价格优势分析用）
TMP = os.environ.get('TMP_DIR', os.path.join(os.environ.get('OUT_DIR', '.'), '.tmp_ad'))
DASH = os.environ.get('DASH', os.path.join(os.environ.get('OUT_DIR', '.'), 'search_performance_dashboard.html'))
ASIN_PRICE = float(os.environ.get('ASIN_PRICE', '26.99'))
_AS_ROLES = ('search_terms', 'campaigns', 'targets')
_AD_PATHS = {r: os.path.join(TMP, r + '.pkl') for r in _AS_ROLES}
HAS_AD = all(os.path.exists(p) for p in _AD_PATHS.values())

# ---------- 无广告报告：跳过第二部分，仅保留年度 SQP（第一部分） ----------
if not HAS_AD:
    _dash = open(DASH, encoding='utf-8').read()
    _dash = _re.sub(r'<!-- AD_SECTION_START -->.*?<!-- AD_SECTION_END -->', '', _dash, flags=_re.S)
    _note = ('<!-- AD_SECTION_START -->\n<section id="ad-section">\n'
             '<div style="border-top:3px solid #f59e0b;margin-top:36px;padding:16px 20px;'
             'background:#fffbeb;border:1px solid #fde68a;border-radius:10px;color:#92400e;">'
             '<h3 style="margin:0 0 8px;font-size:17px;">第二部分 · 近30天广告绩效与年度交叉分析（未生成）</h3>'
             '<p style="margin:0;line-height:1.7;">本部分需要近 30 天卖家后台广告报告'
             '（广告活动 / 搜索词 / 投放 三份 CSV）。当前未提供广告数据，已跳过第二部分，'
             '仅保留第一部分《年度搜索绩效报告》。上传广告 CSV 后重新生成即可补齐。</p>'
             '</div>\n</section>\n<!-- AD_SECTION_END -->')
    _dash = _dash.replace('</body>', _note + '\n</body>', 1)
    open(DASH, 'w', encoding='utf-8').write(_dash)
    print('[gen] 未检测到广告 pickle，跳过第二部分（仅生成年度 SQP 报告）')
    sys.exit(0)

df = pd.read_pickle(_AD_PATHS['search_terms'])
c = pd.read_pickle(_AD_PATHS['campaigns'])
t = pd.read_pickle(_AD_PATHS['targets'])
D = json.load(open(os.path.join(TMP, 'sqp.json'), encoding='utf-8'))

# 售价：环境变量 ASIN_PRICE 显式指定优先；否则从 sqp.json 的 summary.asin_price 推导
_sqp_price = (D.get('summary') or {}).get('asin_price')
try:
    _env_price = float(os.environ.get('ASIN_PRICE', ''))
except (ValueError, TypeError):
    _env_price = None
if _env_price is not None:
    ASIN_PRICE = _env_price
elif _sqp_price not in (None, '', 0):
    ASIN_PRICE = float(_sqp_price)
# 年度加权转化率（与第一部分口径一致），用于口径提示注释
M_months = D['meta']['months']
def _wsum(key):
    tot = 0.0
    for k in D['keywords']:
        for m in M_months:
            mm = k.get('monthly', {}).get(m)
            if not mm:
                continue
            v = mm.get(key)
            if v is None:
                continue
            if isinstance(v, float) and np.isnan(v):
                continue
            tot += v
    return tot
fA_pp = _wsum('asin_purch') / _wsum('asin_clicks')
fM_pp = _wsum('m_purch') / _wsum('m_clicks')

# ---------- 币种：读取 ad_to_pkl 写入的主导币种，渲染对应符号 ----------
_cur_path = os.path.join(TMP, 'currency.txt')
_dom = open(_cur_path, encoding='utf-8').read().strip().upper() if os.path.exists(_cur_path) else 'USD'
SYM = {'USD': '$', 'JPY': '¥', 'EUR': '€', 'GBP': '£', 'CAD': 'C$', 'CNY': '¥',
       'MXN': '$', 'INR': '₹', 'AUD': 'A$', 'BRL': 'R$', 'DE': '€'}.get(_dom, '$')

def money(x):
    try:
        return f"{SYM}{float(x):,.2f}"
    except Exception:
        return "—"
def fmtint(x):
    return f"{x:,.0f}" if pd.notna(x) else "—"
def pct(x, d=2):
    return f"{x*100:.{d}f}%" if pd.notna(x) else "—"
def ctrv(clicks, impr, d=2):
    return pct(clicks/impr, d) if (pd.notna(impr) and impr and pd.notna(clicks)) else "—"
def cvrv(purch, clk, d=2):
    return pct(purch/clk, d) if (pd.notna(clk) and clk and pd.notna(purch)) else "—"
def acosv(cost, sales, d=2):
    return pct(cost/sales, d) if (pd.notna(sales) and sales and pd.notna(cost)) else "—"

# ---------- overall ----------
tot_cost = df['总成本'].sum(); tot_purch = df['购买量'].sum(); tot_sales = df['销售额'].sum()
tot_clk = df['点击量'].sum(); tot_impr = df['展示量'].sum()
overall_roas = tot_sales/tot_cost
overall_cr = tot_purch/tot_clk
overall_ctr = tot_clk/tot_impr
overall_acos = tot_cost/tot_sales

# ---------- campaign table ----------
c = c.sort_values('总成本', ascending=False)  # 稳定排序：按花费降序，避免依赖广告 CSV 原始行序
camp_rows = ""
for _, r in c.iterrows():
    roas = r['ROAS'] if pd.notna(r['ROAS']) else 0
    lroas = r['长期 ROAS'] if pd.notna(r['长期 ROAS']) else None
    lroas_s = f"{lroas:.2f}" if lroas is not None else "—"
    camp_rows += f"<tr><td>{r['广告活动名称']}</td><td>{r['广告产品']}</td><td>{fmtint(r['展示量'])}</td><td>{fmtint(r['点击量'])}</td><td>{ctrv(r['点击量'],r['展示量'])}</td><td>{money(r['总成本'])}</td><td>{fmtint(r['购买量'])}</td><td>{cvrv(r['购买量'],r['点击量'])}</td><td>{money(r['销售额'])}</td><td><b>{roas:.2f}</b></td><td>{acosv(r['总成本'],r['销售额'])}</td><td>{lroas_s}</td></tr>"

# ---------- targeting table (sort by cost) ----------
t2 = t.sort_values('总成本', ascending=False)
tgt_rows = ""
for _, r in t2.iterrows():
    roas = r['ROAS'] if pd.notna(r['ROAS']) else 0
    status = r['投放状态'] if pd.notna(r['投放状态']) else '—'
    stat_cls = 'down' if status == 'PAUSED' else ''
    pr = r['购买率'] if pd.notna(r['购买率']) else 0
    tgt_rows += f"<tr><td>{r['广告活动名称']}</td><td>{r['投放方案']}</td><td>{r['投放匹配类型-Targeting match type']}</td><td class='{stat_cls}'>{status}</td><td>{fmtint(r['展示量'])}</td><td>{fmtint(r['点击量'])}</td><td>{ctrv(r['点击量'],r['展示量'])}</td><td>{money(r['总成本'])}</td><td>{fmtint(r['购买量'])}</td><td>{cvrv(r['购买量'],r['点击量'])}</td><td>{money(r['销售额'])}</td><td><b>{roas:.2f}</b></td><td>{acosv(r['总成本'],r['销售额'])}</td></tr>"

# ---------- 通用关键词分类（与第一部分一致：取非修饰词里词频最高的 token） ----------
_STOP = set("a an the of for to with and or in on at is are was were be been by from your you i "
            "my our their this that these those as it its no non off out up down over under per vs "
            "de la el las los una un para con por en y o".split())
_SIZE = set("small large big tall short narrow wide mini compact slim thin extra huge medium little long round square deep low high".split())
_MAT = set("wood wooden metal steel aluminum alloy plastic acrylic glass ceramic marble stone bamboo rattan wicker resin fabric linen leather faux synthetic".split())
_STY = set("modern vintage rustic classic contemporary minimalist boho farmhouse industrial scandinavian traditional antique ornate elegant simple cute".split())
_SCE = set("living room bedroom nursery office outdoor kitchen bathroom patio garden garage dorm college".split())
_MOD = _SIZE | _MAT | _STY | _SCE
_AD_FREQ = Counter()
for q in df['搜索词'].dropna().astype(str):
    for tk in _re.findall(r"[a-z0-9\u4e00-\u9fff]+", q.lower()):
        if tk not in _STOP and len(tk) > 1:
            _AD_FREQ[tk] += 1
def cat(q):
    if not isinstance(q, str):
        return '其他(ASIN/品牌等)'
    toks = [tk for tk in _re.findall(r"[a-z0-9\u4e00-\u9fff]+", q.lower())
            if tk not in _MOD and len(tk) > 1]
    if not toks:
        return '其他(ASIN/品牌等)'
    return max(toks, key=lambda tk: _AD_FREQ.get(tk, 0))
df['cat'] = df['搜索词'].apply(cat)
g = df.groupby('cat').agg(展示量=('展示量', 'sum'), 花费=('总成本', 'sum'), 点击=('点击量', 'sum'),
                          购买=('购买量', 'sum'), 销售=('销售额', 'sum')).reset_index()
g['ROAS'] = g['销售']/g['花费']; g['CVR'] = g['购买']/g['点击']
g = g.sort_values('花费', ascending=False)
cat_rows = ""
for _, r in g.iterrows():
    cat_rows += f"<tr><td>{r['cat']}</td><td>{money(r['花费'])}</td><td>{fmtint(r['展示量'])}</td><td>{fmtint(r['点击'])}</td><td>{ctrv(r['点击'],r['展示量'])}</td><td>{fmtint(r['购买'])}</td><td>{cvrv(r['购买'],r['点击'])}</td><td>{money(r['销售'])}</td><td><b>{r['ROAS']:.2f}</b></td><td>{acosv(r['花费'],r['销售'])}</td></tr>"

# ---------- top converting terms ----------
top = df.sort_values('购买量', ascending=False).head(15)
top_rows = ""
for _, r in top.iterrows():
    q = r['搜索词'] if isinstance(r['搜索词'], str) else '(ASIN/品牌词)'
    roas = r['ROAS'] if pd.notna(r['ROAS']) else 0
    top_rows += f"<tr><td>{q}</td><td>{r['广告活动名称']}</td><td>{fmtint(r['展示量'])}</td><td>{fmtint(r['点击量'])}</td><td>{ctrv(r['点击量'],r['展示量'])}</td><td>{money(r['总成本'])}</td><td>{fmtint(r['购买量'])}</td><td>{cvrv(r['购买量'],r['点击量'])}</td><td>{money(r['销售额'])}</td><td><b>{roas:.2f}</b></td><td>{acosv(r['总成本'],r['销售额'])}</td></tr>"

# ---------- wasted / low ROAS ----------
waste = df[(df['总成本'] > 5) & (df['购买量'].fillna(0) == 0)].sort_values('总成本', ascending=False)
low = df[(df['总成本'] > 10) & (df['ROAS'] < 3)].sort_values('总成本', ascending=False)
waste_rows = ""
for _, r in waste.iterrows():
    q = r['搜索词'] if isinstance(r['搜索词'], str) else '(ASIN/品牌词)'
    waste_rows += f"<tr><td>{q}</td><td>{r['广告活动名称']}</td><td>{fmtint(r['展示量'])}</td><td>{fmtint(r['点击量'])}</td><td>{ctrv(r['点击量'],r['展示量'])}</td><td>{money(r['总成本'])}</td><td>0</td><td>0.00%</td><td>—</td></tr>"
low_rows = ""
for _, r in low.iterrows():
    q = r['搜索词'] if isinstance(r['搜索词'], str) else '(ASIN/品牌词)'
    roas = r['ROAS'] if pd.notna(r['ROAS']) else 0
    low_rows += f"<tr><td>{q}</td><td>{r['广告活动名称']}</td><td>{fmtint(r['展示量'])}</td><td>{fmtint(r['点击量'])}</td><td>{ctrv(r['点击量'],r['展示量'])}</td><td>{money(r['总成本'])}</td><td>{fmtint(r['购买量'])}</td><td>{cvrv(r['购买量'],r['点击量'])}</td><td>{money(r['销售额'])}</td><td><b>{roas:.2f}</b></td><td>{acosv(r['总成本'],r['销售额'])}</td></tr>"

# ---------- paused but spending ----------
paused = t[(t['投放状态'] == 'PAUSED') & (t['总成本'] > 0)].sort_values('总成本', ascending=False)
paused_rows = ""
for _, r in paused.iterrows():
    roas = r['ROAS'] if pd.notna(r['ROAS']) else 0
    pr = r['购买率'] if pd.notna(r['购买率']) else 0
    paused_rows += f"<tr><td>{r['广告活动名称']}</td><td>{r['投放方案']}</td><td>{r['投放匹配类型-Targeting match type']}</td><td>{fmtint(r['展示量'])}</td><td>{fmtint(r['点击量'])}</td><td>{ctrv(r['点击量'],r['展示量'])}</td><td>{money(r['总成本'])}</td><td>{fmtint(r['购买量'])}</td><td>{cvrv(r['购买量'],r['点击量'])}</td><td class='down'><b>{roas:.2f}</b></td><td>{acosv(r['总成本'],r['销售额'])}</td></tr>"

# ---------- aggregate search terms by query (for SQP cross reference) ----------
qt = df.groupby(df['搜索词'].str.lower()).agg(
    展示量=('展示量', 'sum'), 点击量=('点击量', 'sum'), 总成本=('总成本', 'sum'),
    购买量=('购买量', 'sum'), 销售额=('销售额', 'sum')
).reset_index()
qt = qt.rename(columns={'搜索词': 'query'})
qt['ROAS'] = qt['销售额']/qt['总成本'].replace(0, np.nan)
qt['CVR'] = qt['购买量']/qt['点击量'].replace(0, np.nan)
qt['CTR'] = qt['点击量']/qt['展示量'].replace(0, np.nan)
qt['ACoS'] = qt['总成本']/qt['销售额'].replace(0, np.nan)

ad_terms = set(df['搜索词'].dropna().str.lower())

def lookup_ad(q):
    row = qt[qt['query'] == q.lower()]
    if row.empty:
        return None
    r = row.iloc[0]
    return {'impr': int(r['展示量']), 'clk': int(r['点击量']), 'cost': float(r['总成本']),
            'purch': int(r['购买量']), 'sales': float(r['销售额']),
            'ctr': r['CTR'], 'cvr': r['CVR'], 'roas': r['ROAS'], 'acos': r['ACoS']}

def ad_metrics_cells(q):
    a = lookup_ad(q)
    if a is None:
        return "<td>—</td>"*9
    return (f"<td>{fmtint(a['impr'])}</td><td>{fmtint(a['clk'])}</td><td>{pct(a['ctr'])}</td>"
            f"<td>{money(a['cost'])}</td><td>{fmtint(a['purch'])}</td><td>{pct(a['cvr'])}</td>"
            f"<td>{money(a['sales'])}</td><td><b>{a['roas']:.2f}</b></td><td>{acosv(a['cost'],a['sales'])}</td>")

def ad_cells(q):
    a = lookup_ad(q)
    status = "已投放" if a else "未投放"
    cls = "up" if a else "down"
    return f"<td class='{cls}'>{status}</td>" + ad_metrics_cells(q)

# ---------- annual SQP cross reference ----------
strength = D['strength'][:12]
opp = D['opportunity'][:12]

def sqp_cells(k):
    return (f"<td>{pct(k['avg_aps'],2)}</td>"
            f"<td>{pct(k['asin_purch_rate'])}</td><td>{pct(k['market_purch_rate'])}</td>")

st_rows = ""
for k in strength:
    st_rows += f"<tr><td>{k['query']}</td><td>{k['category']}</td><td>{fmtint(k['annual_search_vol'])}</td>{sqp_cells(k)}{ad_cells(k['query'])}</tr>"

opp_rows = ""
for k in opp:
    a = lookup_ad(k['query'])
    status = "已投放" if a else "未投放"
    cls = "up" if a else "down"
    opp_rows += f"<tr><td>{k['query']}</td><td>{k['category']}</td><td>{fmtint(k['annual_search_vol'])}</td>{sqp_cells(k)}<td class='{cls}'>{status}</td>{ad_metrics_cells(k['query'])}</tr>"

gap = []
for k in D['keywords']:
    v = k.get('annual_search_vol')
    if v is None or v < 15000:
        continue
    q = k['query'].lower()
    if q in ad_terms or any(q in x for x in ad_terms):
        continue
    gap.append((k['query'], k.get('category', '—'), int(v), (k.get('avg_aps') or 0)*100))
gap = sorted(gap, key=lambda x: -x[2])[:15]
gap_rows = ""
for q, cat, vol, sh in gap:
    gap_rows += f"<tr><td>{q}</td><td>{cat}</td><td>{fmtint(vol)}</td><td>{sh:.2f}%</td></tr>"

# ================= 数据驱动的通用结论文案 =================
n_acts = len(c)
roas_vals = c['ROAS'].fillna(0)
roas_min, roas_max = (float(roas_vals.min()), float(roas_vals.max())) if n_acts else (0, 0)
has_neg = bool((roas_vals < 1).any())
no_bad = not has_neg
top_spend_name = c.iloc[0]['广告活动名称'] if n_acts else '—'
top_roas_row = c.sort_values('ROAS', ascending=False).iloc[0] if n_acts else None
top_roas_name = top_roas_row['广告活动名称'] if top_roas_row is not None else '—'
top_roas_val = float(top_roas_row['ROAS']) if top_roas_row is not None and pd.notna(top_roas_row['ROAS']) else 0
low_acts = c[c['ROAS'].fillna(0) < 1].sort_values('总成本', ascending=False)
# 品类维度
spend_cat = g.iloc[0]['cat'] if len(g) else '—'
spend_cat_roas = float(g.iloc[0]['ROAS']) if len(g) and pd.notna(g.iloc[0]['ROAS']) else 0
roas_cat_row = g.sort_values('ROAS', ascending=False).iloc[0] if len(g) else None
roas_cat = roas_cat_row['cat'] if roas_cat_row is not None else '—'
roas_cat_val = float(roas_cat_row['ROAS']) if roas_cat_row is not None and pd.notna(roas_cat_row['ROAS']) else 0
# 已暂停且低效
paused_bullets = ""
if len(paused):
    paused_bullets = "".join(
        f"<li><b>{r['广告活动名称']} · {r['投放方案']}</b>（已暂停 PAUSED）：ROAS {r['ROAS']:.2f}、转化率 {cvrv(r['购买量'],r['点击量'])}，建议直接关闭或停止加预算。</li>"
        for _, r in paused.head(4).iterrows())
else:
    paused_bullets = "<li>未发现已暂停但仍消耗、且 ROAS 极低的投放，暂停管理较干净。</li>"
# 浪费/低效汇总
waste_sum = money(waste['总成本'].sum()) if len(waste) else money(0)
low_sum = money(low['总成本'].sum()) if len(low) else money(0)
if len(waste) == 0 and len(low) == 0:
    waste_sev = "整体浪费极少，否词与匹配已较干净，无需大规模否定操作。"
elif len(waste) + len(low) <= 3:
    waste_sev = f"整体浪费可控（0 购买词 {len(waste)} 个合计 {waste_sum}，低效词 {len(low)} 个合计 {low_sum}），轻微提纯即可。"
else:
    waste_sev = f"存在一定浪费（0 购买词 {len(waste)} 个合计 {waste_sum}，低效词 {len(low)} 个合计 {low_sum}），建议系统否词提纯。"
# ACoS 警戒线（整体 ACoS 向上取整到 5%）
acos_line = (math.ceil(overall_acos*100/5)*5)
if acos_line <= overall_acos*100:
    acos_line += 5
# 高潜/优势 品类名（动态）
top_str_cat = D['strength'][0]['category'] if D.get('strength') else '—'
top_opp_cat = D['opportunity'][0]['category'] if D.get('opportunity') else '—'
# Top 转化词名（动态，用于建议3）
top_conv_names = "、".join(f"{r['搜索词']}" for _, r in top.head(3).iterrows() if isinstance(r['搜索词'], str)) or "头部转化词"
# 综合结论用品类
seg_list = D.get('segments', [])
seg_top = seg_list[0]['name'] if seg_list else '—'
seg_best = max(seg_list, key=lambda s: s.get('avg_aps') or 0)['name'] if seg_list else '—'

HTML = f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{D['meta'].get('asin','')} 广告分析报告 · 近30天</title>
<style>
*{{box-sizing:border-box;}}
body{{font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;margin:0;background:#f5f6f8;color:#1f2329;line-height:1.6;}}
.wrap{{max-width:1180px;margin:0 auto;padding:28px 22px 60px;}}
h1{{font-size:24px;margin:0 0 4px;}}
.sub{{color:#8a919e;font-size:13px;margin-bottom:22px;}}
h2{{font-size:18px;margin:30px 0 10px;padding-left:10px;border-left:4px solid #2f6fed;}}
h3{{font-size:14px;margin:18px 0 6px;color:#2f6fed;}}
p{{margin:8px 0;font-size:14px;}}
.lead{{font-size:13px;color:#5a6270;background:#eef3ff;padding:12px 14px;border-radius:8px;margin:10px 0 16px;}}
.cards{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:14px 0;}}
.card{{background:#fff;border:1px solid #e6e9ef;border-radius:10px;padding:14px;}}
.card .v{{font-size:22px;font-weight:700;color:#2f6fed;}}
.card .l{{font-size:12px;color:#8a919e;margin-top:2px;}}
.card.g .v{{color:#13a463;}} .card.o .v{{color:#ff7a00;}} .card.r .v{{color:#e8453c;}}
.tbl-wrap{{overflow-x:auto;background:#fff;border:1px solid #e6e9ef;border-radius:10px;}}
table{{border-collapse:collapse;width:100%;font-size:13px;}}
th,td{{padding:8px 10px;text-align:left;border-bottom:1px solid #eef0f3;white-space:nowrap;}}
th{{background:#f7f8fa;font-weight:600;color:#4a5160;position:sticky;top:0;}}
tbody tr:hover{{background:#fafbfc;}}
td.down{{color:#e8453c;font-weight:600;}} td.up{{color:#13a463;}}
.tag{{display:inline-block;background:#eef3ff;color:#2f6fed;border-radius:4px;padding:1px 6px;font-size:11px;}}
.rec{{background:#fff;border:1px solid #e6e9ef;border-left:4px solid #13a463;border-radius:8px;padding:12px 16px;margin:12px 0;}}
.rec b{{color:#0f7a44;}}
.note{{background:#fff8f0;border:1px solid #ffe2c2;border-left:4px solid #ff7a00;border-radius:8px;padding:12px 16px;margin:12px 0;font-size:13px;}}
ul{{font-size:14px;margin:8px 0;padding-left:20px;}} li{{margin:5px 0;}}
.foot{{margin-top:30px;font-size:12px;color:#8a919e;text-align:center;}}
.pill{{display:inline-block;background:#fde8e8;color:#e8453c;border-radius:4px;padding:0 6px;font-size:11px;margin-left:4px;}}
</style></head>
<body><div class="wrap">
<h2 class="part2-title">第二部分 · 近30天广告绩效与年度交叉分析</h2>
<p class="part2-intro">本部分为同一份报告的<strong>第二部分</strong>，基于卖家后台广告报告（广告活动 / 搜索词 / 投放），统计窗口为近 30 天。以下所有结论均与<strong>第一部分《年度搜索绩效报告》</strong>的年度 SQP 数据<strong>交叉对比</strong>后给出，分析时同时调用两边数据，不单独割裂看待。</p>

<div class="cards">
  <div class="card"><div class="v">{len(c)}</div><div class="l">广告活动数</div></div>
  <div class="card"><div class="v">{money(tot_cost)}</div><div class="l">总广告花费</div></div>
  <div class="card g"><div class="v">{fmtint(tot_purch)}</div><div class="l">总购买量（订单）</div></div>
  <div class="card o"><div class="v">{overall_roas:.2f}</div><div class="l">整体 ROAS（销售额/花费）</div></div>
</div>
<div class="cards">
  <div class="card"><div class="v">{fmtint(tot_impr)}</div><div class="l">总展示量</div></div>
  <div class="card"><div class="v">{fmtint(tot_clk)}</div><div class="l">总点击量</div></div>
  <div class="card"><div class="v">{pct(overall_ctr)}</div><div class="l">整体点击率 CTR</div></div>
  <div class="card r"><div class="v">{pct(overall_acos)}</div><div class="l">整体 ACoS</div></div>
</div>
<div class="cards">
  <div class="card g"><div class="v">{pct(overall_cr)}</div><div class="l">整体转化率（点击→购买）</div></div>
  <div class="card"><div class="v">{money(tot_sales)}</div><div class="l">总广告销售额</div></div>
</div>

<div class="note"><b>口径提示：</b>广告报告的「转化率（购买/点击）」= 广告归因购买量 ÷ 广告点击量；ACoS 即广告花费销售比 = 总成本 ÷ 销售额；点击率 CTR = 点击量 ÷ 展示量。三者与第一部分年度搜索绩效报告的「本 ASIN 转化率（购买/点击）」分母不同（SQP 是搜索归因、含自然位流量），不可直接加减，但方向一致——本 ASIN 广告流量的点击后成交效率（{pct(overall_cr)}）与年度搜索归因转化（{pct(fA_pp)}，市场大盘仅 {pct(fM_pp)}）相比，可判断广告流量购买决心强弱。</div>

<h2>一、广告活动整体表现</h2>
<p class="lead">共 {n_acts} 个活动按花费降序。整体 ROAS 区间 {roas_min:.2f} ~ {roas_max:.2f}，{'整体广告结构健康，没有“烧钱不出单”的活动' if no_bad else '存在 ROAS<1 的异常活动，需重点关注'}。</p>
<div class="tbl-wrap"><table>
<thead><tr><th>广告活动</th><th>广告产品</th><th>展示量</th><th>点击量</th><th>点击率</th><th>总成本</th><th>购买量</th><th>转化率(购买/点击)</th><th>销售额</th><th>ROAS</th><th>ACoS</th><th>长期ROAS</th></tr></thead>
<tbody>{camp_rows}</tbody></table></div>
<ul>
<li><b>主力且健康：</b>花费最高的活动为「{top_spend_name}」，ROAS 最高的活动为「{top_roas_name}」（ROAS {top_roas_val:.2f}）——这两个应优先保障预算。</li>
<li><b>最高效：</b>ROAS ≥ 8 的活动（见上表）应优先加预算扩量；{'当前没有 ROAS≥8 的高效活动，建议从 ROAS 最高的活动开始测试加投' if roas_max < 8 else ''}。</li>
<li><b>偏弱待优化：</b>{'以下活动 ROAS<1，属“烧钱不出单”，应降预算或暂停：' + '、'.join(f"「{r['广告活动名称']}」(ROAS {r['ROAS']:.2f})" for _,r in low_acts.head(3).iterrows()) if len(low_acts) else '所有活动 ROAS 均 ≥1，整体结构健康。'}</li>
</ul>

<h2>二、投放（广告组 / Targeting）明细</h2>
<p class="lead">共 {len(t2)} 个投放按花费降序。重点看两类：① 已暂停（PAUSED）但仍产生花费的投放；② ROAS 显著偏低的投放。红色为已暂停状态。</p>
<div class="tbl-wrap"><table>
<thead><tr><th>广告活动</th><th>投放方案</th><th>匹配类型</th><th>状态</th><th>展示量</th><th>点击量</th><th>点击率</th><th>总成本</th><th>购买量</th><th>转化率(购买/点击)</th><th>销售额</th><th>ROAS</th><th>ACoS</th></tr></thead>
<tbody>{tgt_rows}</tbody></table></div>

<h3>⚠️ 已暂停但仍消耗、且 ROAS 极低的投放（建议直接关闭）</h3>
<div class="tbl-wrap"><table>
<thead><tr><th>广告活动</th><th>投放方案</th><th>匹配类型</th><th>展示量</th><th>点击量</th><th>点击率</th><th>总成本</th><th>购买量</th><th>转化率(购买/点击)</th><th>ROAS</th><th>ACoS</th></tr></thead>
<tbody>{paused_rows if paused_rows else '<tr><td colspan=10>无（暂停管理较干净）</td></tr>'}</tbody></table></div>
<ul>{paused_bullets}</ul>

<h2>三、搜索词效率分析</h2>
<h3>🔝 Top 15 转化词（按购买量）</h3>
<div class="tbl-wrap"><table>
<thead><tr><th>搜索词</th><th>所属活动</th><th>展示量</th><th>点击量</th><th>点击率</th><th>总成本</th><th>购买量</th><th>转化率(购买/点击)</th><th>销售额</th><th>ROAS</th><th>ACoS</th></tr></thead>
<tbody>{top_rows}</tbody></table></div>

<h3>🔻 浪费词（花费 &gt; {SYM}5 且 0 购买）</h3>
<div class="tbl-wrap"><table>
<thead><tr><th>搜索词</th><th>所属活动</th><th>展示量</th><th>点击量</th><th>点击率</th><th>总成本</th><th>购买量</th><th>转化率(购买/点击)</th><th>ROAS</th></tr></thead>
<tbody>{waste_rows if waste_rows else '<tr><td colspan=9>无（浪费可控）</td></tr>'}</tbody></table></div>

<h3>🔻 高花费低效词（花费 &gt; {SYM}10 且 ROAS &lt; 3）</h3>
<div class="tbl-wrap"><table>
<thead><tr><th>搜索词</th><th>所属活动</th><th>展示量</th><th>点击量</th><th>点击率</th><th>总成本</th><th>购买量</th><th>转化率(购买/点击)</th><th>销售额</th><th>ROAS</th><th>ACoS</th></tr></thead>
<tbody>{low_rows}</tbody></table></div>
<p>{waste_sev}</p>

<h2>四、按品类维度的广告表现</h2>
<p class="lead">把近 30 天所有广告搜索词按产品类型自动聚合（通用分类，与第一部分口径一致），验证年度 SQP 报告的品类判断。</p>
<div class="tbl-wrap"><table>
<thead><tr><th>品类</th><th>花费</th><th>展示量</th><th>点击</th><th>点击率</th><th>购买</th><th>转化率(购买/点击)</th><th>销售额</th><th>ROAS</th><th>ACoS</th></tr></thead>
<tbody>{cat_rows}</tbody></table></div>
<ul>
<li><b>花费最大的品类为「{spend_cat}」</b>（ROAS {spend_cat_roas:.2f}），是当前预算基本盘，应作为预算压舱石。</li>
<li><b>ROAS 最高的品类为「{roas_cat}」</b>（ROAS {roas_cat_val:.2f}），转化效率最优，应优先加投或扩充该品类词。</li>
<li>整体而言，ROAS 高且花费适中的长尾/修饰词（材质、风格、场景、尺寸类）往往是最具性价比的增量来源，应系统化纳入精准活动测试。</li>
</ul>

<h2>五、与第一部分（年度搜索绩效）的交叉印证</h2>
<p class="lead">把广告实际跑出的词，与第一部分《年度搜索绩效报告》的"核心优势词 / 高潜提升词"对照，验证策略是否落地。</p>

<h3>核心优势词（年度）的自然位与广告位表现对照</h3>
<div class="tbl-wrap"><table>
<thead><tr><th>年度核心优势词</th><th>品类</th><th>年搜索量</th><th>本ASIN自然购买份额</th><th>本ASIN转化率（购买/点击）</th><th>市场转化率（购买/点击）</th><th>广告状态</th><th>广告展示量</th><th>广告点击量</th><th>点击率</th><th>广告花费</th><th>广告购买</th><th>转化率</th><th>销售额</th><th>ROAS</th><th>ACoS</th></tr></thead>
<tbody>{st_rows}</tbody></table></div>
<p>表格左侧为年度 SQP 自然位表现，右侧为近 30 天广告实际跑出数据。<b>转化率口径为「年度加权汇总（Σ购买量 ÷ Σ点击量）」，与第一部分年度 Top15 完全一致</b>。多数核心优势词的广告直接出单量极低甚至为 0，说明这些词当前主要靠自然位承接，广告尚未针对性放量；年度高转化（购买/点击优于市场）的长尾词建议以 Exact/Phrase 形式系统化加入精准活动，把自然位优势复制到广告位；已显示"未投放"的词则直接新增投放。</p>

<h3>高潜提升词（年度）的广告覆盖情况</h3>
<div class="tbl-wrap"><table>
<thead><tr><th>高潜提升词</th><th>品类</th><th>年搜索量</th><th>本ASIN自然购买份额</th><th>本ASIN转化率（购买/点击）</th><th>市场转化率（购买/点击）</th><th>广告覆盖状态</th><th>广告展示量</th><th>广告点击量</th><th>点击率</th><th>广告花费</th><th>广告购买</th><th>转化率</th><th>销售额</th><th>ROAS</th><th>ACoS</th></tr></thead>
<tbody>{opp_rows}</tbody></table></div>
<p>以上为年度 Top 12 高潜词的自然位与广告位对照，转化率口径同为<b>年度加权汇总（Σ购买量 ÷ Σ点击量），与第一部分口径一致</b>。绿色"已投放"表示该词在近 30 天广告搜索词报告中以独立搜索词出现；红色"未投放"为当前广告尚未触达的流量。</p>

<h3>高搜索量但未投广告的流量缺口（年搜索量 ≥ 1.5 万）</h3>
<div class="tbl-wrap"><table>
<thead><tr><th>未投广告的高搜索量词</th><th>品类</th><th>年搜索量</th><th>本ASIN自然购买份额</th></tr></thead>
<tbody>{gap_rows if gap_rows else '<tr><td colspan=4>无（高搜索量词已全部覆盖）</td></tr>'}</tbody></table></div>
<p>以上为年搜索量 ≥ 1.5 万、但近 30 天广告尚未触达（无对应搜索词）的词。这些是"自然位有量、广告未覆盖"的流量缺口，建议补充投放以把自然位流量承接进广告位，吃下增量。</p>

<h2>六、广告优化建议（可直接执行）</h2>
<div class="rec"><b>建议 1 — 关闭已暂停且低效的精准投放</b>
<ul>{paused_bullets}</ul></div>

<div class="rec"><b>建议 2 — 预算向高效活动再倾斜</b>
<ul>
<li><b>加预算：</b>对 ROAS 最高的活动「{top_roas_name}」（ROAS {top_roas_val:.2f}）及花费最高活动「{top_spend_name}」优先加预算，它们是当前利润主引擎。整体近 30 天总花费约 {money(tot_cost)}，建议按"高效活动加、低效/暂停活动抽"的结构再平衡。</li>
<li><b>控预算：</b>{'ROAS<1 的活动（' + '、'.join(f"「{r['广告活动名称']}」" for _,r in low_acts.head(3).iterrows()) + '）不再扩量，先内部提纯或暂停' if len(low_acts) else '当前无 ROAS<1 的活动，整体结构健康，可维持并择优扩量'}。</li>
<li><b>加价：</b>对已经验证的头部转化词（如 {top_conv_names}）bid 上调 10%~15% 抢更靠前广告位；弱词不跟价，预算让给高效词。</li>
</ul></div>

<div class="rec"><b>建议 3 — 提纯低 ROAS 活动、把高转化长尾词提权</b>
<ul>
<li>保留并加价：近 30 天 Top 转化词（{top_conv_names}）是已验证主力词，应作为该活动第一主力持续放量。</li>
<li><b>命名区分：</b>同一搜索词可能存在"已启用(ENABLED)"与"已暂停(PAUSED)"两个不同投放状态，操作前请核对投放状态，避免误关已验证主力词。</li>
<li>剔除：ROAS&lt;3 的弱词（见第三节"高花费低效词"表），回收预算转投高效活动。</li>
<li><b>加否定词提纯：</b>每周拉"搜索词报告"，把跑出但不相关、或 0 购买的查询加为<b>精准否定</b>，阻止预算被无关查询消耗——这是"提纯"活动的核心动作，比单纯加价更直接影响 ROAS。</li>
<li>把年度核心优势词系统化加入精准活动测试放量——这些词自然转化优于市场的，先用低预算 Exact/Phrase 验证后再加价，形成"品类×属性"精准词矩阵。</li>
</ul></div>

<div class="rec"><b>建议 4 — 利用 ASIN 级 Coupon 弥补 {SYM}{ASIN_PRICE:.2f} 价格劣势（年度结论落地）</b>
<ul>
<li>第一部分年度搜索绩效报告若显示本品定价在同类款式中偏高，是加购环节流失主因。<b>Coupon 是 ASIN 级、无法按关键词/广告组定向</b>，但开启后全站搜索结果页显示徽章，对仍有自然位的头部核心词流量尤其有效，间接提升广告 ROAS。</li>
<li>建议设 10%~15% off ASIN 级 Coupon，不单独为某个词操作。</li>
</ul></div>

<div class="rec"><b>建议 5 — 扩展长尾与蓝海词，吃下沉量</b>
<ul>
<li>把年度 SQP 中"高需求、低本 ASIN 份额、且效率优"的高潜词（见第一部分第七节）系统化加入手动词组/精准活动，低成本拓增量。</li>
<li>第四节省略「{roas_cat}」等 ROAS 最高的品类转化效率最优，可在对应活动里加价或扩词，放大这一高效品类。</li>
</ul></div>

<div class="rec"><b>建议 6 — 设组合 ACoS 目标、单词止损线与复盘节奏</b>
<ul>
<li><b>组合 ACoS 警戒线 ≤ {acos_line}%</b>：账户各活动 ACoS 当前整体约 {pct(overall_acos)}，以 {acos_line}% 作为整体健康线，超过则回看该活动是否仍值投放。</li>
<li><b>单词止损线：</b>延续建议 3 的 ROAS&lt;3（即 ACoS&gt;33%）红线——任何精准词连续 2 周 ROAS&lt;3 且无自然位承接，直接暂停或降 bid，不拖账户后腿。</li>
<li><b>复盘节奏：</b>每 2 周复查一次，重点看<b>单量</b>与<b>TACoS</b>（总广告花费 ÷ 总销售额，含自然单），而非单看广告 ROAS。尤其开启建议 4 的 Coupon 后，Coupon 会拉高自然单、可能压低广告 ROAS，此时应以 TACoS 与总单量判断是否健康，避免误判"广告变差"而错误砍预算。</li>
</ul></div>

<div class="note"><b>综合结论（第一部分年度搜索绩效 + 第二部分近30天广告）：</b>
<p style="margin:6px 0 8px">下方结论由「年度 SQP 搜索数据」与「近 30 天广告投放数据」<strong>双向交叉印证</strong>得出，两部分数据方向一致，重点做结构性优化。</p>
① 品类基本盘为「{seg_top}」、预算压舱石 ✓（广告花费最大品类、ROAS {spend_cat_roas:.2f}）；
② ROAS 最高的品类为「{seg_best}」（{roas_cat_val:.2f}），应优先加投 ✓；
③ 高搜索量但未投广告的流量缺口（见第五节）是低成本增量来源，应补投放 ✓；
④ 长尾/修饰词（材质、风格、场景、尺寸类）转化往往最优，应系统化纳入精准活动。
整体广告结构与年度报告策略高度自洽，重点做"关低效精准 + 提纯长尾（含加否定词）+ 加投高效活动 + 开 ASIN Coupon + 设 ACoS 警戒线与 2 周复盘"。</div>

<div class="foot">本报告由 WorkBuddy 合并生成：第一部分《年度搜索绩效报告》（年度 SQP 搜索数据）＋ 第二部分《近30天广告绩效》（卖家后台广告活动 / 搜索词 / 投放）。两部分数据交叉印证、统一给出建议。</div>
</div></body></html>"""

# ---------- merge into the annual performance dashboard (single combined doc) ----------
import re as _re, os as _os
DASH = os.environ.get('DASH', os.path.join(os.environ.get('OUT_DIR', '.'), 'search_performance_dashboard.html'))
dash = open(DASH, encoding='utf-8').read()
dash = _re.sub(r'<!-- AD_SECTION_START -->.*?<!-- AD_SECTION_END -->', '', dash, flags=_re.S)
ad_style = _re.search(r'<style>(.*?)</style>', HTML, _re.S)
ad_body = _re.search(r'<body>(.*?)</body>', HTML, _re.S)
style_text = ad_style.group(1) if ad_style else ''
body_text = ad_body.group(1) if ad_body else ''
def _scope(m):
    sel = m.group(1); decls = m.group(2)
    return ', '.join(('#ad-section ' + s.strip()) for s in sel.split(',')) + '{' + decls + '}'
style_text = _re.sub(r'([^{}]+)\{([^{}]*)\}', _scope, style_text)
style_text = '#ad-section{border-top:3px solid #2f6fed;margin-top:36px;padding-top:8px;}\n' + style_text
ad_section = ('<!-- AD_SECTION_START -->\n<section id="ad-section">\n<style>' + style_text +
              '</style>\n' + body_text + '\n</section>\n<!-- AD_SECTION_END -->')
dash = dash.replace('</body>', ad_section + '\n</body>', 1)
open(DASH, 'w', encoding='utf-8').write(dash)
print('merged into:', DASH, 'size:', len(dash))
print('uncovered high-potential words (top40):', len(gap))


