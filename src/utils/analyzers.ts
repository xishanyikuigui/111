/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SQPRow, AdsRow, CrossRow, CompareRow } from '../types';

export function cleanNum(val: any): number {
  if (val === undefined || val === null) return 0;
  return parseFloat(String(val).replace(/,/g, '').replace(/[$¥€£]/g, '').trim()) || 0;
}

export function cleanPct(val: any): number {
  if (val === undefined || val === null) return 0;
  const str = String(val).trim();
  const n = parseFloat(str) || 0;
  return str.includes('%') ? n / 100 : (n > 1 ? n / 100 : n);
}

export function cleanSqpShare(val: any): number {
  if (val === undefined || val === null) return 0;
  const str = String(val).trim();
  if (!str) return 0;
  const cleanStr = str.replace(/%/g, '').replace(/,/g, '').trim();
  const n = parseFloat(cleanStr) || 0;
  return n / 100;
}

export function parsePriceStr(p: any): number {
  if (!p || p === '-') return 0;
  const num = parseFloat(String(p).replace(/[^0-9.]/g, ''));
  return isNaN(num) ? 0 : num;
}

export function getDiagnosis(r: { impShare: number; clickShare: number; buyShare: number }) {
  const ci = r.impShare > 0 ? r.clickShare / r.impShare : 0;
  const bi = r.clickShare > 0 ? r.buyShare / r.clickShare : 0;
  if (ci < 0.85 && bi < 0.85) {
    return {
      ad: `⚠️ 全链路衰减 (点击/曝光 ${ci.toFixed(2)}x, 购买/点击 ${bi.toFixed(2)}x)：主图曝光到点击不佳，且点击到购买转化弱。建议系统性排查主图质感、多维A/B测试，优化评价与首屏价格。`,
      c: 'badge-red'
    };
  }
  if (ci < 0.85) {
    return {
      ad: `👁️ 曝光转化瓶颈 (点击/曝光效率 ${ci.toFixed(2)}x)：搜索曝光充足，但未能成功吸引点击。建议深度优化主图背景、精修首图、优化标题关键词前置，或加入价格促销/Coupon标志增幅吸引力。`,
      c: 'badge-yellow'
    };
  }
  if (bi < 0.85) {
    return {
      ad: `🛒 点击转化瓶颈 (购买/点击转化 ${bi.toFixed(2)}x)：进店流量无转化承接。建议深度复盘详情页，改善Q&A答疑、补充核心客怨的A+页说明、针对好评置顶，或搭配折扣券拦截跳失。`,
      c: 'badge-red'
    };
  }
  if (ci >= 1.15 && bi >= 1.15) {
    return {
      ad: `🏆 双效黄金收割词 (点击/曝光 ${ci.toFixed(2)}x, 购买/点击 ${bi.toFixed(2)}x)：主力高优流量词。建议在预算内不限幅提高广告竞价(Bid)锁定首页首位，保护核心搜索排名，并开启品牌防御词策略。`,
      c: 'badge-green'
    };
  }
  return {
    ad: `✅ 全能健康词 (点击/曝光 ${ci.toFixed(2)}x, 购买/点击 ${bi.toFixed(2)}x)：转化指标在大盘上运行平稳。建议维持现有竞价和推送频次，在日常预算中优先守护此队列，定期监控竞品策略。`,
    c: 'badge-blue'
  };
}

export function getDynamicThresholds(cfg: { targetAcos: number; targetCpa: number; margin: number }) {
  // 1. Calculate implied item price based on Target CPA and Target ACoS
  const impliedPrice = cfg.targetCpa / Math.max(0.01, cfg.targetAcos / 100);
  
  // 2. Typical CPC based on price (higher price has higher bidding density/CPC)
  const typicalCpc = 0.3 + 0.02 * Math.min(200, impliedPrice);
  
  // 3. Implied target CVR to achieve target CPA
  const targetCvr = typicalCpc / Math.max(0.1, cfg.targetCpa);
  
  // 4. Set CVR warning threshold as 35% of target CVR, adjusted by margin strain
  let marginStrainFactor = 1.0;
  if (cfg.margin < cfg.targetAcos) {
    marginStrainFactor = Math.min(2.0, cfg.targetAcos / Math.max(1, cfg.margin));
  }
  
  let dynamicCvrLimit = targetCvr * 0.35 * marginStrainFactor;
  const finalCvrThreshold = Math.min(Math.max(dynamicCvrLimit, 0.012), 0.06);

  // 5. Set CTR warning threshold
  let baseCtrLimit = 0.02; // Baseline 2%
  if (cfg.targetCpa > 8) {
    baseCtrLimit *= Math.sqrt(8 / cfg.targetCpa);
  } else {
    baseCtrLimit *= Math.max(0.6, (8 / cfg.targetCpa) ** 0.3);
  }
  const finalCtrThreshold = Math.min(Math.max(baseCtrLimit, 0.008), 0.035);

  return {
    impliedPrice,
    typicalCpc,
    cvrThreshold: finalCvrThreshold,
    ctrThreshold: finalCtrThreshold
  };
}

export function getAdsDiag(
  r: { to: number; do: number; ct: number; im: number; cv: number; cl: number; ac: number; ca: number },
  cfg: { targetAcos: number; targetCpa: number; margin: number; targetCtr?: number; targetCvr?: number }
) {
  let t = '';
  let c = 'badge-blue';
  const dr = r.to > 0 ? r.do / r.to : 0;

  const dyn = getDynamicThresholds(cfg);
  
  // Convert CTR/CVR percentage values from sliders (e.g., 2.0%) to decimal ratios (e.g., 0.02)
  const ctrThreshold = (cfg.targetCtr !== undefined) ? cfg.targetCtr / 100 : dyn.ctrThreshold;
  const cvrThreshold = (cfg.targetCvr !== undefined) ? cfg.targetCvr / 100 : dyn.cvrThreshold;

  if (r.ct < ctrThreshold && r.im > 50) {
    t = `👁️ CTR偏低(${(r.ct * 100).toFixed(1)}% < 诊断线 ${(ctrThreshold * 100).toFixed(1)}%)：首位吸引力不足。基于自定义诊断阀值测算，点击率跑输预期，建议精修主视觉/首图，或调整广告位溢价。`;
    c = 'badge-yellow';
  } else if (r.cv < cvrThreshold && r.cl > 15) {
    t = `🛒 广告CVR不振(${(r.cv * 100).toFixed(1)}% < 诊断线 ${(cvrThreshold * 100).toFixed(1)}%)：承接力滞后，基于自定义诊断阀值测算，转化偏低，建议增配限时秒杀或大额置换 Coupon。`;
    c = 'badge-red';
  } else if (r.ac > cfg.targetAcos / 100 * 1.3) {
    t = `💰 ACoS超标(${(r.ac * 100).toFixed(1)}% > ${(cfg.targetAcos * 1.3).toFixed(1)}%)：推广费高侵蚀毛利，建议下调出价(Bid)约 10%-20%，切精准匹配或执行否定词词根。`;
    c = 'badge-red';
  } else if (r.ca > cfg.targetCpa * 1.5 && r.to > 0) {
    t = `📉 CPA偏高($${r.ca.toFixed(2)} > 指导价 $${(cfg.targetCpa * 1.5).toFixed(2)})：单均获客成本昂贵。建议控制搜索首屏位置加价比值。`;
    c = 'badge-yellow';
  } else if (dr < 0.3 && r.to > 5) {
    t = `🔗 间接跳转转化为主(${(dr * 100).toFixed(0)}%)：主商品直接收割弱。应部署店铺关联、防备其他竞品低价劫流。`;
    c = 'badge-blue';
  } else if (r.ac <= cfg.targetAcos / 100 * 0.8 && r.cv >= 0.05) {
    t = `🏆 广告黄金明星：超高产出性能(ACoS ${(r.ac * 100).toFixed(1)}%)。黄金收割位。建议不设上限保障每日预算无间断承托。`;
    c = 'badge-green';
  } else {
    t = `✅ 常规稳态词：转化率 ${((r.cv || 0) * 100).toFixed(1)}% / ACoS ${((r.ac || 0) * 100).toFixed(1)}%，处于稳态观察期，维持常规投放。`;
    c = 'badge-blue';
  }
  return { t, c, dr };
}

export function getTrendInterpretation(cur: any, nxt: any): string {
  const parts: string[] = [];
  if (nxt.qc > cur.qc * 1.2) parts.push('搜索查询量暴涨(>20%)');
  else if (nxt.qc < cur.qc * 0.8) parts.push('大盘需求下滑(>20%)');

  if (nxt.buyShare > cur.buyShare + 0.03) parts.push('您在此词的购买占比明显提升');
  else if (nxt.buyShare < cur.buyShare - 0.03) parts.push('购买占有率明显流失');

  if (nxt.clickShare > cur.clickShare + 0.03) parts.push('流量分拨能力增强');
  else if (nxt.clickShare < cur.clickShare - 0.03) parts.push('流量获取占比下降');

  if (nxt.marketPrice > cur.marketPrice * 1.1) parts.push('市场均价微涨');
  else if (nxt.marketPrice < cur.marketPrice * 0.9) parts.push('市场竞合降级/竞品调价');

  if (nxt.asinPrice > cur.asinPrice * 1.1) parts.push('您提价');
  else if (nxt.asinPrice < cur.asinPrice * 0.9) parts.push('主战价段向下促销');

  if (nxt.asinCTR > cur.asinCTR * 1.15 && cur.asinCTR > 0) parts.push('本ASIN点击率大幅跃升(>15%)，首图吸引力凸显');
  else if (nxt.asinCTR < cur.asinCTR * 0.85 && cur.asinCTR > 0) parts.push('本ASIN点击率出现下滑(>15%)，主图/首屏吸引力承压');

  if (nxt.marketCTR > cur.marketCTR * 1.15 && cur.marketCTR > 0) parts.push('大盘点击率提升(>15%)');
  else if (nxt.marketCTR < cur.marketCTR * 0.85 && cur.marketCTR > 0) parts.push('大盘点击率走弱(>15%)');

  if (nxt.asinCVR > cur.asinCVR * 1.2) parts.push('产品转化力升阶');
  else if (nxt.asinCVR < cur.asinCVR * 0.8) parts.push('转化率受创，排查评价或竞品打野');

  if (nxt.marketCVR > cur.marketCVR * 1.15) parts.push('大盘转化率明显上升(>15%)');
  else if (nxt.marketCVR < cur.marketCVR * 0.85 && cur.marketCVR > 0) parts.push('大盘需求转化走弱(>15%)');

  if (parts.length === 0) return '环比表现平稳，微幅震荡波动';
  return parts.join('；');
}

export function getAdsTrendInterpretation(cur: any, nxt: any): string {
  const parts: string[] = [];
  if (nxt.im > cur.im * 1.2) parts.push('曝光大幅增长(>20%)');
  else if (nxt.im < cur.im * 0.8) parts.push('曝光明显下滑(>20%)');

  if (nxt.sp > cur.sp * 1.3) parts.push('花费激增(>30%)');
  else if (nxt.sp < cur.sp * 0.7 && cur.sp > 0) parts.push('花费收紧(>30%)');

  if (nxt.ac > cur.ac + 0.05) parts.push('ACoS恶化(>5pp)');
  else if (nxt.ac < cur.ac - 0.05 && cur.ac > 0) parts.push('ACoS改善(>5pp)');

  if (nxt.cv > cur.cv + 0.05) parts.push('CVR提升(>5pp)');
  else if (nxt.cv < cur.cv - 0.05 && cur.cv > 0) parts.push('CVR下降(>5pp)');

  if (parts.length === 0) return '环比基本持平，微幅动态波动';
  return parts.join('，');
}

