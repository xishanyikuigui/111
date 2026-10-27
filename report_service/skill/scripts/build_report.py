# -*- coding: utf-8 -*-
"""编排脚本：把【全年搜索绩效 SQP】+【近 30 天广告报告】合并生成为统一 HTML 报告。

完整流程（与已验证的报告管道一致）：
  1) analysis.py      : 12 份月度 SQP CSV -> dashboard_data.json（年度搜索绩效 + 交叉指标）
  2) 复制 dashboard_data.json -> .tmp_ad/sqp.json
  3) ad_to_pkl.py     : 广告活动/搜索词/投放 3 CSV -> .tmp_ad/*.pkl（可选；无广告则跳过）
  4) 注入模板         : template.html 的 __DATA__ 替换为 dashboard_data.json -> Part1 HTML
  5) gen_ad_report.py : 读取 pickle + sqp.json 生成 Part2 并合并；无广告时仅保留 Part1
  6) 复制 echarts.min.js 到输出目录（报告离线可看）

用法：
  # 含广告：合并报告（第一部分 SQP + 第二部分 广告）
  python scripts/build_report.py --sqp <SQP目录> --ad <广告CSV目录> --out <输出目录> \
      [--asin B09TR9J6Q4] [--market US] [--product "商品名"] [--price 26.99]
  # 仅 SQP：只生成第一部分《年度搜索绩效报告》
  python scripts/build_report.py --sqp <SQP目录> --out <输出目录> \
      [--asin ...] [--market ...] [--product ...] [--price ...]
  说明：--price 留空时售价从 SQP 数据的 asin_price 列推导；--product 留空时用 ASIN 指代。
"""
import os, sys, json, shutil, argparse, subprocess

SKILL_DIR = os.path.dirname(os.path.abspath(__file__))  # this orchestrator lives in <skill>/scripts
ASSETS = os.path.join(SKILL_DIR, '..', 'assets')
SCRIPTS = SKILL_DIR


def run(py_rel, env, cwd):
    p = subprocess.run([sys.executable, os.path.join(SCRIPTS, py_rel)],
                       env=env, cwd=cwd, capture_output=True, text=True)
    if p.returncode != 0:
        sys.exit(f"[build] {py_rel} 失败:\n{p.stdout}\n{p.stderr}")
    return p.stdout


def _ad_present(ad_dir):
    return bool(ad_dir) and os.path.isdir(ad_dir) and any(
        f.lower().endswith('.csv') for f in os.listdir(ad_dir))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sqp', required=True, help='全年 12 份月度 SQP CSV 所在目录')
    ap.add_argument('--ad', default=None, help='近 30 天广告报告（广告活动/搜索词/投放 3 CSV）目录；省略则只生成第一部分')
    ap.add_argument('--out', required=True, help='输出目录（报告与中间产物写入此处）')
    ap.add_argument('--asin', default='B09TR9J6Q4', help='目标 ASIN')
    ap.add_argument('--market', default='US', help='站点/市场，如 US / JP / DE / UK')
    ap.add_argument('--product', default='', help='商品名（可选，留空则用 ASIN 指代）')
    ap.add_argument('--price', default='', help='该 ASIN 当前售价（可选；留空则从 SQP 数据的 asin_price 列推导）')
    args = ap.parse_args()

    out = os.path.abspath(args.out)
    tmp = os.path.join(out, '.tmp_ad')
    os.makedirs(out, exist_ok=True)
    os.makedirs(tmp, exist_ok=True)
    dash = os.path.join(out, 'search_performance_dashboard.html')

    env = dict(os.environ)
    env.update({'SQP_DIR': os.path.abspath(args.sqp), 'OUT_DIR': out,
                'ASIN': args.asin, 'MARKET': args.market, 'PRODUCT': args.product,
                'TMP_DIR': tmp, 'DASH': dash})
    # 售价：仅当 --price 显式指定时传给子脚本；否则留空，由 analysis.py 从 SQP 数据推导中位数
    if args.price:
        env['ASIN_PRICE'] = str(args.price)

    print("[1/5] 解析全年搜索绩效(SQP) -> dashboard_data.json")
    run('analysis.py', env, out)

    print("[2/5] 复制 sqp.json -> .tmp_ad/")
    shutil.copyfile(os.path.join(out, 'dashboard_data.json'), os.path.join(tmp, 'sqp.json'))

    if _ad_present(args.ad):
        print("[3/5] 转换广告 CSV -> pickle")
        p = subprocess.run([sys.executable, os.path.join(SCRIPTS, 'ad_to_pkl.py'),
                            os.path.abspath(args.ad), tmp], capture_output=True, text=True)
        if p.returncode != 0:
            sys.exit(f"[build] ad_to_pkl 失败:\n{p.stdout}\n{p.stderr}")
        print(p.stdout)
    else:
        print("[3/5] 未提供广告 CSV，跳过 Part2（仅生成年度 SQP 报告）")

    print("[4/5] 注入模板 __DATA__ 并合并广告 Part2")
    tpl = open(os.path.join(ASSETS, 'template.html'), encoding='utf-8').read()
    data = json.load(open(os.path.join(out, 'dashboard_data.json'), encoding='utf-8'))
    html = tpl.replace('__DATA__', json.dumps(data, ensure_ascii=False))
    if '__DATA__' in html:
        sys.exit("[build] 模板注入失败：__DATA__ 未被替换（检查 assets/template.html）")
    open(dash, 'w', encoding='utf-8').write(html)
    run('gen_ad_report.py', env, out)

    print("[5/5] 复制 echarts.min.js")
    shutil.copyfile(os.path.join(ASSETS, 'echarts.min.js'), os.path.join(out, 'echarts.min.js'))

    print(f"\n✅ 报告已生成：{dash}")
    print("   echarts.min.js 已一并复制到该目录，双击 HTML 即可离线查看。")


if __name__ == '__main__':
    main()


