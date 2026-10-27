# -*- coding: utf-8 -*-
import pandas as pd, numpy as np, glob, os, re, json, math
from datetime import datetime

# 输入/输出通过环境变量配置，便于复用：
#   SQP_DIR    : 全年搜索绩效（SQP）12 份月度 CSV 所在目录
#   OUT_DIR    : 报告与中间产物输出目录
#   ASIN       : 目标 ASIN（默认 B09TR9J6Q4）
#   ASIN_PRICE : 该 ASIN 当前售价（可选；留空则从 SQP 数据的 asin_price 列推导中位数，用于价格优势分析）
BASE = os.environ.get('SQP_DIR', r'E:\ZZQ文件\后台搜索绩效分析\APET003（US）')
OUT  = os.environ.get('OUT_DIR', r'C:\Users\admin\WorkBuddy\2026-08-21-17-34-14')
ASIN = os.environ.get('ASIN', 'B09TR9J6Q4')
ASIN_PRICE = os.environ.get('ASIN_PRICE', '')   # 留空则从数据推导
MARKET = os.environ.get('MARKET', 'US')      # 站点/市场，如 US / JP / DE / UK
PRODUCT = os.environ.get('PRODUCT', '')      # 商品名（可选，留空则用 ASIN 指代）
files = sorted(glob.glob(os.path.join(BASE, "*.csv")))
if not files:
    raise SystemExit(f"[analysis] 在 SQP_DIR 未找到任何 CSV：{BASE}\n请确认传入的是全年 12 份月度搜索绩效（SQP）CSV 所在目录。")

# Column index mapping (verified identical across all 12 files)
C = {
 'query':0, 'score':1, 'vol':2,
 'm_impr':3, 'asin_impr_count':4, 'asin_impr_share':5,
 'm_clicks':6, 'm_ctr':7, 'asin_click_count':8, 'asin_click_share':9,
 'm_price_med':10, 'asin_price':11,
 'd_same':12, 'd_1d':13, 'd_2d':14,
 'm_cart':15, 'm_cartrate':16, 'asin_cart_count':17, 'asin_cart_share':18,
 'cart_price_med':19, 'cart_asin_price':20,
 'cart_d_same':21, 'cart_d_1d':22, 'cart_d_2d':23,
 'm_purch':24, 'm_purchrate':25, 'asin_purch_count':26, 'asin_purch_share':27,
 'purch_price_med':28, 'purch_asin_price':29,
 'purch_d_same':30, 'purch_d_1d':31, 'purch_d_2d':32,
 'report_date':33,
}

def num(x):
    if x is None: return np.nan
    s = str(x).strip().replace(',', '')
    if s == '' or s.lower() in ('nan','none'): return np.nan
    try: return float(s)
    except: return np.nan

# ---- keyword segmentation（全自动：从上传数据自动提炼，不依赖任何品类词库）----
import re
from collections import Counter

# 通用停用词（含少量多语种常见虚词，避免把 of/for/para 等当作品类）
_STOP = set(("a an the of for to with and or in on at is are was were be been by from your you i "
             "my our their this that these those as it its no non off out up down over under per vs "
             "de la el las los una un una para con por en una y o").split())

def _tokens(q):
    """分词：按非字母数字切分，兼容拉丁/中日韩/假名等脚本；去掉停用词与单字。"""
    toks = re.split(r"[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+", q.lower())
    return [t for t in toks if t and t not in _STOP and len(t) > 1]

# 通用「属性修饰」词典（跨品类适用度较高的英文修饰词；非英文品类时这些桶自然为空）
_SIZE = set("small large big tall short narrow wide mini compact slim thin extra huge medium little long round square deep low high".split())
_MATERIAL = set("wood wooden metal steel aluminum alloy plastic acrylic glass ceramic marble stone bamboo rattan wicker resin fabric linen leather faux synthetic".split())
_STYLE = set("modern vintage rustic classic contemporary minimalist boho farmhouse industrial scandinavian traditional antique ornate elegant simple cute".split())
_SCENE = set("living room bedroom nursery office outdoor kitchen bathroom patio garden garage dorm college".split())

def size_tag(q):
    for t in _tokens(q):
        if t in _SIZE: return t
    return ''
def material_tag(q):
    for t in _tokens(q):
        if t in _MATERIAL: return t
    return ''
def style_tag(q):
    for t in _tokens(q):
        if t in _STYLE: return t
    return ''
def scene_tag(q):
    for t in _tokens(q):
        if t in _SCENE: return t
    return ''

# 全局 token 词频（按搜索量加权），用于把每个关键词归到其最高频的「头部词根」
TOKEN_FREQ = Counter()
def _build_token_freq(rows):
    for r in rows:
        vol = r.get('vol')
        w = vol if (vol is not None and not (isinstance(vol,float) and math.isnan(vol))) else 1
        for t in set(_tokens(r.get('query',''))):
            TOKEN_FREQ[t] += w

# 修饰词集合（尺寸/材质/风格/场景）：不作为「品类词根」，归到各自的属性标签
_MOD = _SIZE | _MATERIAL | _STYLE | _SCENE
def categorize(q):
    """通用品类归类：取查询中『非修饰词』里全局词频最高的 token 作为该词的「品类词根」。
    例如边桌数据会得到 table / nightstand / stand 等；猫柜数据会得到 litter / cat / box 等。
    尺寸/材质/风格/场景修饰词（small/wood/boho/living room 等）不充当品类，归到属性标签。
    无任何品类专属写死。"""
    toks = [t for t in _tokens(q) if t not in _MOD]
    if not toks:
        return '其他 (other)'
    head = max(toks, key=lambda t: TOKEN_FREQ.get(t, 0))
    return head

# 品牌词：在关键词构建完成后，由数据特征反推（单 token 且购买份额居前），见下方 _assign_brands()
BRAND_SET = set()
def _assign_brands(kws):
    """把「单 token 查询且平均购买份额处于前 10%」的关键词标记为品牌词（数据驱动，不依赖词库）。"""
    global BRAND_SET
    singletons = [k for k in kws if ' ' not in k['query'].strip() and not np.isnan(k['avg_aps'])]
    if not singletons:
        return
    shares = sorted(k['avg_aps'] for k in singletons)
    thr = shares[int(len(shares)*0.9)] if len(shares) > 1 else shares[-1]
    for k in singletons:
        if k['avg_aps'] >= thr:
            BRAND_SET.add(k['query'].strip())

# ---- load all ----
_ENC_TRY = ('utf-8-sig', 'utf-16', 'gbk')
_CIPHER_HINT = (
    "无法按 UTF-8/UTF-16/GBK 任何编码解码——读到的是【密文】。\n"
    "常见原因：公司透明加密/文档加密系统已把磁盘上的这份 CSV 加密，浏览器上传时拿到的不是明文。\n"
    "解决办法（任选其一）：\n"
    "  1) 用 WPS/Excel 打开这份 CSV → 另存为一个新的 CSV 文件 → 上传新文件；\n"
    "  2) 从亚马逊后台重新下载导出后立即上传。\n"
    "（如仍失败，可把文件压缩成 zip 上传——但需先确认源文件本身可正常打开。）"
)

def _open_text(f):
    """按常见编码依次尝试打开文本文件，返回 (文件句柄, 编码)；全部失败抛 UnicodeDecodeError。"""
    last = None
    for enc in _ENC_TRY:
        try:
            fh = open(f, encoding=enc)
            fh.readline()          # 触发解码校验
            fh.seek(0)
            return fh, enc
        except (UnicodeDecodeError, UnicodeError) as e:
            last = e
    raise last

all_rows = []
months = []
month_labels = []
for f in files:
    try:
        fh0, _enc = _open_text(f)
    except (UnicodeDecodeError, UnicodeError):
        raise SystemExit(f"[analysis] 文件 {os.path.basename(f)} " + _CIPHER_HINT)
    raw0 = fh0.readline().strip(); fh0.close()
    df = pd.read_csv(f, sep=",", header=1, encoding=_enc, dtype=str, keep_default_na=False)
    if len(df.columns) < 34:
        raise SystemExit(f"[analysis] 文件 {f} 列数={len(df.columns)}，预期 34 列（亚马逊 SQP 月度标准格式）。请确认导出类型正确。")
    m = re.search(r"选择年份=\[\"(\d+)\"\],选择月份=\[\"([^\"]+)\"\]", raw0)
    if not m:
        raise SystemExit(f"[analysis] 文件 {f} 首行未匹配到「选择年份/选择月份」元数据，\n确认这是亚马逊搜索目录绩效（Search Catalog Performance）的月度导出（首行为 选择年份=[\"...\"],选择月份=[\"...\"]）。")
    year = m.group(1); mlabel = m.group(2)
    # report date from last data row
    rdate = df.iloc[-1, C['report_date']] if len(df)>0 else ""
    ym = year + "-" + re.sub(r'\D','', mlabel).zfill(2)
    months.append(ym); month_labels.append(mlabel + " " + year)
    for _, r in df.iterrows():
        def gv(k): return r.iloc[C[k]]
        vol = num(gv('vol'))
        m_impr=num(gv('m_impr')); m_clicks=num(gv('m_clicks')); m_cart=num(gv('m_cart')); m_purch=num(gv('m_purch'))
        # CSV 中的 share 列是百分比数字（如 7.69 表示 7.69%），统一转为小数
        ais=num(gv('asin_impr_share'))/100; acs=num(gv('asin_click_share'))/100; acas=num(gv('asin_cart_share'))/100; aps=num(gv('asin_purch_share'))/100
        asin_impr = m_impr*ais if not np.isnan(m_impr) and not np.isnan(ais) else np.nan
        asin_clicks = m_clicks*acs if not np.isnan(m_clicks) and not np.isnan(acs) else np.nan
        asin_cart = m_cart*acas if not np.isnan(m_cart) and not np.isnan(acas) else np.nan
        asin_purch = m_purch*aps if not np.isnan(m_purch) and not np.isnan(aps) else np.nan
        # sanitize asin price
        ap = num(gv('asin_price'))
        if not np.isnan(ap) and ap>1000: ap=np.nan
        mp = num(gv('m_price_med'))
        if not np.isnan(mp) and mp>500: mp=np.nan
        row = {
          'month':ym,'label':mlabel+' '+year,'query':gv('query').strip(),
          'score':num(gv('score')),
          'vol':vol,'m_impr':m_impr,'m_clicks':m_clicks,'m_cart':m_cart,'m_purch':m_purch,
          'ais':ais,'acs':acs,'acas':acas,'aps':aps,
          'asin_impr':asin_impr,'asin_clicks':asin_clicks,'asin_cart':asin_cart,'asin_purch':asin_purch,
          'm_price':mp,'asin_price':ap,
          'd_same':num(gv('d_same')),'d_1d':num(gv('d_1d')),'d_2d':num(gv('d_2d')),
        }
        all_rows.append(row)

print("loaded rows:", len(all_rows))
_build_token_freq(all_rows)   # 为通用品类归类准备全局词频

# 从 SQP 数据推导默认售价（每行 asin_price 的中位数），未显式指定 ASIN_PRICE 时使用
_ap_vals = [r['asin_price'] for r in all_rows if (not np.isnan(r['asin_price'])) and r['asin_price'] > 0]
_AP_DEFAULT = float(np.median(_ap_vals)) if _ap_vals else 26.99

# ---- monthly aggregate ----
monthly=[]
for ym in months:
    sub=[r for r in all_rows if r['month']==ym]
    sv=sum(x['vol'] for x in sub if not np.isnan(x['vol']))
    mi=sum(x['m_impr'] for x in sub if not np.isnan(x['m_impr']))
    mc=sum(x['m_clicks'] for x in sub if not np.isnan(x['m_clicks']))
    mca=sum(x['m_cart'] for x in sub if not np.isnan(x['m_cart']))
    mp=sum(x['m_purch'] for x in sub if not np.isnan(x['m_purch']))
    ai=sum(x['asin_impr'] for x in sub if not np.isnan(x['asin_impr']))
    ac=sum(x['asin_clicks'] for x in sub if not np.isnan(x['asin_clicks']))
    aca=sum(x['asin_cart'] for x in sub if not np.isnan(x['asin_cart']))
    ap=sum(x['asin_purch'] for x in sub if not np.isnan(x['asin_purch']))
    ds=sum(x['d_same'] for x in sub if not np.isnan(x['d_same']))
    d1=sum(x['d_1d'] for x in sub if not np.isnan(x['d_1d']))
    d2=sum(x['d_2d'] for x in sub if not np.isnan(x['d_2d']))
    def safe(a,b):
        return a/b if (not np.isnan(a) and not np.isnan(b) and b!=0) else np.nan
    monthly.append({
      'month':ym,'label':sub[0]['label'],
      'search_vol':sv,'m_impr':mi,'m_clicks':mc,'m_cart':mca,'m_purch':mp,
      'asin_impr':ai,'asin_clicks':ac,'asin_cart':aca,'asin_purch':ap,
      'asin_impr_share':safe(ai,mi),'asin_click_share':safe(ac,mc),
      'asin_cart_share':safe(aca,mca),'asin_purch_share':safe(ap,mp),
      'm_ctr_impr':safe(mc,mi),'m_cart_perclick':safe(mca,mc),'m_purch_perclick':safe(mp,mc),
      'asin_ctr_impr':safe(ac,ai),'asin_cart_perclick':safe(aca,ac),'asin_purch_perclick':safe(ap,ac),
      'm_same_share':safe(ds,mc),'m_1d_share':safe(d1,mc),'m_2d_share':safe(d2,mc),
      'n_keywords':len(sub),
    })

# ---- keyword-level ----
from collections import defaultdict
kw=defaultdict(list)
for r in all_rows: kw[r['query']].append(r)

keywords=[]
for q,rows in kw.items():
    rows_sorted=sorted(rows,key=lambda x:x['month'])
    annual_vol=sum(x['vol'] for x in rows if not np.isnan(x['vol']))
    annual_asin_purch=sum(x['asin_purch'] for x in rows if not np.isnan(x['asin_purch']))
    def avg(key):
        vals=[x[key] for x in rows if not np.isnan(x[key])]
        return np.mean(vals) if vals else np.nan
    # monthly map for trend
    mmap={}
    for ym in months:
        rr=[x for x in rows if x['month']==ym]
        if rr:
            x=rr[0]
            # efficiency ratios
            asin_ctr=safe(x['asin_clicks'],x['asin_impr'])
            market_ctr=safe(x['m_clicks'],x['vol'])
            asin_cart_rate=safe(x['asin_cart'],x['asin_clicks'])
            market_cart_rate=safe(x['m_cart'],x['m_clicks'])
            asin_purch_rate=safe(x['asin_purch'],x['asin_clicks'])
            market_purch_rate=safe(x['m_purch'],x['m_clicks'])
            asin_cvr=safe(x['asin_purch'],x['asin_cart'])
            market_cvr=safe(x['m_purch'],x['m_cart'])
            mmap[ym]={'vol':x['vol'],'m_clicks':x['m_clicks'],'m_cart':x['m_cart'],'m_purch':x['m_purch'],'m_impr':x['m_impr'],
                      'ais':x['ais'],'acs':x['acs'],'acas':x['acas'],'aps':x['aps'],
                      'asin_impr':x['asin_impr'],'asin_clicks':x['asin_clicks'],'asin_cart':x['asin_cart'],'asin_purch':x['asin_purch'],
                      'm_price':x['m_price'],'score':x['score'],
                      'asin_ctr':asin_ctr,'market_ctr':market_ctr,
                      'asin_cart_rate':asin_cart_rate,'market_cart_rate':market_cart_rate,
                      'asin_purch_rate':asin_purch_rate,'market_purch_rate':market_purch_rate,
                      'asin_cvr':asin_cvr,'market_cvr':market_cvr}
        else:
            mmap[ym]=None
    # trend: first 3 vs last 3 months avg (by month order)
    def seq(key): return [mmap[ym][key] if mmap[ym] else np.nan for ym in months]
    def trend(seq):
        f=[v for v in seq[:3] if not np.isnan(v)]; l=[v for v in seq[-3:] if not np.isnan(v)]
        if not f or not l: return np.nan
        return (np.mean(l)-np.mean(f))/np.mean(f) if np.mean(f)!=0 else np.nan
    def wavg(num_key, den_key):
        """率类指标的「按流量加权年度汇总」= Σ各月分子 ÷ Σ各月分母。
        与第一部分年度 Top15（Σ购买÷Σ点击）口径一致；不再用未加权月度简单平均，
        避免小流量月单笔成交被等权放大而虚高本 ASIN 转化率。"""
        num=0.0; den=0.0
        for ym in months:
            mm_=mmap[ym]
            if not mm_: continue
            n=mm_[num_key]; d=mm_[den_key]
            if n is None or d is None: continue
            if isinstance(n,float) and np.isnan(n): continue
            if isinstance(d,float) and np.isnan(d): continue
            if d==0: continue
            num+=n; den+=d
        return safe(num,den)
    def avg_key(key):
        vals=[mmap[ym][key] for ym in months if mmap[ym] and not np.isnan(mmap[ym][key])]
        return np.mean(vals) if vals else np.nan
    present_months=sum(1 for ym in months if mmap[ym] is not None)
    keywords.append({
      'query':q,'score':avg('score'),'annual_search_vol':annual_vol,'annual_asin_purch':annual_asin_purch,
      'avg_ais':avg_key('ais'),'avg_acs':avg_key('acs'),'avg_acas':avg_key('acas'),'avg_aps':avg_key('aps'),
      # 率类指标统一为按流量加权的年度汇总（Σ分子÷Σ分母），与第一部分年度 Top15 口径一致。
      # market_ctr 分母由 搜索量(vol) 修正为 曝光量(impr)：CTR = 点击 ÷ 曝光。
      'asin_ctr':wavg('asin_clicks','asin_impr'),'market_ctr':wavg('m_clicks','m_impr'),
      'asin_cart_rate':wavg('asin_cart','asin_clicks'),'market_cart_rate':wavg('m_cart','m_clicks'),
      'asin_purch_rate':wavg('asin_purch','asin_clicks'),'market_purch_rate':wavg('m_purch','m_clicks'),
      'asin_cvr':wavg('asin_purch','asin_cart'),'market_cvr':wavg('m_purch','m_cart'),
      'category':categorize(q),'material':material_tag(q),'style':style_tag(q),
      'scene':scene_tag(q),'size':size_tag(q),
      'vol_trend':trend(seq('vol')),'aps_trend':trend(seq('aps')),
      'ais_trend':trend(seq('ais')),'acs_trend':trend(seq('acs')),
      'present_months':present_months,
      'stable':present_months==len(months),
      'monthly':mmap,
    })

# ---- 品牌词识别：把「单 token 查询且平均购买份额前 10%」标记为品牌词（数据驱动）----
_assign_brands(keywords)
for k in keywords:
    if k['query'].strip() in BRAND_SET:
        k['category'] = '品牌词 (brand)'

# ---- stable core-panel monthly aggregate (keywords present in ALL months) ----
stable_kw=[k for k in keywords if k['stable']]
stable_monthly=[]
for ym in months:
    sv=sum((k['monthly'][ym]['vol'] or 0) for k in stable_kw if k['monthly'][ym] and k['monthly'][ym]['vol'] is not None and not (isinstance(k['monthly'][ym]['vol'],float) and np.isnan(k['monthly'][ym]['vol'])))
    mc=sum((k['monthly'][ym]['m_clicks'] or 0) for k in stable_kw if k['monthly'][ym] and k['monthly'][ym]['m_clicks'] is not None and not (isinstance(k['monthly'][ym]['m_clicks'],float) and np.isnan(k['monthly'][ym]['m_clicks'])))
    mca=0;mp=0;ac=0;aca=0;ap=0;mi=0
    for k in stable_kw:
        mm=k['monthly'][ym]
        if not mm: continue
        mca+= (mm['m_cart'] or 0) if mm['m_cart'] is not None and not (isinstance(mm['m_cart'],float) and np.isnan(mm['m_cart'])) else 0
        mp+= (mm['m_purch'] or 0) if mm['m_purch'] is not None and not (isinstance(mm['m_purch'],float) and np.isnan(mm['m_purch'])) else 0
        ac+= (mm['asin_clicks'] or 0) if mm['asin_clicks'] is not None and not (isinstance(mm['asin_clicks'],float) and np.isnan(mm['asin_clicks'])) else 0
        aca+= (mm['asin_cart'] or 0) if mm['asin_cart'] is not None and not (isinstance(mm['asin_cart'],float) and np.isnan(mm['asin_cart'])) else 0
        ap+= (mm['asin_purch'] or 0) if mm['asin_purch'] is not None and not (isinstance(mm['asin_purch'],float) and np.isnan(mm['asin_purch'])) else 0
        mi+= (k['monthly'][ym].get('asin_impr') or 0)
    stable_monthly.append({'month':ym,'search_vol':sv,'m_clicks':mc,'m_cart':mca,'m_purch':mp,
        'asin_clicks':ac,'asin_cart':aca,'asin_purch':ap,
        'asin_purch_share':safe(ap,mp),'asin_click_share':safe(ac,mc),'asin_cart_share':safe(aca,mca)})

# ---- segments（动态品类：取实际出现的品类词，按年度本ASIN下单降序取前 N，再加品牌/其他）----
_cat_tot = defaultdict(float)
for k in keywords:
    _cat_tot[k['category']] += (k['annual_asin_purch'] if not np.isnan(k['annual_asin_purch']) else 0)
def _cat_rank(name):
    if name == '其他 (other)': return (2, 0)
    if name == '品牌词 (brand)': return (1, 0)
    return (0, -_cat_tot.get(name, 0))
_ordered = sorted(_cat_tot.keys(), key=_cat_rank)
_top_cats = [c for c in _ordered if c not in ('其他 (other)', '品牌词 (brand)')][:8]
seg_names = _top_cats + [c for c in ('品牌词 (brand)', '其他 (other)') if c in _cat_tot]
segments=[]
for sn in seg_names:
    sub=[k for k in keywords if k['category']==sn]
    if not sub: continue
    av=sum(k['annual_search_vol'] for k in sub); ap=sum(k['annual_asin_purch'] for k in sub)
    # monthly asin purchase share = sum(asin_purch)/sum(m_purch) across keywords in seg
    ms=[]
    for ym in months:
        tot_ap=0; tot_mp=0
        for k in sub:
            mm=k['monthly'][ym]
            if mm:
                tot_ap+= (mm['asin_purch'] if mm['asin_purch'] is not None and not (isinstance(mm['asin_purch'],float) and np.isnan(mm['asin_purch'])) else 0)
                tot_mp+= (mm['m_purch'] if mm['m_purch'] is not None and not (isinstance(mm['m_purch'],float) and np.isnan(mm['m_purch'])) else 0)
        ms.append(safe(tot_ap,tot_mp))
    # monthly asin purchases
    mpur=[]
    for ym in months:
        tot=sum((k['monthly'][ym]['asin_purch'] or 0) for k in sub if k['monthly'][ym] and k['monthly'][ym]['asin_purch'] is not None and not (isinstance(k['monthly'][ym]['asin_purch'],float) and np.isnan(k['monthly'][ym]['asin_purch'])))
        mpur.append(tot)
    segments.append({'name':sn,'n':len(sub),'annual_search_vol':av,'annual_asin_purch':ap,
                     'avg_aps':np.mean([k['avg_aps'] for k in sub if not np.isnan(k['avg_aps'])]) if any(not np.isnan(k['avg_aps']) for k in sub) else np.nan,
                     'monthly_share':ms,'monthly_purch':mpur})

# material & style tag aggregates
def tag_agg(tagname):
    vals=defaultdict(list)
    for k in keywords:
        t=k[tagname]
        if t: vals[t].append(k)
    out=[]
    for t,sub in vals.items():
        av=sum(k['annual_search_vol'] for k in sub); ap=sum(k['annual_asin_purch'] for k in sub)
        out.append({'tag':t,'n':len(sub),'annual_search_vol':av,'annual_asin_purch':ap,
                    'avg_aps':np.mean([k['avg_aps'] for k in sub if not np.isnan(k['avg_aps'])]) if any(not np.isnan(k['avg_aps']) for k in sub) else np.nan})
    return sorted(out,key=lambda x:-x['annual_asin_purch'])
material_agg=tag_agg('material'); style_agg=tag_agg('style'); scene_agg=tag_agg('scene')

# ---- opportunity / risk (curated lists) ----
vol_arr=np.array([k['annual_search_vol'] for k in keywords if not np.isnan(k['annual_search_vol'])])
aps_arr=np.array([k['avg_aps'] for k in keywords if not np.isnan(k['avg_aps'])])
vol_med=np.median(vol_arr); aps_med=np.median(aps_arr)
vol_p75=np.percentile(vol_arr,75); vol_p50=np.percentile(vol_arr,50)
aps_p75=np.percentile(aps_arr,75); aps_p25=np.percentile(aps_arr,25)

def g(k,key):
    v=k[key]
    return v if (v is not None and not (isinstance(v,float) and np.isnan(v))) else np.nan

def eff_out(k):
    """return opportunity/risk efficiency signals"""
    ctr_adv = (k['asin_ctr']-k['market_ctr']) if (not np.isnan(k['asin_ctr']) and not np.isnan(k['market_ctr'])) else np.nan
    purch_adv = (k['asin_purch_rate']-k['market_purch_rate']) if (not np.isnan(k['asin_purch_rate']) and not np.isnan(k['market_purch_rate'])) else np.nan
    cvr_adv = (k['asin_cvr']-k['market_cvr']) if (not np.isnan(k['asin_cvr']) and not np.isnan(k['market_cvr'])) else np.nan
    return ctr_adv, purch_adv, cvr_adv

def common_fields(k):
    ctr_adv, purch_adv, cvr_adv = eff_out(k)
    return {
        'query':k['query'],'annual_search_vol':k['annual_search_vol'],'annual_asin_purch':k['annual_asin_purch'],
        'avg_ais':k['avg_ais'],'avg_acs':k['avg_acs'],'avg_acas':k['avg_acas'],'avg_aps':k['avg_aps'],
        'asin_ctr':k['asin_ctr'],'market_ctr':k['market_ctr'],
        'asin_purch_rate':k['asin_purch_rate'],'market_purch_rate':k['market_purch_rate'],
        'asin_cvr':k['asin_cvr'],'market_cvr':k['market_cvr'],
        'ctr_adv':ctr_adv,'purch_adv':purch_adv,'cvr_adv':cvr_adv,
        'vol_trend':g(k,'vol_trend'),'aps_trend':g(k,'aps_trend'),
        'ais_trend':g(k,'ais_trend'),'acs_trend':g(k,'acs_trend'),
        'category':k['category'],'stable':k['stable'],
    }

# Opportunity: high demand (top quartile) but low ASIN purchase share, with efficiency advantage
def opp_score(k):
    if np.isnan(k['annual_search_vol']) or np.isnan(k['avg_aps']): return -1
    ctr_adv, purch_adv, cvr_adv = eff_out(k)
    score=0
    if k['annual_search_vol']>=vol_p75: score+=3
    elif k['annual_search_vol']>=vol_p50: score+=1
    if k['avg_aps']<aps_med: score+=2
    if k['avg_ais']<aps_med: score+=1
    if (not np.isnan(ctr_adv) and ctr_adv>0.001): score+=1
    if (not np.isnan(purch_adv) and purch_adv>0.001): score+=2
    if (not np.isnan(cvr_adv) and cvr_adv>0): score+=1
    return score

opportunity=[]
for k in keywords:
    s=opp_score(k)
    if s>=4:
        d=common_fields(k)
        # tag why it is an opportunity
        tags=[]
        if k['annual_search_vol']>=vol_p75: tags.append('高需求')
        if k['avg_aps']<aps_med: tags.append('低购买份额')
        if k['avg_ais']<aps_med: tags.append('低曝光份额')
        ctr_adv, purch_adv, cvr_adv = eff_out(k)
        if (not np.isnan(ctr_adv) and ctr_adv>0.001): tags.append('CTR优')
        if (not np.isnan(purch_adv) and purch_adv>0.001): tags.append('转化率优')
        d['opp_tags']=' / '.join(tags)
        opportunity.append(d)
# rank by score then by search volume
opportunity=sorted(opportunity,key=lambda x:(-len(x['opp_tags'].split(' / ')),-x['annual_search_vol']))[:40]

# Strength: stable keywords with highest ASIN purchase share (basic moat), enriched with efficiency signals
strength=[k for k in keywords if k['stable'] and not np.isnan(k['avg_aps'])]
strength=sorted(strength,key=lambda x:-x['avg_aps'])[:30]
strength_out=[]
for k in strength:
    d=common_fields(k)
    ctr_adv, purch_adv, cvr_adv = eff_out(k)
    tags=[]
    if k['avg_aps']>=aps_p75: tags.append('高份额')
    elif k['avg_aps']>=aps_med: tags.append('份额中上')
    if (not np.isnan(purch_adv) and purch_adv>0.001): tags.append('转化率优')
    elif (not np.isnan(purch_adv) and purch_adv<-0.001): tags.append('转化率弱')
    if (not np.isnan(ctr_adv) and ctr_adv>0.001): tags.append('CTR优')
    elif (not np.isnan(ctr_adv) and ctr_adv<-0.001): tags.append('CTR弱')
    d['str_tags']=' / '.join(tags)
    strength_out.append(d)
strength=strength_out

# Decline / rise: stable keywords with notable trend in volume, share, or exposure
decline=[]; rise=[]
for k in stable_kw:
    vt=g(k,'vol_trend'); at=g(k,'aps_trend'); ait=g(k,'ais_trend'); act=g(k,'acs_trend')
    d=common_fields(k)
    d['ais_trend']=ait; d['acs_trend']=act
    worst=min(vt if not np.isnan(vt) else 0, at if not np.isnan(at) else 0, ait if not np.isnan(ait) else 0, act if not np.isnan(act) else 0)
    best=max(vt if not np.isnan(vt) else 0, at if not np.isnan(at) else 0, ait if not np.isnan(ait) else 0, act if not np.isnan(act) else 0)
    if worst< -0.15:
        tags=[]
        if (not np.isnan(vt) and vt< -0.15): tags.append('需求下滑')
        if (not np.isnan(at) and at< -0.15): tags.append('购买份额下滑')
        if (not np.isnan(ait) and ait< -0.15): tags.append('曝光份额下滑')
        if (not np.isnan(act) and act< -0.15): tags.append('点击份额下滑')
        d['dec_tags']=' / '.join(tags)
        decline.append(d)
    if best> 0.15:
        tags=[]
        if (not np.isnan(vt) and vt> 0.15): tags.append('需求上升')
        if (not np.isnan(at) and at> 0.15): tags.append('购买份额上升')
        if (not np.isnan(ait) and ait> 0.15): tags.append('曝光份额上升')
        if (not np.isnan(act) and act> 0.15): tags.append('点击份额上升')
        d['rise_tags']=' / '.join(tags)
        rise.append(d)
decline=sorted(decline,key=lambda x:-(min(x['vol_trend'] if not np.isnan(x['vol_trend']) else 0,
                                            x['aps_trend'] if not np.isnan(x['aps_trend']) else 0,
                                            x['ais_trend'] if not np.isnan(x['ais_trend']) else 0,
                                            x['acs_trend'] if not np.isnan(x['acs_trend']) else 0)))
rise=sorted(rise,key=lambda x:-(max(x['vol_trend'] if not np.isnan(x['vol_trend']) else 0,
                                        x['aps_trend'] if not np.isnan(x['aps_trend']) else 0,
                                        x['ais_trend'] if not np.isnan(x['ais_trend']) else 0,
                                        x['acs_trend'] if not np.isnan(x['acs_trend']) else 0)))

# ---- price analysis (top keywords by asin purchases) ----
top_by_purch=sorted([k for k in keywords if not np.isnan(k['annual_asin_purch'])],key=lambda x:-x['annual_asin_purch'])[:25]
price_compare=[]
for k in top_by_purch:
    # avg market median price across months
    mp=[k['monthly'][ym]['m_price'] for ym in months if k['monthly'][ym] and k['monthly'][ym]['m_price'] is not None and not (isinstance(k['monthly'][ym]['m_price'],float) and np.isnan(k['monthly'][ym]['m_price']))]
    price_compare.append({'query':k['query'],'annual_asin_purch':k['annual_asin_purch'],
        'avg_market_price':np.mean(mp) if mp else np.nan,'avg_aps':k['avg_aps'],'category':k['category']})

# ---- summary numbers for narrative ----
tot_year_vol=sum(m['search_vol'] for m in monthly)
tot_year_asin_purch=sum(m['asin_purch'] for m in monthly)
tot_year_m_purch=sum(m['m_purch'] for m in monthly)
avg_asin_purch_share=np.mean([m['asin_purch_share'] for m in monthly if not np.isnan(m['asin_purch_share'])])
first_share=monthly[0]['asin_purch_share']; last_share=monthly[-1]['asin_purch_share']
first_vol=monthly[0]['search_vol']; last_vol=monthly[-1]['search_vol']
allkw=set(k['query'] for k in keywords)
# stable panel trends
sp_first=stable_monthly[0]['asin_purch_share']; sp_last=stable_monthly[-1]['asin_purch_share']
sp_first_vol=stable_monthly[0]['search_vol']; sp_last_vol=stable_monthly[-1]['search_vol']
summary={
  'asin':ASIN,'market':MARKET,'product':PRODUCT,'n_months':len(months),'months':months,'month_labels':month_labels,
  'n_keywords_per_month':monthly[0]['n_keywords'],'n_distinct_keywords':len(allkw),
  'n_stable_keywords':len(stable_kw),
  'tot_year_vol':tot_year_vol,'tot_year_asin_purch':tot_year_asin_purch,
  'tot_year_m_purch':tot_year_m_purch,'avg_asin_purch_share':avg_asin_purch_share,
  'first_share':first_share,'last_share':last_share,
  'first_vol':first_vol,'last_vol':last_vol,
  'vol_growth':(last_vol-first_vol)/first_vol if first_vol else np.nan,
  'share_change':(last_share-first_share),
  'sp_first_share':sp_first,'sp_last_share':sp_last,
  'sp_share_change':(sp_last-sp_first),
  'sp_vol_growth':(sp_last_vol-sp_first_vol)/sp_first_vol if sp_first_vol else np.nan,
  'asin_price': float(ASIN_PRICE) if ASIN_PRICE else _AP_DEFAULT,'vol_med':vol_med,'aps_med':aps_med,
}

# json sanitize
def jn(x):
    if x is None: return None
    try:
        xf=float(x)
    except: return None
    if math.isnan(xf) or math.isinf(xf): return None
    return round(xf,4)

def clean(o):
    if isinstance(o,dict):
        return {k:clean(v) for k,v in o.items()}
    if isinstance(o,list):
        return [clean(v) for v in o]
    if isinstance(o,(int,float)):
        return jn(o)
    return o

data={
 'meta':{'asin':ASIN,'market':MARKET,'product':PRODUCT,'months':months,'month_labels':month_labels,
         'n_keywords_per_month':monthly[0]['n_keywords'],'n_distinct_keywords':len(allkw),
         'generated':datetime.now().strftime('%Y-%m-%d %H:%M')},
 'monthly':clean(monthly),
 'stable_monthly':clean(stable_monthly),
 'keywords':clean(keywords),
 'segments':clean(segments),
 'material_agg':clean(material_agg),'style_agg':clean(style_agg),'scene_agg':clean(scene_agg),
 'opportunity':clean(opportunity),
 'strength':clean(strength),
 'decline':clean(decline),
 'rise':clean(rise),
 'price_compare':clean(price_compare),
 'summary':clean(summary),
 'seg_names':seg_names,
}
with open(os.path.join(OUT,'dashboard_data.json'),'w',encoding='utf-8') as f:
    json.dump(data,f,ensure_ascii=False)

# quick console summary
print("\n=== SUMMARY ===")
print("months:",months)
print("distinct keywords:",len(allkw))
print("year search vol:",f"{tot_year_vol:,.0f}")
print("year ASIN purchases:",f"{tot_year_asin_purch:,.0f}")
print("year market purchases:",f"{tot_year_m_purch:,.0f}")
print("avg ASIN purchase share %:",round(avg_asin_purch_share,3))
print("first->last share %:",round(first_share,3),"->",round(last_share,3))
print("vol growth %:",round((last_vol-first_vol)/first_vol*100,1))
print("segments:",[(s['name'],round(s['annual_asin_purch'],1)) for s in segments])
print("opportunity:",len(opportunity),"strength:",len(strength),"decline:",len(decline),"rise:",len(rise))
print("stable panel share first->last:",round(sp_first,4),"->",round(sp_last,4))
print("stable panel vol growth %:",round((sp_last_vol-sp_first_vol)/sp_first_vol*100,1))
print("done.")


