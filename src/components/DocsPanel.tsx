/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { FileText, Shield, Sparkles, TrendingUp, HelpCircle } from 'lucide-react';

export default function DocsPanel() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
        <div className="text-center max-w-2xl mx-auto space-y-2 mb-8">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-100">
            <Sparkles className="w-3 h-3" /> 最新引擎标准 v2.1
          </span>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">全模块指标字段定义与自动打标逻辑</h2>
          <p className="text-sm text-slate-500">
            本工具专为跨境电商亚马逊运营设计，帮助将原始复杂的 SQP 报表与广告搜索词报告通过融合关系快速转变为高可读性、高指导性的投放动作。
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* SQP Indicator explanation */}
          <div className="border border-slate-100 rounded-lg p-5 bg-slate-50/50 space-y-4">
            <div className="flex items-center gap-2 text-slate-800 font-semibold border-b border-slate-100 pb-2">
              <FileText className="w-5 h-5 text-blue-500" />
              <h3>🔍 搜索绩效分析 (SQP) 核心字段</h3>
            </div>
            <div className="space-y-3 text-xs text-slate-600">
              <div>
                <p className="font-semibold text-slate-700">• 搜索量 / 您的订单 / 点击 / 曝光</p>
                <p className="mt-0.5 leading-relaxed text-slate-500 pl-3">亚马逊品牌分析后台(Search Query Performance)的原始核心分拨数据。体现产品在自然和广告搜索词下的流量基本盘以及成交量。</p>
              </div>
              <div>
                <p className="font-semibold text-slate-700">• 购买占比 / 点击占比 / 曝光占比</p>
                <p className="mt-0.5 leading-relaxed text-slate-500 pl-3">分别代表：该词本ASIN购买量/大盘购买数、ASIN点击/大盘总点击量、ASIN曝光/大盘总曝光量，反映你在具体流量节点的市占水平。</p>
              </div>
              <div>
                <p className="font-semibold text-slate-700">• 大盘点击率 CTR 与 本 ASIN 点击率 CTR</p>
                <p className="mt-0.5 leading-relaxed text-slate-500 pl-3">
                  <b>大盘点击率 CTR：</b>总曝光量/总次数（大盘总点击量 ÷ 大盘总曝光量）。反映该搜索词在整个亚马逊类目大盘的基准吸引力水平。<br />
                  <b>本 ASIN 点击率 CTR：</b>曝光量：ASIN 计数/点击量：ASIN 数量（ASIN点击量 ÷ ASIN曝光量）。衡量本产品在该词下的主图与价格等首屏视觉抓眼球能力。
                </p>
              </div>
              <div>
                <p className="font-semibold text-slate-700">• 点击曝光比 (Ci / 流量力)</p>
                <p className="mt-0.5 leading-relaxed text-slate-500 pl-3">
                  <b>计算公式：</b>点击占比 ÷ 曝光占比。
                  <br />
                  <b>流量力定义：</b>反映 ASIN 在同等曝光量级下攫取流量的效率（吸引度）。若 <b>Ci &gt; 1.0</b>，说明本产品相比同词大盘竞品拥有更强的主图视觉吸引力、更具亮点的核心价格梯度或更高的品牌心智认知，展现了极强的“流量力”。
                </p>
              </div>
              <div>
                <p className="font-semibold text-slate-700">• 购买转化比 (Bi / 承接力)</p>
                <p className="mt-0.5 leading-relaxed text-slate-500 pl-3">
                  <b>计算公式：</b>购买占比 ÷ 点击占比。
                  <br />
                  <b>承接力定义：</b>反映点击进店后的流量向实际成交转化的效率（转化率对比）。若 <b>Bi &gt; 1.0</b>，说明本产品的详情页卖点、A+图文/视频、价格带感知以及用户口碑（Review/QA）完美契合了搜索意图，展现出卓越的页面“承接力”。
                </p>
              </div>
            </div>
          </div>

          {/* Ads raw fields */}
          <div className="border border-slate-100 rounded-lg p-5 bg-slate-50/50 space-y-4">
            <div className="flex items-center gap-2 text-slate-800 font-semibold border-b border-slate-100 pb-2">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              <h3>📢 广告词分析 (Ads) 核心指标</h3>
            </div>
            <div className="space-y-3 text-xs text-slate-600">
              <div>
                <p className="font-semibold text-slate-700">• 广告投入占比</p>
                <p className="mt-0.5 leading-relaxed text-slate-500 pl-3">等于（本词消耗 ÷ 总广告消耗）。指引你当前的广告预算到底都在“烧”给哪些具体的词，对检查核心流量分配和防范黑洞无用词至关重要。</p>
              </div>
              <div>
                <p className="font-semibold text-slate-700">• 直接订单 / 间接转化</p>
                <p className="mt-0.5 leading-relaxed text-slate-500 pl-3">直接订单即点击后24小时内在同一个ASIN下支付的单量。直接订单占比（直接订单/总广告订单）较高，表明词语强正向绑定，推新极其有效。</p>
              </div>
              <div>
                <p className="font-semibold text-slate-700">• CVR / CPA / CTR</p>
                <p className="mt-0.5 leading-relaxed text-slate-500 pl-3">经典广告三围：点击率控制漏斗第一道关，转化率决定能否拿单，CPA决定单均获客需要多少成本。本工具采用动态公式进行联动诊断，直指核心动作。</p>
              </div>
            </div>
          </div>

          {/* New TACOS Field Explanation */}
          <div className="border border-amber-200 rounded-lg p-5 bg-amber-50/20 space-y-4">
            <div className="flex items-center gap-2 text-slate-800 font-semibold border-b border-amber-200 pb-2">
              <TrendingUp className="w-5 h-5 text-amber-600" />
              <h3>📊 交叉融合 - 关键词 TACOS 深度决策 (特色)</h3>
            </div>
            <div className="space-y-3 text-xs text-slate-650">
              <div>
                <p className="font-semibold text-amber-900">• 指标定义公式说明</p>
                <p className="mt-1 leading-relaxed text-amber-950 font-mono bg-white border border-amber-250 p-1.5 rounded text-[10px]">
                  关键词 TACOS = 广告花费 ÷ (广告销售额 + SQP搜索词总订单销售额)
                </p>
                <p className="mt-1 leading-relaxed text-slate-500 pl-2">
                  其中，SQP 销售额采用：<code className="text-slate-750 bg-slate-100 px-1 rounded font-mono">SQP订单 &times; ASIN估算客单价</code> 进行综合拟合。我们将广告与SQP全端销售统筹合并作为分母（避免了由于归因等口径差异导致差值截断为0、造就 TACOS 与 ACoS 恒等的问题），能极度精准、差异化地评估广告流量拉动整体商业大盘的外溢效应。
                </p>
              </div>
              <div>
                <p className="font-semibold text-amber-900">• TACOS 与流量杠杆及蚕食判定</p>
                <p className="mt-0.5 leading-relaxed text-slate-500 pl-2">
                  🚀 <b>良性外溢拉动 (TACOS 走低):</b> 表现出极好的广告对自然流量的外溢拉动力。自然单高额涌现（如排名前三的词），说明全渠道市占走强，即便 ACoS 高昂也应增投维稳。
                </p>
                <p className="mt-1 leading-relaxed text-slate-500 pl-2">
                  ⚠️ <b>警惕自我蚕食 (TACOS 逼近 ACoS):</b> 自然单几乎全无，广告一直在抢单。实际上蚕食了原自然转换位置，不具外溢拉动力，应阶梯调低广告 bid 15-20% 进行压力释空。
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tag rules explanation */}
        <div className="border-t border-slate-100 pt-6 mt-6 space-y-4">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-500" /> 核心策略引擎自动打标规则 (全维固化逻辑)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-150 space-y-2">
              <span className="text-xs px-2 py-0.5 font-semibold bg-emerald-100 text-emerald-800 rounded">SQP 详情承接力</span>
              <ul className="text-xs space-y-1.5 text-slate-500 pt-1">
                <li>🟢 <b>承接力碾压：</b>转化效率比值 &gt; 1.15 且 产品转化率强于大盘同期</li>
                <li>🔴 <b>价格/价值错配：</b>转化比值 &lt; 0.85 且 您的价格较均价偏高，且转化明显偏弱</li>
                <li>⚪ <b>承接力均衡：</b>在标准界限中稳步震荡</li>
              </ul>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-150 space-y-2">
              <span className="text-xs px-2 py-0.5 font-semibold bg-indigo-100 text-indigo-800 rounded">Ads 归因关系</span>
              <ul className="text-xs space-y-1.5 text-slate-500 pt-1">
                <li>🎯 <b>爆款推类型：</b>直接订单占比 &ge; 70%，打爆该款的核心原动力</li>
                <li>🔄 <b>混合转化型：</b>直接订单占比介于 30% ~ 70%，在溢出和相关需求间平衡</li>
                <li>🔗 <b>矩阵引流型：</b>直接订单占比 &lt; 30%，产生矩阵交叉裂变流转</li>
              </ul>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-150 space-y-2">
              <span className="text-xs px-2 py-0.5 font-semibold bg-amber-100 text-amber-800 rounded">Cross 预算效率</span>
              <ul className="text-xs space-y-1.5 text-slate-500 pt-1">
                <li>🟢 <b>高效收割：</b>订单占比高（&gt;10%）且 消耗预算占比偏低（&le;10%），极其暴利</li>
                <li>🟡 <b>规模支撑：</b>订单占比与投入占比双高，属于主要的支撑底盘</li>
                <li>🔴 <b>预算黑洞：</b>曝光大，消耗预算极高（&gt;10%）但实际转化订单偏少（&le;10%）</li>
              </ul>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-150 space-y-2">
              <span className="text-xs px-2 py-0.5 font-semibold bg-purple-100 text-purple-800 rounded">Cross 流量渠道关系</span>
              <ul className="text-xs space-y-1.5 text-slate-500 pt-1">
                <li>🚀 <b>增效型：</b>广告CVR超强（比值&gt;1.2）但自然占比偏弱，具有可贵引流价值</li>
                <li>🛡️ <b>防守型：</b>自然极其牢靠，广告花费较少，低Bid精准维稳</li>
                <li>⚠️ <b>蚕食型：</b>广告CVR明显过低但耗费极大，有可能在抢夺低价自然转化</li>
                <li>🔥 <b>消耗型：</b>双渠道转化偏微，仅空耗巨量广告</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 四象限预算控制逻辑说明 */}
        <div className="border-t border-slate-100 pt-6 mt-6 space-y-4">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-teal-600" /> 关键词核心决策：【四象限预算控制模型】说明
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            四象限模型基于<b>关键词 ACoS（广告投产健康度，阈值选定为 35%）</b>与<b>协同拉动比率（TACOS / ACoS，即自然流量的外溢效益，阈值选定为 0.65，即分母中自然转化占比大盘 35% 以上代表极强协同）</b>两个维度交叉判定，科学化自动输出运营策略：
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-emerald-50/40 p-4 rounded-lg border border-emerald-150 space-y-2">
              <span className="text-xs px-2 py-0.5 font-bold bg-emerald-100 text-emerald-800 rounded">💎 双低明星词</span>
              <p className="text-[11px] font-semibold text-slate-700">条件: ACoS &le; 35% 且 TACOS/ACoS &le; 0.65</p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                <b>特征说明:</b> 直接投产极高（低 ACoS），且自然订单贡献强劲。广告投资起到了显著的外溢拉动。
              </p>
              <p className="text-[11px] text-emerald-800 font-medium">
                <b>下期决策:</b> 全力卡位，追加大量预算（+20%-50%），拉抬 Bid 主动卡占首屏，拓宽核心品类单盘。
              </p>
            </div>

            <div className="bg-teal-50/40 p-4 rounded-lg border border-teal-150 space-y-2">
              <span className="text-xs px-2 py-0.5 font-bold bg-teal-100 text-teal-800 rounded">💰 金牛收割词</span>
              <p className="text-[11px] font-semibold text-slate-700">条件: ACoS &le; 35% 且 TACOS/ACoS &gt; 0.65</p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                <b>特征说明:</b> 直接投产非常完美，但几乎无自然出单关联溢出。属于精准的付费流精准转化词。
              </p>
              <p className="text-[11px] text-teal-800 font-medium">
                <b>下期决策:</b> 稳健投放，不急躁追加巨额预算。建议精细化分时投放，精调出价以固守核心转化大盘。
              </p>
            </div>

            <div className="bg-amber-50/40 p-4 rounded-lg border border-amber-150 space-y-2">
              <span className="text-xs px-2 py-0.5 font-bold bg-amber-100 text-amber-800 rounded">🔋 战略拉动词</span>
              <p className="text-[11px] font-semibold text-slate-700">条件: ACoS &gt; 35% 且 TACOS/ACoS &le; 0.65</p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                <b>特征说明:</b> 广告直接账面亏损（高 ACoS），但自然成交极旺、TACOS 被极大拉低。属于品类承重支柱。
              </p>
              <p className="text-[11px] text-amber-800 font-medium">
                <b>下期决策:</b> <b>绝对不可停投！</b>这属于核心流量柱石。应微弱回调出价（Bid-5~10%）提效，坚守预算阵地。
              </p>
            </div>

            <div className="bg-rose-50/40 p-4 rounded-lg border border-rose-150 space-y-2">
              <span className="text-xs px-2 py-0.5 font-bold bg-rose-100 text-rose-800 rounded">🗑️ 亏损黑洞词</span>
              <p className="text-[11px] font-semibold text-slate-700">条件: ACoS &gt; 35% 且 TACOS/ACoS &gt; 0.65</p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                <b>特征说明:</b> 广告高额赤损，且完全没有任何自然端订单溢出，产生纯粹的资金流失。
              </p>
              <p className="text-[11px] text-rose-800 font-medium font-semibold">
                <b>下期决策:</b> 止损重锤。立即削减 20%-35% 预算预算，大幅调低 Bid -20% 匹配捡漏，或做否定处理。
              </p>
            </div>
          </div>
        </div>

        <div className="bg-amber-50/50 p-4 rounded-lg border border-amber-100 flex gap-3 text-amber-800 text-xs mt-6 leading-relaxed">
          <HelpCircle className="w-5 h-5 shrink-0 text-amber-500" />
          <div>
            <p className="font-semibold text-amber-900 mb-0.5">💡 运营实战提示</p>
            <p>1. 数据解析采用浏览器本地算效进行，没有任何上行隐私传输风险，安全度极高。建议下载前缀为 Search Query Performance 的CSV/TXT；由于中文字符问题，若直接拉取后台原始多选字符，工作台会主动进行关键词拼配和字符剔除。</p>
            <p className="mt-1">2. 环比对比要求【当前时段】与【下一个时段】关键词有交集。系统将根据交集数据提供最直接的大盘趋势判定及调价方案。</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
