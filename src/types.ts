/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SQPRow {
  kw: string;
  qc: number;
  asin: string;
  imp: number;
  clk: number;
  ord: number;
  mp: string;
  ap: string;
  tc: number;
  to: number;
  buyShare: number;
  clickShare: number;
  impShare: number;
  marketCVR: number;
  asinCVR: number;
  clickImpRatio: number;
  buyClickRatio: number;
  convTag: string;
  convClass: string;
  advice: string;
  adviceColor: string;
  marketPrice: number;
  asinPrice: number;
  ti?: number;
  marketCTR: number;
  asinCTR: number;
}

export interface CompareRow {
  kw: string;
  qc_current: number;
  qc_next: number;
  qc_change: number;
  ord_current: number;
  ord_next: number;
  ord_change: number;
  clk_current: number;
  clk_next: number;
  clk_change: number;
  imp_current: number;
  imp_next: number;
  imp_change: number;
  buyShare_current: number;
  buyShare_next: number;
  buyShare_change: number;
  clickShare_current: number;
  clickShare_next: number;
  clickShare_change: number;
  impShare_current: number;
  impShare_next: number;
  impShare_change: number;
  marketPrice_current: number;
  marketPrice_next: number;
  marketPrice_change: number;
  asinPrice_current: number;
  asinPrice_next: number;
  asinPrice_change: number;
  marketCTR_current: number;
  marketCTR_next: number;
  marketCTR_change: number;
  asinCTR_current: number;
  asinCTR_next: number;
  asinCTR_change: number;
  marketCVR_current: number;
  marketCVR_next: number;
  marketCVR_change: number;
  asinCVR_current: number;
  asinCVR_next: number;
  asinCVR_change: number;
  trend: string;
  to_current?: number;
  to_next?: number;
  tc_current?: number;
  tc_next?: number;
  ti_current?: number;
  ti_next?: number;
}

export interface AdsRow {
  kw: string;
  fr: number;
  im: number;
  cl: number;
  ct: number;
  cp: number;
  sp: number;
  ts: number;
  ds: number;
  ac: number;
  to: number;
  do: number;
  ca: number;
  cv: number;
  aos: number;
  adSpendShare: number;
  attrTag: string;
  attrClass: string;
  t: string; // Advice text
  c: string; // Advice level color
  dr: number; // Direct order ratio
}

export interface CrossRow {
  kw: string;
  qc: number;
  sqpClk: number;
  adsClk: number;
  sqpOrd: number;
  adsOrd: number;
  totOrd: number;
  sqpBuyShare: number;
  sqpNaturalShare: number;
  adsOrderShare: number;
  adSpendShare: number;
  marketCvr: number;
  budTag: string;
  budClass: string;
  chanTag: string;
  chanClass: string;
  sqpCvr: number;
  adsCvr: number;
  cvrRatio: number;
  tag: string;
  tagClass: string;
  advice: string;
  adsSpend: number;
  adsCpc: number;
  adsSales?: number;
  naturalSales?: number;
  acos?: number;
  tacos?: number;
  quadrantTag?: string;
  quadrantClass?: string;
  quadrantShortDecision?: string;
  quadrantShortClass?: string;
  quadrantDecision?: string;
}

export interface AdsCompareRow {
  kw: string;
  imp_current: number;
  imp_next: number;
  imp_change: number;
  cl_current: number;
  cl_next: number;
  cl_change: number;
  sp_current: number;
  sp_next: number;
  sp_change: number;
  ts_current: number;
  ts_next: number;
  ts_change: number;
  ac_current: number;
  ac_next: number;
  ac_change: number;
  to_current: number;
  to_next: number;
  to_change: number;
  cvr_current: number;
  cvr_next: number;
  cvr_change: number;
  aos_current: number;
  aos_next: number;
  aos_change: number;
  adSpendShare_current: number;
  adSpendShare_next: number;
  adSpendShare_change: number;
  trend: string;
}
