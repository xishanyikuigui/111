# -*- coding: utf-8 -*-
"""将亚马逊广告近 30 天报告（广告活动 / 搜索词 / 投放 3 个 CSV）转为 gen_ad_report.py 所需 pickle。

按表头列自动识别每个 CSV 的角色，因此文件名可以任意（中文卖家后台默认名亦可）：
  - 含「搜索词」列                      -> search_terms.pkl
  - 含「广告产品」列                    -> campaigns.pkl
  - 含「投放方案」（旧格式）或「广告组名称」（新格式）列 -> targets.pkl

兼容两代导出格式：
  旧格式（~2026-08 前）：投放报告含「投放方案 / 投放匹配类型 / 投放状态」列；
  新格式（2026-10 起） ：投放报告改为按广告组+推广商品导出，无上述列，
                        这里用「广告组名称」回填「投放方案」，匹配类型/状态补 '—'。

币种过滤：卖家账户若含多市场（US/CA/JP/DE 等），导出会混入其他币种行；
默认【自动识别】数据中占主导的币种并只保留该币种（也可用环境变量 AD_CURRENCY 强制指定，
设空串则不过滤）。识别到的币种代码会写入 <输出TMP目录>/currency.txt，供 gen_ad_report.py
渲染货币符号（USD→$、JPY→¥、EUR→€、GBP→£、CAD→C$ 等）。被过滤的行数会打印告警。

亚马逊后台导出的 CSV 编码不统一（utf-8-sig / gbk / cp1252 均可能出现），依次尝试多种编码。
目录里若有无关 CSV（无法解码或无法识别角色），自动跳过并告警，不中断流程。
"""
import pandas as pd, os, sys

_ENC_TRIES = ('utf-8-sig', 'utf-8', 'gb18030', 'cp1252')


def read_csv_any(path, **kw):
    last_err = None
    for enc in _ENC_TRIES:
        try:
            return pd.read_csv(path, encoding=enc, **kw)
        except (UnicodeDecodeError, LookupError) as e:
            last_err = e
            continue
    raise RuntimeError(f"无法用 {_ENC_TRIES} 解码 {os.path.basename(path)}：{last_err}")


def detect(path):
    cols = set(read_csv_any(path, nrows=0).columns)
    if '搜索词' in cols:
        return 'search_terms'
    if '广告产品' in cols:
        return 'campaigns'
    if '投放方案' in cols or '广告组名称' in cols:
        return 'targets'
    return None


def normalize(role, df, cur):
    """币种过滤 + 缺失列兼容映射，保证下游 gen_ad_report.py 拿到的列始终齐全。
    cur: 要保留的币种代码（如 'USD'），None 表示不过滤。"""
    # 1) 币种过滤（自动识别或 AD_CURRENCY 指定）
    if cur and '预算货币' in df.columns:
        before = len(df)
        df = df[df['预算货币'].astype(str).str.strip().str.upper() == cur.upper()].copy()
        dropped = before - len(df)
        if dropped:
            print(f"[warn] {role}: 过滤掉非 {cur} 行 {dropped} 条（多市场账户导出）")
    # 2) 投放报告新格式兼容
    if role == 'targets':
        if '投放方案' not in df.columns and '广告组名称' in df.columns:
            df['投放方案'] = df['广告组名称']
        for c in ('投放匹配类型-Targeting match type', '投放状态'):
            if c not in df.columns:
                df[c] = '—'
    return df


def _detect_currency(raw_dfs):
    """从各角色原始 DataFrame 的『预算货币』列自动识别占主导的币种；
    若设置了 AD_CURRENCY 则优先使用；无可识别币种则返回 None（不过滤）。"""
    env = os.environ.get('AD_CURRENCY', '').strip().upper()
    if env:
        return env
    vals = []
    for df in raw_dfs:
        if '预算货币' in df.columns:
            vals += list(df['预算货币'].astype(str).str.strip().str.upper().dropna())
    if not vals:
        return None
    from collections import Counter
    dom = Counter(vals).most_common(1)[0][0]
    return dom


def main():
    if len(sys.argv) < 3:
        print("用法: python ad_to_pkl.py <广告CSV目录> <输出TMP目录>")
        sys.exit(1)
    ad_dir, tmp = sys.argv[1], sys.argv[2]
    os.makedirs(tmp, exist_ok=True)
    roles = {}
    for f in sorted(os.listdir(ad_dir)):
        if not f.lower().endswith('.csv'):
            continue
        p = os.path.join(ad_dir, f)
        try:
            role = detect(p)
        except Exception as e:
            print(f"[warn] 读取/解码失败，跳过: {f} ({e})")
            continue
        if role is None:
            print(f"[warn] 无法识别角色，跳过: {f}")
            continue
        if role in roles:
            print(f"[warn] 角色 {role} 已存在（{os.path.basename(roles[role])}），被 {f} 覆盖")
        roles[role] = p
    missing = [r for r in ('search_terms', 'campaigns', 'targets') if r not in roles]
    if missing:
        sys.exit(f"[ad_to_pkl] 缺少必需的广告报告: {missing}（需要广告活动/搜索词/投放 三种 CSV）")
    # 先读取全部原始数据，用于自动识别主导币种
    raw = {role: read_csv_any(p) for role, p in roles.items()}
    cur = _detect_currency(list(raw.values()))
    print(f"[info] 广告数据主导币种: {cur or '未识别（不过滤）'}")
    if cur:
        with open(os.path.join(tmp, 'currency.txt'), 'w', encoding='utf-8') as fh:
            fh.write(cur)
    for role, p in roles.items():
        df = normalize(role, raw[role], cur)
        df.to_pickle(os.path.join(tmp, role + '.pkl'))
        print(f"[ok] {role} <- {os.path.basename(p)}  ({len(df)} 行)")
    print("done.")


if __name__ == '__main__':
    main()


