/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect, MouseEvent } from 'react';
import { motion } from 'motion/react';
import * as XLSX from 'xlsx';
import { 
  GitCompare, Search, Download, HelpCircle, Sliders, 
  Sparkles, Filter, ChevronDown, CheckCircle, TrendingUp, Cpu
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend
} from 'recharts';
import { SQPRow, AdsRow, CrossRow, CompareRow, AdsCompareRow } from '../types';

const CustomChartTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const sqpItem = payload.find((p: any) => p.dataKey === 'SQP自然转化率');
    const adsItem = payload.find((p: any) => p.dataKey === 'Ads广告转化率');
    const mktItem = payload.find((p: any) => p.dataKey === '大盘CVR');

    const sqpCvr = sqpItem?.value ?? 0;
    const adsCvr = adsItem?.value ?? 0;
    const marketCvr = mktItem?.value ?? 0;
    const ratio = sqpCvr > 0 ? (adsCvr / sqpCvr).toFixed(2) : '—';
    return (
      <div className="bg-slate-900 text-white p-3.5 rounded-xl border border-slate-700 shadow-xl max-w-xs text-xs font-sans">
        <p className="font-bold border-b border-slate-700 pb-1.5 mb-1.5 text-slate-100 flex items-center gap-1.5">
          🔑 <span className="truncate max-w-[200px]">{label}</span>
        </p>
        <div className="space-y-1.5">
          <div className="flex justify-between items-center gap-6">
            <span className="text-slate-400">🍂 SQP 自然转化率:</span>
            <span className="font-mono font-bold text-sky-400">{sqpCvr}%</span>
          </div>
          <div className="flex justify-between items-center gap-6">
            <span className="text-slate-400">📢 Ads 广告转化率:</span>
            <span className="font-mono font-bold text-amber-400">{adsCvr}%</span>
          </div>
          <div className="flex justify-between items-center gap-6">
            <span className="text-slate-400">🌐 大盘基准 CVR:</span>
            <span className="font-mono font-bold text-purple-400">{marketCvr}%</span>
          </div>
          <div className="border-t border-slate-800 my-1 pt-1.5 flex justify-between items-center gap-6 font-semibold">
            <span className="text-slate-400">⚖️ 双端转化比 (Ad/SQP):</span>
            <span className={`font-mono ${parseFloat(ratio) >= 1.2 ? 'text-emerald-400' : parseFloat(ratio) < 0.8 ? 'text-rose-400' : 'text-slate-300'}`}>
              {ratio === '—' ? '—' : `${ratio}x`}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

// Common Amazon English catalog stopwords to filter noise
const STOP_WORDS = new Set([
  'for', 'with', 'of', 'and', 'the', 'a', 'to', 'in', 'by', 'on', 'at', 'under', 'or', 'an', 
  'is', 'are', 'from', 'about', 'as', 'into', 'its', 'your', 'my', 'our', 'with', 'without'
]);

export interface StemRow {
  stem: string;
  type: '1-word' | '2-word' | '3-word';
  keywords: string[];
  count: number;
  totalQc: number;
  totalSqpClk: number;
  totalSqpOrd: number;
  totalAdsClk: number;
  totalAdsOrd: number;
  totalAdsSpend: number;
  sqpCvr: number;
  adsCvr: number;
  cvrRatio: number;
  cpc: number;
  role: string;
  roleClass: string;
  advice: string;
}

// Memory-optimized pure math engine for word stem aggregation
const computeStemAnalysis = (
  rows: CrossRow[], 
  stemType: '1-word' | '2-word' | '3-word' | 'all', 
  hideStopWords: boolean, 
  minFreq: number
): StemRow[] => {
  const stemMap = new Map<string, {
    stem: string;
    type: '1-word' | '2-word' | '3-word';
    keywords: string[];
    count: number;
    totalQc: number;
    totalSqpClk: number;
    totalSqpOrd: number;
    totalAdsClk: number;
    totalAdsOrd: number;
    totalAdsSpend: number;
  }>();

  rows.forEach(r => {
    const rawKw = r.kw.toLowerCase().trim();
    // Normalize and strip structural punctuation, then slice into list of words
    const words = rawKw
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "")
      .split(/\s+/)
      .filter(Boolean);

    // 1-Word Stems Generation
    const singleStems = words.filter(w => !hideStopWords || !STOP_WORDS.has(w));

    // 2-Word Stems (Bi-Grams) Generation
    const doubleStems: string[] = [];
    for (let i = 0; i < words.length - 1; i++) {
      const w1 = words[i];
      const w2 = words[i+1];
      if (hideStopWords && STOP_WORDS.has(w1) && STOP_WORDS.has(w2)) continue;
      doubleStems.push(`${w1} ${w2}`);
    }

    // 3-Word Stems (Tri-Grams) Generation
    const tripleStems: string[] = [];
    for (let i = 0; i < words.length - 2; i++) {
      const w1 = words[i];
      const w2 = words[i+1];
      const w3 = words[i+2];
      if (hideStopWords && STOP_WORDS.has(w1) && STOP_WORDS.has(w2) && STOP_WORDS.has(w3)) continue;
      tripleStems.push(`${w1} ${w2} ${w3}`);
    }

    const stemsToProcess: { val: string; type: '1-word' | '2-word' | '3-word' }[] = [];

    if (stemType === '1-word' || stemType === 'all') {
      const uniqueSingles = Array.from(new Set(singleStems));
      uniqueSingles.forEach(s => stemsToProcess.push({ val: s, type: '1-word' }));
    }
    if (stemType === '2-word' || stemType === 'all') {
      const uniqueDoubles = Array.from(new Set(doubleStems));
      uniqueDoubles.forEach(s => stemsToProcess.push({ val: s, type: '2-word' }));
    }
    if (stemType === '3-word' || stemType === 'all') {
      const uniqueTriples = Array.from(new Set(tripleStems));
      uniqueTriples.forEach(s => stemsToProcess.push({ val: s, type: '3-word' }));
    }

    stemsToProcess.forEach(({ val, type }) => {
      const key = `${type}::${val}`;
      if (!stemMap.has(key)) {
        stemMap.set(key, {
          stem: val,
          type,
          keywords: [r.kw],
          count: 1,
          totalQc: r.qc,
          totalSqpClk: r.sqpClk,
          totalSqpOrd: r.sqpOrd,
          totalAdsClk: r.adsClk,
          totalAdsOrd: r.adsOrd,
          totalAdsSpend: r.adsSpend
        });
      } else {
        const item = stemMap.get(key)!;
        item.count += 1;
        if (!item.keywords.includes(r.kw)) {
          item.keywords.push(r.kw);
        }
        item.totalQc += r.qc;
        item.totalSqpClk += r.sqpClk;
        item.totalSqpOrd += r.sqpOrd;
        item.totalAdsClk += r.adsClk;
        item.totalAdsOrd += r.adsOrd;
        item.totalAdsSpend += r.adsSpend;
      }
    });
  });

  const stemList: StemRow[] = [];
  stemMap.forEach(item => {
    if (item.count < minFreq) return;

    const sqpCvr = item.totalSqpClk > 0 ? (item.totalSqpOrd / item.totalSqpClk) : 0;
    const adsCvr = item.totalAdsClk > 0 ? (item.totalAdsOrd / item.totalAdsClk) : 0;
    const cvrRatio = sqpCvr > 0 ? (adsCvr / sqpCvr) : 0;
    const cpc = item.totalAdsClk > 0 ? (item.totalAdsSpend / item.totalAdsClk) : 0;

    // Advanced Diagnostics Decision Tree
    let role = '⚖️ 常规词群';
    let roleClass = 'bg-slate-50 text-slate-605 border border-slate-200';
    let advice = '转化正常，处于均衡区间，建议保持当前出价，并继续观察该词根长尾延申。';

    if (item.totalAdsSpend > 40 && item.totalAdsOrd === 0) {
      role = '🔴 高耗空砸词根';
      roleClass = 'bg-red-50 text-red-650 border border-red-105';
      advice = '在广告端产生高额花费却未能出单，属于转化死角。强烈建议将该词根作为词组否定（Negative Phrase），切断后续空耗。';
    } else if (cvrRatio > 1.25 && item.totalAdsOrd >= 3) {
      role = '🚀 强增效黄金词根';
      roleClass = 'bg-emerald-50 text-emerald-600 border border-emerald-105';
      advice = '广告段转化率极度压制自然转化段，证明此词根极度吸引匹配客群。建议建立独立的高Bid词根专案组，重点强推卡位。';
    } else if (item.totalSqpOrd >= 5 && item.totalAdsOrd <= 1 && item.totalAdsSpend < 15) {
      role = '🛡️ 自然金牌防守词';
      roleClass = 'bg-purple-50 text-purple-650 border border-purple-105';
      advice = '大盘中此词根自然购买极其强劲，而广告参与度几乎为零。建议仅保留极少度防守广告，将主预算移开，享受自然红利。';
    } else if (cvrRatio < 0.75 && item.totalAdsSpend > 25) {
      role = '⚠️ 广告蚕食极度警觉';
      roleClass = 'bg-amber-50 text-amber-600 border border-amber-105';
      advice = '在此词根产生了明显的花费，但广告转化极其低迷，可能蚕食了原本高转化率的自然基本盘。建议调降Bid出价25%核减投入。';
    } else if (item.totalQc > 2500 && sqpCvr > 0.05 && item.totalAdsOrd === 0) {
      role = '💡 蓝海富矿潜力词';
      roleClass = 'bg-sky-50 text-sky-600 border border-sky-105';
      advice = '大盘流量基数巨大且在大盘中自然购买表现亮眼，但并未开启任何广告测试。建议立刻新建广泛/词组匹配测试组进行发掘。';
    }

    stemList.push({
      ...item,
      sqpCvr,
      adsCvr,
      cvrRatio,
      cpc,
      role,
      roleClass,
      advice
    });
  });

  return stemList;
};

interface CrossPanelProps {
  sqpRows: SQPRow[];
  adsRows: AdsRow[];
  crossRows: CrossRow[];
  setCrossRows: (rows: CrossRow[]) => void;
  compareRows: CompareRow[];
  adsCompareRows: AdsCompareRow[];
  firstColWidth: number;
  setFirstColWidth: (w: number) => void;
}

export default function CrossPanel({
  sqpRows,
  adsRows,
  crossRows,
  setCrossRows,
  compareRows,
  adsCompareRows,
  firstColWidth,
  setFirstColWidth
}: CrossPanelProps) {
  const [activePeriod, setActivePeriod] = useState<'current' | 'next'>('current');
  const [crossNextRows, setCrossNextRows] = useState<CrossRow[]>([]);

  const sqpNextRows = useMemo<SQPRow[]>(() => {
    if (!compareRows || compareRows.length === 0) return [];
    return compareRows.map(c => ({
      kw: c.kw,
      qc: c.qc_next,
      asin: '下期暂存 ASIN',
      imp: c.imp_next,
      clk: c.clk_next,
      ord: c.ord_next,
      mp: c.marketPrice_next ? `$${c.marketPrice_next}` : '-',
      ap: c.asinPrice_next ? `$${c.asinPrice_next}` : '-',
      tc: 0,
      to: 0,
      buyShare: c.buyShare_next,
      clickShare: c.clickShare_next,
      impShare: c.impShare_next,
      marketCVR: c.marketCVR_next,
      asinCVR: c.asinCVR_next,
      clickImpRatio: c.impShare_next > 0 ? c.clickShare_next / c.impShare_next : 0,
      buyClickRatio: c.clickShare_next > 0 ? c.buyShare_next / c.clickShare_next : 0,
      convTag: '',
      convClass: '',
      advice: '',
      adviceColor: '',
      marketPrice: c.marketPrice_next,
      asinPrice: c.asinPrice_next
    }));
  }, [compareRows]);

  const adsNextRows = useMemo<AdsRow[]>(() => {
    if (!adsCompareRows || adsCompareRows.length === 0) return [];
    return adsCompareRows.map(a => ({
      kw: a.kw,
      fr: 0,
      im: a.imp_next,
      cl: a.cl_next,
      ct: a.cl_next > 0 && a.imp_next > 0 ? a.cl_next / a.imp_next : 0,
      cp: a.cl_next > 0 ? a.sp_next / a.cl_next : 0,
      sp: a.sp_next,
      ts: a.ts_next,
      ds: 0,
      ac: a.ac_next,
      to: a.to_next,
      do: 0,
      ca: a.to_next > 0 ? a.sp_next / a.to_next : 0,
      cv: a.cvr_next,
      aos: a.aos_next,
      adSpendShare: a.adSpendShare_next,
      attrTag: '',
      attrClass: '',
      t: '',
      c: '',
      dr: 0
    }));
  }, [adsCompareRows]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');

  // Word Stem Aggregation States
  const [subTab, setSubTab] = useState<'grid' | 'stems'>('grid');
  const [stemType, setStemType] = useState<'1-word' | '2-word' | '3-word' | 'all'>('1-word');
  const [hideStopWords, setHideStopWords] = useState(true);
  const [minFreq, setMinFreq] = useState(1);
  const [stemSearchQuery, setStemSearchQuery] = useState('');
  const [selectedStemRole, setSelectedStemRole] = useState<string | null>(null);
  const [stemSortState, setStemSortState] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'totalQc', dir: 'desc' });
  const [expandedStem, setExpandedStem] = useState<string | null>(null);
  
  // Custom Cross matching thresholds
  const [cvrRatioHigh, setCvrRatioHigh] = useState(1.2);
  const [cvrRatioLow, setCvrRatioLow] = useState(0.8);
  const [shareThresh, setShareThresh] = useState(15); // %

  // Selected keywords for the Recharts conversion comparison chart
  const [selectedChartKws, setSelectedChartKws] = useState<string[]>([]);

  const toggleKwSelection = (kw: string) => {
    setSelectedChartKws(prev => {
      if (prev.includes(kw)) {
        return prev.filter(k => k !== kw);
      } else {
        return [...prev, kw];
      }
    });
  };

  const [limit, setLimit] = useState(100);
  const [sortState, setSortState] = useState<{ key: keyof CrossRow | ''; dir: 'asc' | 'desc' }>({ key: 'cvrRatio', dir: 'desc' });

  // Columns resize state variables
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(firstColWidth);

  const currentActiveRows = useMemo(() => {
    return activePeriod === 'current' ? crossRows : crossNextRows;
  }, [activePeriod, crossRows, crossNextRows]);

  const stats = useMemo(() => {
    if (currentActiveRows.length === 0) return { matchedWords: 0, synergeticCount: 0, defensiveCount: 0, cannibalizationCount: 0 };
    const matchedWords = currentActiveRows.filter(r => r.adsSpend > 0).length;
    const synergeticCount = currentActiveRows.filter(r => r.tag === '🚀 增效词').length;
    const defensiveCount = currentActiveRows.filter(r => r.tag === '🛡️ 自然防守词').length;
    const cannibalizationCount = currentActiveRows.filter(r => r.tag === '⚠️ 低效/蚕食词').length;
    return { matchedWords, synergeticCount, defensiveCount, cannibalizationCount };
  }, [currentActiveRows]);

  // Compute stem list from current active keywords
  const rawStemsList = useMemo(() => {
    return computeStemAnalysis(currentActiveRows, stemType, hideStopWords, minFreq);
  }, [currentActiveRows, stemType, hideStopWords, minFreq]);

  // Filter and sort the stem list
  const processedStemsList = useMemo(() => {
    let result = [...rawStemsList];
    if (stemSearchQuery) {
      const q = stemSearchQuery.toLowerCase().trim();
      result = result.filter(s => 
        s.stem.toLowerCase().includes(q) || 
        (s.keywords && s.keywords.some(kw => kw.toLowerCase().includes(q)))
      );
    }
    if (selectedStemRole) {
      result = result.filter(s => s.role.includes(selectedStemRole));
    }
    
    // Core sorting
    const { key, dir } = stemSortState;
    result.sort((a, b) => {
      let valA = a[key as keyof StemRow];
      let valB = b[key as keyof StemRow];
      if (typeof valA === 'string' && typeof valB === 'string') {
        return dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return dir === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });
    return result;
  }, [rawStemsList, stemSearchQuery, selectedStemRole, stemSortState]);

  const crossStemTotals = useMemo(() => {
    if (processedStemsList.length === 0) return null;
    const count = processedStemsList.reduce((acc, s) => acc + (s.count || 0), 0);
    const totalQc = processedStemsList.reduce((acc, s) => acc + (s.totalQc || 0), 0);
    const totalSqpClk = processedStemsList.reduce((acc, s) => acc + (s.totalSqpClk || 0), 0);
    const totalSqpOrd = processedStemsList.reduce((acc, s) => acc + (s.totalSqpOrd || 0), 0);
    const sqpCvr = totalSqpClk > 0 ? totalSqpOrd / totalSqpClk : 0;
    
    const totalAdsClk = processedStemsList.reduce((acc, s) => acc + (s.totalAdsClk || 0), 0);
    const totalAdsOrd = processedStemsList.reduce((acc, s) => acc + (s.totalAdsOrd || 0), 0);
    const adsCvr = totalAdsClk > 0 ? totalAdsOrd / totalAdsClk : 0;
    
    const totalAdsSpend = processedStemsList.reduce((acc, s) => acc + (s.totalAdsSpend || 0), 0);
    const cpc = totalAdsClk > 0 ? totalAdsSpend / totalAdsClk : 0;
    const cvrRatio = sqpCvr > 0 ? adsCvr / sqpCvr : 0;
    
    return {
      count, totalQc, totalSqpClk, totalSqpOrd, sqpCvr,
      totalAdsClk, totalAdsOrd, adsCvr, totalAdsSpend, cpc, cvrRatio
    };
  }, [processedStemsList]);

  const handleStemSort = (key: string) => {
    setStemSortState(prev => {
      if (prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key, dir: 'desc' };
    });
  };

  const handleStartResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = firstColWidth;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.current) return;
    const offset = e.clientX - startX.current;
    const newWidth = Math.max(100, Math.min(350, startWidth.current + offset));
    setFirstColWidth(newWidth);
  };

  const handleMouseUp = () => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  const computeCrossRowsForDataset = (sqpList: SQPRow[], adsList: AdsRow[]) => {
    const thHigh = cvrRatioHigh;
    const thLow = cvrRatioLow;
    const thShare = shareThresh / 100;

    const adsMap = new Map<string, AdsRow>();
    adsList.forEach(a => adsMap.set(a.kw.toLowerCase(), a));

    let totalSqpNaturalOrders = 0;
    sqpList.forEach(sqp => {
      const ads = adsMap.get(sqp.kw.toLowerCase()) || { to: 0 };
      const sqpOrders = sqp.ord || 0;
      const adsOrders = ads.to || 0;
      const naturalOrders = Math.max(0, sqpOrders - adsOrders);
      totalSqpNaturalOrders += naturalOrders;
    });

    return sqpList.map(sqp => {
      const ads = adsMap.get(sqp.kw.toLowerCase()) || {
        fr: 0, im: 0, cl: 0, ct: 0, cp: 0, sp: 0, ts: 0, ds: 0, ac: 0, to: 0, do: 0, ca: 0, cv: 0, aos: 0, adSpendShare: 0
      };

      const sqpOrders = sqp.ord || 0;
      const adsOrders = ads.to || 0;
      const sqpNaturalShare = totalSqpNaturalOrders > 0 ? sqpOrders / totalSqpNaturalOrders : 0;

      const sqpCvr = sqp.asinCVR;
      const adsCvr = ads.cv || 0;
      
      let cvrRatio = 0;
      let tag = '⚖️ 均衡观察';
      let tagClass = 'bg-slate-50 text-slate-605 border border-slate-200';
      let advice = '维持现有出价及广告架构，处于双向对称观察期，建议每周追踪对比大盘走向。';

      if (sqpCvr === 0) {
        if (adsCvr > 0) {
          tag = '🚀 增效词';
          tagClass = 'bg-emerald-50 text-emerald-600 border border-emerald-100';
          advice = `SQP自然口径本期未捕捉订单，但广告CVR展现亮眼(${(adsCvr * 100).toFixed(1)}%)。建议继续保持精准广告测试，同步对详情页主卖点及长尾描述精进，助推自然单破零。`;
          cvrRatio = 999;
        } else {
          tag = '⚠️ 低效/蚕食词';
          tagClass = 'bg-red-50 text-red-650 border border-red-100';
          advice = `本词在自然段和广告投入段均不产出。建议在主图或详情重构完毕前，降Bid广告出价至低位进行低消耗长尾摸索，严防多词高额空耗。`;
          cvrRatio = 0;
        }
      } else {
        cvrRatio = adsCvr / sqpCvr;
        if (cvrRatio >= thHigh && (ads.to || 0) > 0) {
          tag = '🚀 增效词';
          tagClass = 'bg-emerald-50 text-emerald-600 border border-emerald-100';
          advice = `广告转化比(${cvrRatio.toFixed(1)}x)碾压自然购买承接。流量非常饱满且精准，行动建议：提高竞价(Bid)获取广告卡位，甚至开启ASIN独立词广告，迅速做大流量规模。`;
        } else if (cvrRatio < thLow && (ads.sp || 0) > 0) {
          tag = '⚠️ 低效/蚕食词';
          tagClass = 'bg-red-50 text-red-650 border border-red-100';
          advice = `广告转化效率不佳(仅为自然端的 ${cvrRatio.toFixed(2)}x)且产生广告费用。可能在自然优势词上产生不必要抢位，行动建议：调降 Bid 出价 20%，切换为 Exact 精确匹配阻绝流量泛滥。`;
        } else if (sqp.buyShare >= thShare && (ads.aos || 0) < 0.05) {
          tag = '🛡️ 自然防守词';
          tagClass = 'bg-purple-50 text-purple-600 border border-purple-100';
          advice = `本词SQP占有率极强(${(sqp.buyShare * 100).toFixed(1)}%)，自然基本盘坚不可摧对广告依赖度极低。行动建议：广告保留超低底价防守，缩减预算分拨，将腾退出的预算投资至流量潜力上升期词汇。`;
        } else if (sqp.qc < 250 && cvrRatio >= 1.15 && (ads.to || 0) > 0) {
          tag = '💡 潜力长尾词';
          tagClass = 'bg-amber-50 text-amber-600 border border-amber-100';
          advice = `属于低竞争热度但广告能快速完成首发带动的长尾词。转化率强，行动建议：开 Phrase 或 Broad 匹配继续搜洗类似的长尾客群，防止竞品超前卡位。`;
        } else if ((ads.aos || 0) >= 0.15 && cvrRatio < 1.0) {
          tag = '🔥 预算消耗词';
          tagClass = 'bg-rose-50 text-rose-600 border border-rose-100';
          advice = `广告单贡献占有极高，但转化率却显著落后。存在极高耗预算且蚕食正常自然转化率的风险，行动建议：适度缩限广告时段，核算产品最终毛利空间以评估是否控制出价。`;
        }
      }

      // Budget Efficiency Logic auto check
      const oHigh = (ads.aos || 0) > 0.10;
      const sHigh = (ads.adSpendShare || 0) > 0.10;
      let budTag = '⚪ 长尾观察词';
      let budClass = 'bg-slate-50 text-slate-500 border border-slate-200';
      
      if (oHigh && !sHigh) {
        budTag = '🟢 高效收割词';
        budClass = 'bg-emerald-50 text-emerald-600 border border-emerald-100';
      } else if (oHigh && sHigh) {
        budTag = '🟡 规模支撑词';
        budClass = 'bg-amber-50 text-amber-600 border border-amber-100';
      } else if (!oHigh && sHigh) {
        budTag = '🔴 预算黑洞词';
        budClass = 'bg-red-50 text-red-600 border border-red-100';
      }

      // Traffic relationships dynamic auto check
      let chanTag = '⚖️ 常规分配';
      let chanClass = 'bg-slate-50 text-slate-500 border border-slate-200';
      
      if (cvrRatio > 1.2 && sqp.buyShare < 0.08 && (ads.adSpendShare || 0) > 0.05) {
        chanTag = '🚀 增效型';
        chanClass = 'bg-emerald-50 text-emerald-600 border border-emerald-100';
      } else if (cvrRatio >= 0.8 && cvrRatio <= 1.2 && sqp.buyShare > thShare && (ads.adSpendShare || 0) < 0.10) {
        chanTag = '🛡️ 防守型';
        chanClass = 'bg-purple-50 text-purple-600 border border-purple-100';
      } else if (cvrRatio < 0.8 && sqp.buyShare > 0.10 && (ads.adSpendShare || 0) > 0.10) {
        chanTag = '⚠️ 蚕食型';
        chanClass = 'bg-rose-50 text-rose-600 border border-rose-100';
      } else if (cvrRatio < 0.8 && sqp.buyShare < 0.10 && (ads.adSpendShare || 0) > 0.10) {
        chanTag = '🔥 消耗型';
        chanClass = 'bg-amber-50 text-amber-600 border border-amber-100';
      }

      const adsSpend = ads.sp || 0;
      const adsSales = ads.ts || 0;
      const naturalOrders = Math.max(0, sqpOrders - adsOrders);
      const asinPrice = sqp.asinPrice || (adsOrders > 0 ? adsSales / adsOrders : 0) || 0;
      const naturalSales = naturalOrders * asinPrice;
      const sqpSales = sqpOrders * asinPrice;
      const totalKeywordRevenue = adsSales + sqpSales;
      const tacos = totalKeywordRevenue > 0 ? (adsSpend / totalKeywordRevenue) : 0;
      const acosVal = ads.ac || 0;

      let quadrantTag = '⚪ 数据积累';
      let quadrantClass = 'bg-slate-50 text-slate-500 border border-slate-200';
      let quadrantShortDecision = '⚖️ 维持观察';
      let quadrantShortClass = 'bg-slate-100 text-slate-600 border border-slate-200';
      let quadrantDecision = '暂无足够广告花费，维持常规收集。';

      if (adsSpend > 0) {
        const adSalesVal = adsSales;
        const currentAcos = adSalesVal > 0 ? (adsSpend / adSalesVal) : acosVal;
        const synergyRatio = currentAcos > 0 ? (tacos / currentAcos) : 0;

        const isAcosHealthy = currentAcos <= 0.35; // ACoS threshold (healthy when <= 35%)
        const isSynergyStrong = synergyRatio <= 0.65 && totalKeywordRevenue > adSalesVal; // synergy strong when organic comprises >= 35%

        if (isAcosHealthy && isSynergyStrong) {
          quadrantTag = '💎 双低明星词';
          quadrantClass = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
          quadrantShortDecision = '🚀 全力加预算';
          quadrantShortClass = 'bg-emerald-100 text-emerald-850 font-bold border border-emerald-300';
          quadrantDecision = '广告直接投产高且表现出强大自然流量外溢性。行动步骤：全力追加预算（+20%以上），并抬升核心Bid，抢占高位展现面！';
        } else if (isAcosHealthy && !isSynergyStrong) {
          quadrantTag = '💰 金牛收割词';
          quadrantClass = 'bg-teal-50 text-teal-700 border border-teal-200';
          quadrantShortDecision = '📈 稳健拓量';
          quadrantShortClass = 'bg-teal-100 text-teal-850 font-bold border border-teal-300';
          quadrantDecision = '广告高转化而自然出单平淡，属于纯广告拉动。行动步骤：稳步维持或适度增加预算，控制好出价，精细化分时投放拉长寿命。';
        } else if (!isAcosHealthy && isSynergyStrong) {
          quadrantTag = '🔋 战略拉动词';
          quadrantClass = 'bg-amber-50 text-amber-700 border border-amber-200';
          quadrantShortDecision = '🛡️ 微控出价';
          quadrantShortClass = 'bg-amber-100 text-amber-850 font-bold border border-amber-300';
          quadrantDecision = '广告表面赤速，但对整个关键词的自然出单与排名（TACOS低）起着支柱极拉动。行动步骤：绝不可切断预算，建议微降出价（Bid-5~10%）提效，坚守护城河预算。';
        } else {
          // !isAcosHealthy && !isSynergyStrong
          quadrantTag = '🗑️ 亏损黑洞词';
          quadrantClass = 'bg-red-50 text-red-700 border border-red-200';
          quadrantShortDecision = '📉 阶梯调减预算';
          quadrantShortClass = 'bg-red-100 text-red-850 font-bold border border-red-300';
          quadrantDecision = '广告大笔亏损且完全没有自然溢出（TACOS接近ACoS）。行动步骤：立刻调减预算 20%~30%，精简匹配，调低出价 15%-20%，设置否定。';
        }
      }

      return {
        kw: sqp.kw,
        qc: sqp.qc,
        sqpClk: sqp.clk,
        adsClk: ads.cl || 0,
        sqpOrd: sqp.ord,
        adsOrd: ads.to || 0,
        totOrd: sqp.ord + (ads.to || 0),
        sqpBuyShare: sqp.buyShare,
        sqpNaturalShare,
        adsOrderShare: ads.aos || 0,
        adSpendShare: ads.adSpendShare || 0,
        marketCvr: sqp.marketCVR,
        budTag,
        budClass,
        chanTag,
        chanClass,
        sqpCvr,
        adsCvr,
        cvrRatio,
        tag,
        tagClass,
        advice,
        adsSpend,
        adsCpc: ads.cp || 0,
        adsSales,
        naturalSales,
        acos: ads.ac || 0,
        tacos,
        quadrantTag,
        quadrantClass,
        quadrantShortDecision,
        quadrantShortClass,
        quadrantDecision
      };
    });
  };

  const computeCrossReport = () => {
    let triggeredAny = false;
    if (sqpRows.length > 0 && adsRows.length > 0) {
      const currentList = computeCrossRowsForDataset(sqpRows, adsRows);
      setCrossRows(currentList);
      triggeredAny = true;
    }
    if (sqpNextRows.length > 0 && adsNextRows.length > 0) {
      const nextList = computeCrossRowsForDataset(sqpNextRows, adsNextRows);
      setCrossNextRows(nextList);
      triggeredAny = true;
    }

    if (triggeredAny) {
      setLimit(100);
      setStatusMsg(`✅ 双期双维度融合对撞解析完成：已对撞并同步映射出本期（${sqpRows.length}词）及下一期（${sqpNextRows.length}词）的策略对撞矩阵决策推荐！`);
    } else {
      setStatusMsg('⚠️ 需在【搜索绩效】(SQP) 模块与【广告分析】(Ads) 模块中分别导入对应文件并成功解析，才可以激活计算');
    }
  };

  // Re-run computation automatically if thresholds evolve or base datasets change
  useEffect(() => {
    if ((sqpRows.length > 0 && adsRows.length > 0) || (sqpNextRows.length > 0 && adsNextRows.length > 0)) {
      const currentList = sqpRows.length > 0 && adsRows.length > 0 ? computeCrossRowsForDataset(sqpRows, adsRows) : [];
      setCrossRows(currentList);
      
      const nextList = sqpNextRows.length > 0 && adsNextRows.length > 0 ? computeCrossRowsForDataset(sqpNextRows, adsNextRows) : [];
      setCrossNextRows(nextList);
    }
  }, [sqpRows, adsRows, sqpNextRows, adsNextRows, cvrRatioHigh, cvrRatioLow, shareThresh]);

  const handleSort = (key: keyof CrossRow) => {
    setSortState(prev => {
      if (prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key, dir: 'desc' };
    });
    setLimit(100);
  };

  const processedList = useMemo(() => {
    let result = [...currentActiveRows];
    if (searchQuery) {
      result = result.filter(r => r.kw.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (selectedTag) {
      result = result.filter(r => r.tag === selectedTag);
    }
    if (sortState.key) {
      const { key, dir } = sortState;
      result.sort((a, b) => {
        const valA = a[key];
        const valB = b[key];
        if (typeof valA === 'string' && typeof valB === 'string') {
          return dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return dir === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
      });
    }
    return result;
  }, [currentActiveRows, searchQuery, selectedTag, sortState]);

  const crossTotals = useMemo(() => {
    if (processedList.length === 0) return null;
    const qc = processedList.reduce((acc, r) => acc + (r.qc || 0), 0);
    const sqpClk = processedList.reduce((acc, r) => acc + (r.sqpClk || 0), 0);
    const adsClk = processedList.reduce((acc, r) => acc + (r.adsClk || 0), 0);
    const sqpOrd = processedList.reduce((acc, r) => acc + (r.sqpOrd || 0), 0);
    const adsOrd = processedList.reduce((acc, r) => acc + (r.adsOrd || 0), 0);
    const totOrd = processedList.reduce((acc, r) => acc + (r.totOrd || 0), 0);
    
    const sqpBuyShare = processedList.reduce((acc, r) => acc + (r.sqpBuyShare || 0), 0);
    const sqpNaturalShare = processedList.reduce((acc, r) => acc + (r.sqpNaturalShare || 0), 0);
    const adsOrderShare = processedList.reduce((acc, r) => acc + (r.adsOrderShare || 0), 0);
    const adSpendShare = processedList.reduce((acc, r) => acc + (r.adSpendShare || 0), 0);
    
    const totalSpend = processedList.reduce((acc, r) => acc + (r.adsSpend || 0), 0);
    const totalSales = processedList.reduce((acc, r) => acc + (r.adsSales || 0), 0);
    const totalNaturalSales = processedList.reduce((acc, r) => acc + (r.naturalSales || 0), 0);
    const totalRevenue = totalSales + totalNaturalSales;
    
    const acos = totalSales > 0 ? totalSpend / totalSales : 0;
    const tacos = totalRevenue > 0 ? totalSpend / totalRevenue : 0;
    
    const sqpCvr = sqpClk > 0 ? sqpOrd / sqpClk : 0;
    const adsCvr = adsClk > 0 ? adsOrd / adsClk : 0;
    const marketCvr = processedList.reduce((acc, r) => acc + (r.marketCvr || 0), 0) / processedList.length;
    const cvrRatio = sqpCvr > 0 ? adsCvr / sqpCvr : 0;
    
    return {
      qc, sqpClk, adsClk, sqpOrd, adsOrd, totOrd,
      sqpBuyShare, sqpNaturalShare, adsOrderShare, adSpendShare,
      acos, tacos, sqpCvr, adsCvr, marketCvr, cvrRatio
    };
  }, [processedList]);

  // Helper to extract SQP Natural Share top 10 and Ads Order Share top 10 keywords
  const getDefaultKws = (rows: CrossRow[]) => {
    if (rows.length === 0) return [];
    const topSqp = [...rows]
      .filter(r => r.sqpNaturalShare > 0)
      .sort((a, b) => b.sqpNaturalShare - a.sqpNaturalShare)
      .slice(0, 10)
      .map(r => r.kw);
    const topAds = [...rows]
      .filter(r => r.adsOrderShare > 0)
      .sort((a, b) => b.adsOrderShare - a.adsOrderShare)
      .slice(0, 10)
      .map(r => r.kw);
    
    const union = Array.from(new Set([...topSqp, ...topAds]));
    if (union.length === 0) {
      return rows.slice(0, 12).map(r => r.kw);
    }
    return union;
  };

  const otherActiveMap = useMemo(() => {
    const otherRows = activePeriod === 'current' ? crossNextRows : crossRows;
    const map = new Map<string, CrossRow>();
    otherRows.forEach(r => {
      map.set(r.kw.toLowerCase(), r);
    });
    return map;
  }, [activePeriod, crossRows, crossNextRows]);

  const topSqpList = useMemo(() => {
    return [...currentActiveRows]
      .filter(r => r.sqpNaturalShare > 0)
      .sort((a, b) => b.sqpNaturalShare - a.sqpNaturalShare)
      .slice(0, 10);
  }, [currentActiveRows]);

  const topAdsList = useMemo(() => {
    return [...currentActiveRows]
      .filter(r => r.adsOrderShare > 0)
      .sort((a, b) => b.adsOrderShare - a.adsOrderShare)
      .slice(0, 10);
  }, [currentActiveRows]);

  // Auto-initialize selected keywords for chart on first data match or period change
  useEffect(() => {
    if (currentActiveRows.length > 0) {
      setSelectedChartKws(getDefaultKws(currentActiveRows));
    }
  }, [currentActiveRows]);

  const handleSelectAllFiltered = () => {
    const visibleKws = processedList.slice(0, Math.min(processedList.length, 100)).map(r => r.kw);
    setSelectedChartKws(visibleKws);
  };

  const handleClearAllChart = () => {
    setSelectedChartKws([]);
  };

  const handleRestoreDefaultTop = () => {
    setSelectedChartKws(getDefaultKws(currentActiveRows));
  };

  const chartData = useMemo(() => {
    // Filter processedList by selected keywords to preserve sorting and current filtering!
    const selectedRows = processedList.filter(r => selectedChartKws.includes(r.kw));
    return selectedRows.map(r => ({
      name: r.kw,
      'SQP自然转化率': parseFloat((r.sqpCvr * 100).toFixed(2)),
      'Ads广告转化率': r.adsClk > 0 ? parseFloat((r.adsCvr * 100).toFixed(2)) : 0,
      '大盘CVR': parseFloat((r.marketCvr * 100).toFixed(2))
    }));
  }, [processedList, selectedChartKws]);

  const exportCurrentXlsx = () => {
    if (currentActiveRows.length === 0) return;
    const wb = XLSX.utils.book_new();
    const headers = [
      '关键词', '大盘月搜词量', 'SQP自然点击数', '广告本词点击数', 'SQP自然ASIN订单', '广告本词订单数', '总单量 (SQP+广告)',
      'SQP自然市占购买比(%)', 'SQP自然出单占比(%)', '广告订单贡献比 (%)', '广告花费占比 (%)', '关键词 ACoS (%)', '关键词 TACOS (%)',
      '四象限分类', '四象限预算决策',
      '预算效益标签', '流量渠道类型划分', 'SQP自然CVR (%)', '广告转化率 CVR (%)',  
      '大盘基准平均CVR (%)', '对碰转化率比值 (Ad/SQP)', '最终决策标签', '全套投放、调Bid出价、漏斗控制动作建议'
    ];
    const rows = currentActiveRows.map(r => {
      let dText = r.quadrantDecision;
      if (activePeriod === 'next') {
        const prevRow = otherActiveMap.get(r.kw.toLowerCase());
        if (prevRow) {
          const acosDiff = (r.acos || 0) - (prevRow.acos || 0);
          const tacosDiff = (r.tacos || 0) - (prevRow.tacos || 0);
          if (r.quadrantTag === '💎 双低明星词') {
            if (acosDiff <= 0 && tacosDiff <= 0) dText += ' (下期趋势：效率与自然拉动双重上升，完美黄金期，建议追加预算 +20%-50%)';
            else if (acosDiff > 0.05) dText += ' (下期趋势：获客价小幅上浮，建议温和追加 +15% 预算)';
            else dText += ' (下期趋势：平稳垄断，建议稳步追加 +15%-25% 预算)';
          } else if (r.quadrantTag === '💰 金牛收割词') {
            if (acosDiff < 0) dText += ' (下期趋势：转化成本降低，建议追加 +15% 预算锁定特权单)';
            else if (acosDiff > 0.08) dText += ' (下期趋势：转化成本高企，不盲目追高，维持原预算)';
            else dText += ' (下期趋势：广告大盘表现平稳，微加或维持预算)';
          } else if (r.quadrantTag === '🔋 战略拉动词') {
            if (tacosDiff <= 0) dText += ' (下期趋势：自然卡位牢靠，拉动强，主力保预算稳根基)';
            else dText += ' (下期趋势：拉动轻微减弱，防范高 ACoS 空耗，微压低出价，降低 10% 预算)';
          } else if (r.quadrantTag === '🗑️ 亏损黑洞词') {
            if (acosDiff > 0.1) dText += ' (下期趋势：亏损加剧深不见底，建议大砍 30%-50% 预算或坚决否定)';
            else dText += ' (下期趋势：无起色持续赤速空耗，建议降低 25% 预算限制投放)';
          }
        }
      }
      return [
        r.kw, r.qc, r.sqpClk, r.adsClk, r.sqpOrd, r.adsOrd, r.totOrd,
        (r.sqpBuyShare * 100).toFixed(2), (r.sqpNaturalShare * 100).toFixed(2), (r.adsOrderShare * 100).toFixed(2), (r.adSpendShare * 100).toFixed(2),
        (r.acos !== undefined ? (r.acos * 100).toFixed(2) : '0.00'),
        (r.tacos !== undefined ? (r.tacos * 100).toFixed(2) : '0.00'),
        r.quadrantTag || '⚪ 数据积累', dText || '—',
        r.budTag, r.chanTag, (r.sqpCvr * 100).toFixed(2), (r.adsCvr * 100).toFixed(2),
        (r.marketCvr * 100).toFixed(2), r.cvrRatio >= 100 ? '>99' : r.cvrRatio.toFixed(2),
        r.tag, r.advice
      ];
    });
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const periodLabel = activePeriod === 'current' ? '本期' : '下期预测';
    XLSX.utils.book_append_sheet(wb, ws, `SQP_vs_Ads交叉分析_${periodLabel}`);
    XLSX.writeFile(wb, `Amazon交叉融合分析矩阵_${periodLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportStemsXlsx = (listToExport: any[]) => {
    if (listToExport.length === 0) return;
    const wb = XLSX.utils.book_new();
    const headers = [
      '词根短词', '拆分层级', '关联长尾原词量', '大盘总搜索qc', '自然端点击数 (clk)', 
      '自然端本品订单 (ord)', '自然转化率 (sqp CVR %)', '广告总点击 (clk)', '广告出单量 (ord)', 
      '广告转化率 (ads CVR %)', '广告累计开销 (spend)', '平均 CPC', 'CVR 转换对抗比 (广/自)', 
      '运营诊断标签', '优化操作建议'
    ];
    const rows = listToExport.map(item => [
      item.stem,
      item.type === '1-word' ? '1词单个词根' : item.type === '2-word' ? '2词并接词组' : '3词长尾语义',
      item.count,
      item.totalQc,
      item.totalSqpClk,
      item.totalSqpOrd,
      parseFloat((item.sqpCvr * 100).toFixed(2)),
      item.totalAdsClk,
      item.totalAdsOrd,
      parseFloat((item.adsCvr * 100).toFixed(2)),
      parseFloat(item.totalAdsSpend.toFixed(2)),
      parseFloat(item.cpc.toFixed(2)),
      item.totalAdsClk === 0 ? '—' : parseFloat(item.cvrRatio.toFixed(2)),
      item.role,
      item.advice
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, `词根深度聚合对撞分析`);
    XLSX.writeFile(wb, `Amazon词根深度聚合对撞分析_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Upload status, trigger action & sliders */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6 flex flex-col md:flex-row gap-6 items-stretch">
        <div className="flex-1 flex flex-col justify-between space-y-4">
          <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 uppercase">
              <Cpu className="w-5 h-5 text-amber-500" />
              SQP 自然流量 vs Ads 广告对撞映射模块 (Cross 交叉)
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              融合系统将 SQP(自然市占大盘) 和 SP广告(付费流量) 在具体关键词上的转化效率及消耗比值进行全维度联动匹配，自动锁定哪些在蚕食、哪些在防守，进而自动吐出精准的出价、预算卡位建议。
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <button
              onClick={computeCrossReport}
              disabled={sqpRows.length === 0 || adsRows.length === 0}
              className={`w-full py-2.5 rounded-lg text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all ${
                sqpRows.length > 0 && adsRows.length > 0 
                  ? 'bg-amber-500 hover:bg-amber-600 text-white cursor-pointer' 
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              <GitCompare className="w-4 h-4" /> 激发运算 协同交叉融合决策机制 (同步重构策略)
            </button>
            <p className="text-[10.5px] font-mono text-slate-500 text-center">
              {statusMsg || (sqpRows.length > 0 && adsRows.length > 0 
                ? '✅ 已就绪，系统检测到两期完整大盘及销售报告副本，可发起协同计算。' 
                : '⚠️ 需要在 Search Query Performance (SQP) 模块与广告(Ads)模块中均解析成功，才可以启动交叉对撞')}
            </p>
          </div>
        </div>

        {/* Sliders thresholds */}
        <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-slate-100 pt-6 md:pt-0 md:pl-6 flex flex-col justify-between">
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5 text-amber-500" /> 交叉诊断灵敏系数配置
            </h4>

            {/* Synergy CVR Ratio */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span>🚀 增效词比分界:</span>
                <span className="font-mono text-amber-600">{cvrRatioHigh}x</span>
              </div>
              <input 
                type="range" 
                min="1.0" 
                max="2.0" 
                step="0.05"
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500" 
                value={cvrRatioHigh}
                onChange={(e) => setCvrRatioHigh(parseFloat(e.target.value))}
              />
            </div>

            {/* Low Efficiency CVR Ratio */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span>⚠️ 蚕食/低效比分界:</span>
                <span className="font-mono text-amber-600">{cvrRatioLow}x</span>
              </div>
              <input 
                type="range" 
                min="0.5" 
                max="1.0" 
                step="0.05"
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500" 
                value={cvrRatioLow}
                onChange={(e) => setCvrRatioLow(parseFloat(e.target.value))}
              />
            </div>

            {/* SQP share defense */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span>🛡️ 防守词自然市占率:</span>
                <span className="font-mono text-amber-600">{shareThresh}%</span>
              </div>
              <input 
                type="range" 
                min="5" 
                max="35" 
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500" 
                value={shareThresh}
                onChange={(e) => setShareThresh(parseInt(e.target.value))}
              />
            </div>
          </div>

          <div className="bg-amber-50 rounded p-2.5 text-[10px] text-amber-900 flex gap-1 items-start mt-4 leading-normal">
            <HelpCircle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
            <span>调整分界灵敏系数可瞬时改变策略推荐，支持在复杂运营博弈中按ASIN生命周期灵活调节。</span>
          </div>
        </div>
      </div>

      {/* Period Selection Tabs */}
      {(crossRows.length > 0 || crossNextRows.length > 0) && (
        <div className="flex bg-slate-100 p-1.5 rounded-xl w-fit border border-slate-200 shadow-inner">
          <button
            onClick={() => {
              setActivePeriod('current');
              setLimit(100);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activePeriod === 'current'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-605 hover:text-slate-850'
            }`}
          >
            ⏰ 本期交叉核心矩阵 (Current Core Matrix)
          </button>
          <button
            onClick={() => {
              setActivePeriod('next');
              setLimit(100);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activePeriod === 'next'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-605 hover:text-slate-850'
            }`}
          >
            🔮 下一期交叉预测矩阵 (Next Predictive Matrix)
          </button>
        </div>
      )}

      {activePeriod === 'next' && crossNextRows.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-10 text-center space-y-4">
          <HelpCircle className="w-12 h-12 text-amber-550 mx-auto" />
          <h4 className="text-sm font-bold text-slate-800">🔮 下期自适应诊断预测矩阵尚未生成</h4>
          <p className="text-xs text-slate-500 max-w-2xl mx-auto leading-relaxed">
            系统未探测到下一周期的交叉融合数据。请保证您已经在【搜索查询绩效】板块中导入了对比环比文件（并生成对比报告），且在【广告词 funnel】中同样解析了对照阶段的报告数据。此后，点击顶端的“协同交叉融合机制”按钮，系统将动态预测映射出下周期的出价策略与卡位决策标签！
          </p>
        </div>
      ) : (crossRows.length > 0 || crossNextRows.length > 0) && (
        <React.Fragment>
          {/* Fusion dashboard stats widget cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
                <GitCompare className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">广告匹配覆盖深度</p>
                <p className="text-lg font-bold text-slate-800 font-mono">
                  {stats.matchedWords} <span className="text-xs font-normal text-slate-500">组词 / {currentActiveRows.length}对</span>
                </p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">高燃增效拓荒词</p>
                <p className="text-lg font-bold text-slate-800 font-mono">{stats.synergeticCount} <span className="text-xs font-normal text-slate-500">组</span></p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-purple-50 text-purple-600 rounded-lg">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">自然极度防守堡垒词</p>
                <p className="text-lg font-bold text-slate-800 font-mono">{stats.defensiveCount} <span className="text-xs font-normal text-slate-500">组</span></p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-red-50 text-red-650 rounded-lg">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">蚕食流量亏空优化列</p>
                <p className="text-lg font-bold text-slate-800 font-mono">{stats.cannibalizationCount} <span className="text-xs font-normal text-slate-500">组词</span></p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5 shadow-sm">
            {/* Horizontal Sub-Tabs Selector */}
            <div className="flex border-b border-slate-200 pb-3 justify-between items-center flex-wrap gap-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setSubTab('grid')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    subTab === 'grid'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  🔑 核心交叉对碰矩阵 (Keyword Grid)
                </button>
                <button
                  onClick={() => setSubTab('stems')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    subTab === 'stems'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  🧬 一键词根聚合对撞 (Word Stems)
                </button>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400 font-mono">
                <span>投产关键词：{currentActiveRows.length} 组</span>
                {subTab === 'stems' && (
                  <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-105 font-bold">
                    析出 {processedStemsList.length} 组词根
                  </span>
                )}
              </div>
            </div>

            {subTab === 'grid' ? (
              <React.Fragment>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">自然 + 广告 交叉对数表</h4>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="瞬捕词交错流量位置..."
                    className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs w-52 focus:outline-none focus:border-amber-500 text-slate-700"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <button
                onClick={exportCurrentXlsx}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:border-slate-355 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" /> 导出决策大表
              </button>
            </div>

            {/* Quick chips tag */}
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-wider mr-2">
                <Filter className="w-3 h-3" /> 最终定位标签:
              </span>
              <button
                onClick={() => setSelectedTag(null)}
                className={`py-1 px-3 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  selectedTag === null ? 'bg-amber-950 text-white' : 'bg-slate-100 hover:bg-slate-150 text-slate-600'
                }`}
              >
                全部交叉策略 ({currentActiveRows.length})
              </button>
              {['🚀 增效词', '⚠️ 低效/蚕食词', '🛡️ 自然防守词', '💡 潜力长尾词', '🔥 预算消耗词', '⚖️ 均衡观察'].map(tag => {
                const count = currentActiveRows.filter(r => r.tag === tag).length;
                if (count === 0 && tag !== '⚖️ 均衡观察') return null; // hide empty
                return (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(tag)}
                    className={`py-1 px-3 rounded-full text-xs font-medium transition-all cursor-pointer ${
                      selectedTag === tag ? 'bg-amber-950 text-white' : 'bg-slate-100 hover:bg-slate-150 text-slate-600'
                    }`}
                  >
                    {tag} ({count})
                  </button>
                );
              })}
            </div>

            {/* Metric Definitions Info Banner */}
            <div className="bg-emerald-50/40 border border-emerald-100/70 rounded-lg p-3 text-[11px] text-emerald-805 flex gap-2 items-start">
              <div className="bg-emerald-600 text-white font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0 text-[10px]">i</div>
              <div className="leading-relaxed">
                <span className="font-bold text-slate-800">核心指标定义指导：</span>
                <span className="font-bold text-emerald-800">SQP 自然出单占比</span> 定义为：该关键词下的 SQP 出单量 / 整体 SQP 自然出单（大盘多关键词去重下自然端出单总和）。
                <span className="ml-3 font-semibold text-slate-500">SQP 限期购买占比（主市占比）</span> 代表了该词下您的本商品本期 ASIN 购买转化大盘绝对市占。
              </div>
            </div>

            {/* Cross table container layout */}
            <div className="table-wrapper max-h-[480px] custom-scrollbar border border-slate-150 rounded-lg overflow-auto">
              <table className="relative w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 text-[10px] font-semibold sticky top-0 z-20 shadow-xs">
                    <th 
                      className="text-left font-semibold uppercase tracking-wider p-3 sticky left-0 bg-slate-50/90 z-30 flex items-center justify-between border-r border-slate-200"
                      style={{ width: `${firstColWidth}px`, minWidth: `${firstColWidth}px` }}
                    >
                      <div className="flex items-center gap-2 select-none">
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 rounded border-slate-300 text-amber-500 focus:ring-amber-500 accent-amber-500 cursor-pointer"
                          checked={processedList.length > 0 && processedList.slice(0, Math.min(processedList.length, limit)).every(r => selectedChartKws.includes(r.kw))}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            const currentBatch = processedList.slice(0, Math.min(processedList.length, limit));
                            if (isChecked) {
                              const newSelections = [...selectedChartKws];
                              currentBatch.forEach(r => {
                                if (!newSelections.includes(r.kw)) {
                                  newSelections.push(r.kw);
                                }
                              });
                              setSelectedChartKws(newSelections);
                            } else {
                              const batchKwSet = new Set(currentBatch.map(r => r.kw));
                              setSelectedChartKws(selectedChartKws.filter(k => !batchKwSet.has(k)));
                            }
                          }}
                        />
                        <span className="cursor-pointer" onClick={() => handleSort('kw')}>
                          关键词 {sortState.key === 'kw' ? (sortState.dir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </div>
                      <div 
                        className="w-1.5 h-6 bg-transparent hover:bg-amber-400 active:bg-amber-600 cursor-col-resize self-stretch select-none"
                        onMouseDown={handleStartResize}
                      />
                    </th>
                    <th className="text-right font-semibold p-3 cursor-pointer select-none border-b border-slate-200" onClick={() => handleSort('qc')}>大盘月搜 volume</th>
                    <th className="text-right font-semibold p-3 cursor-pointer select-none border-b border-slate-200" onClick={() => handleSort('sqpClk')}>SQP 自然点击</th>
                    <th className="text-right font-semibold p-3 cursor-pointer select-none border-b border-slate-200" onClick={() => handleSort('adsClk')}>付费广告点击</th>
                    <th className="text-right font-semibold p-3 cursor-pointer select-none border-b border-slate-200" onClick={() => handleSort('sqpOrd')}>SQP 本商品单</th>
                    <th className="text-right font-semibold p-3 cursor-pointer select-none border-b border-slate-200" onClick={() => handleSort('adsOrd')}>广告单量</th>
                    <th className="text-right font-semibold p-3 cursor-pointer select-none border-b border-slate-200 bg-indigo-50/40 text-slate-800 font-bold" onClick={() => handleSort('totOrd')}>总单量 (SQP+广告)</th>
                    <th className="text-center font-semibold p-3 cursor-pointer select-none border-b border-slate-200" onClick={() => handleSort('sqpBuyShare')}>SQP限期购买占比</th>
                    <th className="text-center font-bold p-3 cursor-pointer select-none border-b border-slate-200 text-emerald-800 bg-emerald-50/5" onClick={() => handleSort('sqpNaturalShare')}>SQP 自然出单占比</th>
                    <th className="text-center font-semibold p-3 cursor-pointer select-none border-b border-slate-200" onClick={() => handleSort('adsOrderShare')}>广告订单产出比</th>
                    <th className="text-center font-semibold p-3 cursor-pointer select-none border-b border-slate-200" onClick={() => handleSort('adSpendShare')}>广告花费占比</th>
                    <th className="text-center font-semibold p-3 cursor-pointer select-none border-b border-slate-200 bg-amber-500/10 text-amber-950 font-bold" onClick={() => handleSort('acos')}>关键词 ACoS</th>
                    <th className="text-center font-semibold p-3 cursor-pointer select-none border-b border-slate-200 bg-amber-500/20 text-amber-950 font-bold" onClick={() => handleSort('tacos')}>关键词 TACOS</th>
                    <th className="text-center font-semibold p-3 cursor-pointer select-none border-b border-slate-200 bg-teal-500/10 text-teal-950 font-bold" onClick={() => handleSort('quadrantTag' as any)}>四象限分类</th>
                    <th className="text-center font-semibold p-3 cursor-pointer select-none border-b border-slate-200 bg-emerald-500/10 text-emerald-950 font-bold min-w-[150px]" onClick={() => handleSort('quadrantShortDecision' as any)}>四象限下期决策</th>
                    <th className="text-center font-semibold p-3 border-b border-slate-200">预算效率等级</th>
                    <th className="text-center font-semibold p-3 border-b border-slate-200">自然广告流量关系</th>
                    <th className="text-right font-semibold p-3 cursor-pointer select-none border-b border-slate-200" onClick={() => handleSort('sqpCvr')}>自然 CVR</th>
                    <th className="text-right font-semibold p-3 cursor-pointer select-none border-b border-slate-200" onClick={() => handleSort('adsCvr')}>广告 CVR</th>
                    <th className="text-right font-semibold p-3 border-b border-slate-200">大盘平均 CVR</th>
                    <th className="text-center font-semibold p-3 cursor-pointer select-none border-b border-slate-200" onClick={() => handleSort('cvrRatio')}>CVR 对比率 (广/自)</th>
                    <th className="text-center font-semibold p-3 border-b border-slate-200">综合判定标签</th>
                    <th className="text-left font-semibold p-3 min-w-[280px] border-b border-slate-200">针对本生命周期ASIN的出价、预算卡位、调高压Bid的具体决策操作指导</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {processedList.slice(0, limit).map((r, idx) => {
                    const prevRow = activePeriod === 'next' ? otherActiveMap.get(r.kw.toLowerCase()) : undefined;
                    
                    const renderPercentChangeUnder = (nextVal: number, currentVal: number | undefined) => {
                      if (currentVal === undefined) return null;
                      if (currentVal === 0) {
                        if (nextVal === 0) return null;
                        return <div className="text-[9px] font-semibold text-emerald-605 font-sans mt-0.5 leading-none">新增</div>;
                      }
                      const diffPct = ((nextVal - currentVal) / currentVal) * 100;
                      if (Math.abs(diffPct) < 0.01) {
                        return <div className="text-[9px] text-slate-400 font-sans mt-0.5 leading-none">持平</div>;
                      }
                      const formattedPct = (diffPct > 0 ? '▲' : '▼') + Math.abs(diffPct).toFixed(1) + '%';
                      const colorClass = diffPct > 0 ? 'text-emerald-600' : 'text-rose-500';
                      return (
                        <div className={`text-[9px] font-bold ${colorClass} font-sans mt-0.5 leading-none`}>
                          {formattedPct}
                        </div>
                      );
                    };

                    // Compute a dynamic detailed advice/commentary based on MoM (when activePeriod === 'next' and we have prevRow)
                    let trendEnrichment = '';
                    let actionShortLabel = r.quadrantShortDecision || '⚖️ 维持观察';
                    let actionShortColor = r.quadrantShortClass || 'bg-slate-100 text-slate-600 border border-slate-200';

                    if (activePeriod === 'next' && prevRow) {
                      const acosDiff = (r.acos || 0) - (prevRow.acos || 0);
                      const tacosDiff = (r.tacos || 0) - (prevRow.tacos || 0);

                      if (r.quadrantTag === '💎 双低明星词') {
                        if (acosDiff <= 0 && tacosDiff <= 0) {
                          trendEnrichment = ' 下期投产与自然拉动双重上升，进入完美黄金拉动期！建议强力增投。';
                          actionShortLabel = '🚀 大力追加预算';
                          actionShortColor = 'bg-emerald-500 text-white font-bold border border-emerald-600 shadow-sm';
                        } else if (acosDiff > 0.05) {
                          trendEnrichment = ' 获客价有些许上浮，但整体出单仍极为优秀，建议温和追加 15% 预算。';
                          actionShortLabel = '📈 温和加预算';
                          actionShortColor = 'bg-emerald-400 text-white font-semibold border border-emerald-550 shadow-sm';
                        } else {
                          trendEnrichment = ' 表现平稳、优势扩大。追加 15%-25% 预算巩固展现量份额。';
                          actionShortLabel = '🚀 追加预算';
                          actionShortColor = 'bg-emerald-500 text-white font-bold border border-emerald-550 shadow-sm';
                        }
                      } else if (r.quadrantTag === '💰 金牛收割词') {
                        if (acosDiff < 0) {
                          trendEnrichment = ' 转化投产效率增加！微加预算 15% 抢下该词的更多直接转化。';
                          actionShortLabel = '📈 增加预算';
                          actionShortColor = 'bg-teal-500 text-white font-bold border border-teal-600 shadow-sm';
                        } else if (acosDiff > 0.08) {
                          trendEnrichment = ' 整体获客价上行，因无自然溢出，不盲目追高，建议维持预算并提升CVR。';
                          actionShortLabel = '⚖️ 维持预算';
                          actionShortColor = 'bg-slate-400 text-white border border-slate-500 shadow-sm';
                        } else {
                          trendEnrichment = ' 表现平稳，属于核心付费大盘基本词，常规维持预算。';
                          actionShortLabel = '⚖️ 稳健维持';
                          actionShortColor = 'bg-teal-100 text-teal-850 border border-teal-300';
                        }
                      } else if (r.quadrantTag === '🔋 战略拉动词') {
                        if (tacosDiff <= 0) {
                          trendEnrichment = ' 下期自然拉动依然处于极强溢出阶段，坚决保留该卡位词的广告预算！';
                          actionShortLabel = '🛡️ 保预算稳排名';
                          actionShortColor = 'bg-amber-400 text-white font-semibold border border-amber-550 shadow-sm';
                        } else {
                          trendEnrichment = ' 自然溢出比例在下降且 ACoS 偏高，建议调降出价并控 10% 预算做止损测试。';
                          actionShortLabel = '⚙️ 削峰控出价';
                          actionShortColor = 'bg-amber-500 text-white font-bold border border-amber-600 shadow-sm';
                        }
                      } else if (r.quadrantTag === '🗑️ 亏损黑洞词') {
                        if (acosDiff > 0.1) {
                          trendEnrichment = ' 付费转化偏低且无自然拉动，黑洞深度增加，立即下调 30%-50% 预算或暂停！';
                          actionShortLabel = '🚨 紧急限流';
                          actionShortColor = 'bg-rose-600 text-white font-bold border border-rose-700 shadow-sm animate-pulse';
                        } else {
                          trendEnrichment = ' 持续空耗产生高亏损，无自然溢出。建议削减 25% 预算并阶梯降价。';
                          actionShortLabel = '📉 砍预算扣亏';
                          actionShortColor = 'bg-rose-500 text-white border border-rose-600 shadow-sm';
                        }
                      }
                    }

                    return (
                      <tr key={idx} className="hover:bg-slate-50/65 transition-colors text-slate-705">
                        <td 
                          className="p-3 sticky left-0 bg-white font-semibold border-r border-slate-100 text-slate-800 group-hover:bg-slate-50 truncate flex items-center gap-2"
                          style={{ width: `${firstColWidth}px`, minWidth: `${firstColWidth}px`, maxWidth: `${firstColWidth}px` }}
                          title={r.kw}
                        >
                          <input
                            type="checkbox"
                            className="w-3.5 h-3.5 rounded border-slate-300 text-amber-500 focus:ring-amber-500 accent-amber-500 cursor-pointer shrink-0"
                            checked={selectedChartKws.includes(r.kw)}
                            onChange={() => toggleKwSelection(r.kw)}
                          />
                          <span className="truncate">{r.kw}</span>
                        </td>
                        <td className="p-3 text-right font-mono text-[11px]">
                          <div>{r.qc.toLocaleString()}</div>
                          {renderPercentChangeUnder(r.qc, prevRow?.qc)}
                        </td>
                        <td className="p-3 text-right font-mono text-[11px] text-slate-500">
                          <div>{r.sqpClk.toLocaleString()}</div>
                          {renderPercentChangeUnder(r.sqpClk, prevRow?.sqpClk)}
                        </td>
                        <td className="p-3 text-right font-mono text-[11px]">
                          <div>{r.adsClk.toLocaleString()}</div>
                          {renderPercentChangeUnder(r.adsClk, prevRow?.adsClk)}
                        </td>
                        <td className="p-3 text-right font-mono text-[11px] font-semibold text-slate-800">
                          <div>{r.sqpOrd}</div>
                          {renderPercentChangeUnder(r.sqpOrd, prevRow?.sqpOrd)}
                        </td>
                        <td className="p-3 text-right font-mono text-[11px] font-semibold">
                          <div>{r.adsOrd}</div>
                          {renderPercentChangeUnder(r.adsOrd, prevRow?.adsOrd)}
                        </td>
                        <td className="p-3 text-right font-mono text-[11px] font-bold bg-indigo-55/20 text-indigo-950">
                          <div>{r.totOrd}</div>
                          {renderPercentChangeUnder(r.totOrd, prevRow?.totOrd)}
                        </td>
                        <td className="p-3 text-center font-mono text-[11px]">
                          <div>{(r.sqpBuyShare * 100).toFixed(2)}%</div>
                          {renderPercentChangeUnder(r.sqpBuyShare, prevRow?.sqpBuyShare)}
                        </td>
                        <td className="p-3 text-center font-semibold font-mono text-[11px] text-emerald-800 bg-emerald-50/5">
                          <div>{(r.sqpNaturalShare * 100).toFixed(2)}%</div>
                          {renderPercentChangeUnder(r.sqpNaturalShare, prevRow?.sqpNaturalShare)}
                        </td>
                        <td className="p-3 text-center font-mono text-[11px]">
                          <div>{(r.adsOrderShare * 100).toFixed(2)}%</div>
                          {renderPercentChangeUnder(r.adsOrderShare, prevRow?.adsOrderShare)}
                        </td>
                        <td className="p-3 text-center font-mono text-[11px]">
                          <div>{r.adsSpend > 0 ? (r.adSpendShare * 100).toFixed(2) + '%' : '—'}</div>
                          {renderPercentChangeUnder(r.adSpendShare, prevRow?.adSpendShare)}
                        </td>
                        <td className="p-3 text-center font-mono text-[11px] font-bold bg-amber-50/10 text-amber-900">
                          <div>{r.acos !== undefined && r.acos > 0 ? (r.acos * 100).toFixed(2) + '%' : '—'}</div>
                          {renderPercentChangeUnder(r.acos || 0, prevRow?.acos || 0)}
                        </td>
                        <td className="p-3 text-center font-mono text-[11px] font-bold bg-amber-50/40 text-amber-955">
                          <div>{r.tacos !== undefined && r.tacos > 0 ? (r.tacos * 100).toFixed(2) + '%' : '0.00%'}</div>
                          {renderPercentChangeUnder(r.tacos || 0, prevRow?.tacos || 0)}
                        </td>
                        <td className="p-3 text-center w-[120px] min-w-[120px] whitespace-nowrap">
                          <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold ${r.quadrantClass}`}>
                            {r.quadrantTag || '⚪ 数据积累'}
                          </span>
                        </td>
                        <td className="p-3 text-center w-[180px] min-w-[180px]">
                          <span 
                            title={(r.quadrantDecision || '') + trendEnrichment}
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold cursor-help transition-all ${actionShortColor}`}
                          >
                            {actionShortLabel}
                          </span>
                        </td>
                        <td className="p-3 text-center w-[120px] min-w-[120px] whitespace-nowrap">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${r.budClass}`}>
                            {r.budTag}
                          </span>
                        </td>
                        <td className="p-3 text-center w-[140px] min-w-[140px] whitespace-nowrap">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${r.chanClass}`}>
                            {r.chanTag}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono text-[11px] text-slate-500">
                          <div>{(r.sqpCvr * 100).toFixed(2)}%</div>
                          {renderPercentChangeUnder(r.sqpCvr, prevRow?.sqpCvr)}
                        </td>
                        <td className="p-3 text-right font-mono text-[11px] text-slate-800">
                          <div>{r.adsClk > 0 ? (r.adsCvr * 100).toFixed(2) + '%' : '—'}</div>
                          {renderPercentChangeUnder(r.adsCvr, prevRow?.adsCvr)}
                        </td>
                        <td className="p-3 text-right font-mono text-[11px] text-slate-400">{(r.marketCvr * 100).toFixed(2)}%</td>
                        <td className={`p-3 text-center font-mono text-[11px] font-semibold ${r.cvrRatio >= cvrRatioHigh ? 'text-emerald-600' : r.cvrRatio < cvrRatioLow ? 'text-red-500' : 'text-slate-600'}`}>
                          {r.adsClk === 0 ? '—' : r.cvrRatio >= 100 ? '>99x' : r.cvrRatio.toFixed(2) + 'x'}
                        </td>
                        <td className="p-3 text-center w-[100px] min-w-[100px] whitespace-nowrap">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${r.tagClass}`}>
                            {r.tag}
                          </span>
                        </td>
                        <td className="p-3 min-w-[280px]">
                          <span 
                            title={r.advice}
                            className={`block max-w-[480px] truncate px-2.5 py-1 rounded text-[11px] font-normal select-text ${
                              r.tag === '🚀 增效词' ? 'bg-emerald-50/70 text-emerald-850 border border-emerald-300' :
                              r.tag === '⚠️ 低效/蚕食词' ? 'bg-red-50/70 text-red-850 border border-red-300' :
                              r.tag === '🛡️ 自然防守词' ? 'bg-purple-50/70 text-purple-850 border border-purple-300' :
                              r.tag === '💡 潜力长尾词' ? 'bg-amber-50/70 text-amber-850 border border-amber-300' :
                              r.tag === '🔥 预算消耗词' ? 'bg-rose-50/70 text-rose-850 border border-rose-300' :
                              'bg-slate-50 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {r.advice}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {crossTotals && (
                  <tfoot className="sticky bottom-0 z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] bg-slate-100">
                    <tr className="font-bold border-t-2 border-slate-300 text-slate-900">
                      <td 
                        className="p-3 bg-slate-100 font-extrabold border-r border-slate-200 text-slate-950 truncate"
                        style={{ width: `${firstColWidth}px`, minWidth: `${firstColWidth}px`, maxWidth: `${firstColWidth}px`, position: 'sticky', bottom: 0, left: 0, zIndex: 30 }}
                        title="数据总和"
                      >
                        数据总和 (已贴底)
                      </td>
                      <td className="p-3 text-right bg-slate-100 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{crossTotals.qc.toLocaleString()}</td>
                      <td className="p-3 text-right bg-slate-100 font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>{crossTotals.sqpClk.toLocaleString()}</td>
                      <td className="p-3 text-right bg-slate-100 font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>{crossTotals.adsClk.toLocaleString()}</td>
                      <td className="p-3 text-right bg-slate-100 font-mono text-[11px] font-extrabold text-slate-800" style={{ position: 'sticky', bottom: 0 }}>{crossTotals.sqpOrd.toLocaleString()}</td>
                      <td className="p-3 text-right bg-slate-100 font-mono text-[11px] font-extrabold text-blue-700" style={{ position: 'sticky', bottom: 0 }}>{crossTotals.adsOrd.toLocaleString()}</td>
                      <td className="p-3 text-right bg-slate-100 font-mono text-[11px] font-extrabold text-slate-950 bg-indigo-50/20" style={{ position: 'sticky', bottom: 0 }}>{crossTotals.totOrd.toLocaleString()}</td>
                      <td className="p-3 text-center bg-slate-100 font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>{(crossTotals.sqpBuyShare * 100).toFixed(2)}%</td>
                      <td className="p-3 text-center bg-slate-100 font-semibold font-mono text-[11px] text-emerald-850 bg-emerald-50/5" style={{ position: 'sticky', bottom: 0 }}>{(crossTotals.sqpNaturalShare * 100).toFixed(2)}%</td>
                      <td className="p-3 text-center bg-slate-100 font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>{(crossTotals.adsOrderShare * 100).toFixed(2)}%</td>
                      <td className="p-3 text-center bg-slate-100 font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>{(crossTotals.adSpendShare * 100).toFixed(2)}%</td>
                      <td className="p-3 text-center bg-slate-100 font-mono text-[11px] font-extrabold text-amber-900 bg-amber-50/10" style={{ position: 'sticky', bottom: 0 }}>{(crossTotals.acos * 100).toFixed(2)}%</td>
                      <td className="p-3 text-center bg-slate-100 font-mono text-[11px] font-extrabold text-amber-955 bg-amber-50/30" style={{ position: 'sticky', bottom: 0 }}>{(crossTotals.tacos * 100).toFixed(2)}%</td>
                      <td className="p-3 text-center bg-slate-100 text-[10px] text-slate-500" style={{ position: 'sticky', bottom: 0 }}>—</td>
                      <td className="p-3 text-center bg-slate-100 font-bold text-slate-650" style={{ position: 'sticky', bottom: 0 }}>决策汇总</td>
                      <td className="p-3 text-center bg-slate-100 text-[10px] text-slate-500" style={{ position: 'sticky', bottom: 0 }}>—</td>
                      <td className="p-3 text-center bg-slate-100 text-[10px] text-slate-500" style={{ position: 'sticky', bottom: 0 }}>—</td>
                      <td className="p-3 text-right bg-slate-100 font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>{(crossTotals.sqpCvr * 100).toFixed(2)}%</td>
                      <td className="p-3 text-right bg-slate-100 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{(crossTotals.adsCvr * 100).toFixed(2)}%</td>
                      <td className="p-3 text-right bg-slate-100 font-mono text-[11px] text-slate-450" style={{ position: 'sticky', bottom: 0 }}>{(crossTotals.marketCvr * 100).toFixed(2)}%</td>
                      <td className="p-3 text-center bg-slate-100 font-mono text-[11px] text-slate-800" style={{ position: 'sticky', bottom: 0 }}>{crossTotals.cvrRatio.toFixed(2)}x</td>
                      <td className="p-3 text-center bg-slate-100 text-[10px] text-slate-500" style={{ position: 'sticky', bottom: 0 }}>—</td>
                      <td className="p-3 text-left bg-slate-100 font-semibold text-slate-600 text-[11px]" style={{ position: 'sticky', bottom: 0 }}>已贴底校验</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {processedList.length > limit && (
              <div className="text-center pt-2">
                <button
                  onClick={() => setLimit(prev => prev + 100)}
                  className="px-4 py-2 border border-slate-200 shadow-2xs hover:bg-slate-50 hover:border-slate-350 text-xs text-amber-600 font-semibold rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer"
                >
                  <ChevronDown className="w-4 h-4" /> 展开加载后续交叉词行数据 ({processedList.length - limit}决策单元)
                </button>
              </div>
            )}
          </React.Fragment>
        ) : (
          <div className="space-y-5 text-slate-705">
            {/* A. Methodology Card */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-slate-100 p-5 rounded-2xl border border-slate-800 shadow-md relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/15 via-transparent to-transparent opacity-60 pointer-events-none" />
              <div className="relative z-10 space-y-3.5">
                <div className="flex items-center gap-2 text-amber-400">
                  <Sparkles className="w-5 h-5 shrink-0" />
                  <h4 className="text-sm font-extrabold tracking-tight">一键周/新周期双端「词根深度聚合对撞分析」系统运营方法论</h4>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed max-w-4xl">
                  亚马逊搜索绩效中，离散的单个长尾词数据极易受极值或竞争偶然性干扰。而<strong>「一键词根聚合分析」</strong>通过哈希分解并重组语义，在「词根级」融合大盘自然端流量（SQP）与广告出价消耗（Ads spend）的漏斗绩效。以此提炼出的高置信度高频词根直接用来精细化否定与精准调价：
                </p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-1.5 font-sans">
                  <div className="bg-slate-800/60 border border-slate-800 p-3 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-bold text-sky-400">① 语义解构去噪音</span>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      智能过滤包含 prep./pron. 等无商业意义英文虚词。让长尾词的流量、点击及订单全数流向词根核心，数据密度自动提升。
                    </p>
                  </div>
                  <div className="bg-slate-800/60 border border-slate-800 p-3 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-bold text-purple-400">② 多词词根(双词)的威力</span>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      单个词根（如 "desk"）词义泛且极差悬殊；而连续的<strong>双/2词词根</strong>（如 "office desk", "ergonomic desk"）兼顾了明确的产品属性与足够起量的体量，是运营卡位定标的最佳段位。
                    </p>
                  </div>
                  <div className="bg-slate-800/60 border border-slate-800 p-3 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-bold text-amber-400">③ 双端 CVR 深度校验</span>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      比对特定词根下的<strong>大盘自然端 CVR</strong> 与<strong>付费广告端 CVR</strong>。当广告端 CVR 明显跑赢自然端时，证明溢价购买能力极佳，应大胆调高出价抢占前排广告展现。
                    </p>
                  </div>
                  <div className="bg-slate-800/60 border border-slate-800 p-3 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-bold text-red-400">④ 负向词精准截流</span>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      若词根在广告端产生了大量开销但订单却为零，或比率严重亏空，即属于空耗陷阱。应直接在亚马逊后台添加其为<strong>“词组否定匹配”</strong>切断无效竞资。
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* B. Stem Settings Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center font-sans">
              <div className="md:col-span-8 flex flex-wrap items-center gap-5">
                {/* Select Stem Type Toggle Buttons */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">词根拆分层级 (Grouping Degree)</label>
                  <div className="flex bg-slate-200/60 p-0.5 rounded-lg border border-slate-250">
                    <button
                      onClick={() => { setStemType('1-word'); setExpandedStem(null); }}
                      className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                        stemType === '1-word' ? 'bg-white text-slate-900 shadow-2xs font-extrabold' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      🍂 1词单个词根
                    </button>
                    <button
                      onClick={() => { setStemType('2-word'); setExpandedStem(null); }}
                      className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                        stemType === '2-word' ? 'bg-slate-900 text-white shadow-2xs font-extrabold text-white' : 'text-slate-500 hover:text-slate-800'
                      }`}
                      title="二词词根通常是具有极强意向属性的核心短语词组"
                    >
                      🌿 2词并接词组 (强烈推荐)
                    </button>
                    <button
                      onClick={() => { setStemType('3-word'); setExpandedStem(null); }}
                      className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                        stemType === '3-word' ? 'bg-slate-900 text-white shadow-2xs font-extrabold text-white' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      💮 3词长尾语义
                    </button>
                    <button
                      onClick={() => { setStemType('all'); setExpandedStem(null); }}
                      className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                        stemType === 'all' ? 'bg-slate-900 text-white shadow-2xs font-extrabold text-white' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      🧬 全词根聚合
                    </button>
                  </div>
                </div>

                {/* Minimum frequency filters */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">词频率限制：出现频次 ≥ {minFreq}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="1"
                      max="8"
                      value={minFreq}
                      onChange={(e) => { setMinFreq(parseInt(e.target.value)); setExpandedStem(null); }}
                      className="w-24 accent-amber-500 transition-all h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="font-mono text-xs font-bold text-slate-755 bg-white px-2 py-0.5 border border-slate-200 rounded leading-none">
                      ≥ {minFreq} 次
                    </span>
                  </div>
                </div>

                {/* Exclude Stopwords Toggle */}
                <div className="space-y-1.5 pt-0 md:pt-4">
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hideStopWords}
                      onChange={(e) => { setHideStopWords(e.target.checked); setExpandedStem(null); }}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-amber-500 accent-amber-500 focus:ring-amber-500 shadow-3xs"
                    />
                    <span>过滤介词虚词</span>
                  </label>
                </div>
              </div>

              {/* Right side controls */}
              <div className="md:col-span-4 space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">双端词根及包含词检索</label>
                  {/* Export stems custom report */}
                  <button
                    onClick={() => exportStemsXlsx(processedStemsList)}
                    className="text-[10px] text-amber-600 hover:text-amber-700 font-bold transition-all flex items-center gap-0.5 cursor-pointer"
                    title="导出分析出的词根对撞表"
                  >
                    <Download className="w-3 h-3" /> 导出词根分析
                  </button>
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="检索特定词根、或穿透搜索大盘包含词..."
                    className="pl-9 pr-3 py-1.5 border border-slate-250 rounded-lg text-xs w-full focus:outline-none focus:border-amber-500 text-slate-705 bg-white shadow-3xs"
                    value={stemSearchQuery}
                    onChange={(e) => setStemSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* C. Stems Diagnosed Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5 py-1 font-sans">
              <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-wider mr-2">
                <Filter className="w-3 h-3" /> 运营诊断定位:
              </span>
              <button
                onClick={() => setSelectedStemRole(null)}
                className={`py-1 px-3 rounded-full text-xs font-semibold scroll-smooth transition-all cursor-pointer ${
                  selectedStemRole === null ? 'bg-slate-900 text-slate-50' : 'bg-slate-100 hover:bg-slate-150 text-slate-600'
                }`}
              >
                展现全部 ({rawStemsList.length} 词根)
              </button>
              {[
                { tag: '强增效黄金词根', emoji: '🚀', variant: 'bg-emerald-55 text-emerald-600' },
                { tag: '高耗空砸词根', emoji: '🔴', variant: 'bg-red-55 text-red-650' },
                { tag: '自然金牌防守词', emoji: '🛡️', variant: 'bg-purple-55 text-purple-650' },
                { tag: '广告蚕食极度警觉', emoji: '⚠️', variant: 'bg-amber-100 text-amber-800' },
                { tag: '蓝海富矿潜力词', emoji: '💡', variant: 'bg-sky-55 text-sky-600' },
                { tag: '常规词群', emoji: '⚖️', variant: 'bg-slate-100 text-slate-600' }
              ].map(roleItem => {
                const count = rawStemsList.filter(s => s.role.includes(roleItem.tag)).length;
                if (count === 0 && roleItem.tag !== '常规词群') return null;
                return (
                  <button
                    key={roleItem.tag}
                    onClick={() => setSelectedStemRole(selectedStemRole === roleItem.tag ? null : roleItem.tag)}
                    className={`py-1 px-3 rounded-full text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                      selectedStemRole === roleItem.tag 
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-2xs border border-amber-600/30' 
                        : 'bg-slate-100 hover:bg-slate-150 text-slate-605'
                    }`}
                  >
                    <span>{roleItem.emoji}</span>
                    <span>{roleItem.tag}</span>
                    <span className="text-[10px] opacity-75 mr-0.5">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* D. Collapsed keyword drawer box */}
            {expandedStem && (
              <div className="bg-sky-50/50 border border-sky-150 p-4.5 rounded-xl text-xs space-y-3.5 shadow-fluid animate-fade-in relative z-10 font-sans">
                <button
                  onClick={() => setExpandedStem(null)}
                  className="absolute right-3.5 top-3.5 text-[10px] bg-white text-slate-650 px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-200 font-bold transition-all cursor-pointer shadow-3xs"
                >
                  ✕ 收起下级穿透行
                </button>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-sky-100 text-sky-600 rounded-lg font-bold font-mono">🧬</span>
                  <div>
                    <p className="font-bold text-slate-805 text-[12px]">
                      词根「<span className="font-mono text-sky-600 font-black uppercase text-[12.5px]">{expandedStem}</span>」涵盖穿透原始关键词核验明细
                    </p>
                    <p className="text-[10.5px] text-slate-455 mt-0.5">
                      本周期中包含此核心词根的 {currentActiveRows.filter(r => r.kw.toLowerCase().includes(expandedStem)).length} 个亚马逊离散长尾词数据明细：
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 max-h-48 overflow-y-auto custom-scrollbar pt-1 pr-1">
                  {currentActiveRows
                    .filter(r => r.kw.toLowerCase().includes(expandedStem))
                    .sort((a, b) => {
                      const totalA = a.sqpOrd + a.adsOrd;
                      const totalB = b.sqpOrd + b.adsOrd;
                      if (totalB !== totalA) {
                        return totalB - totalA;
                      }
                      if (b.sqpOrd !== a.sqpOrd) {
                        return b.sqpOrd - a.sqpOrd;
                      }
                      return b.qc - a.qc;
                    })
                    .map(r => (
                      <div key={r.kw} className="bg-white border border-slate-150 p-3 rounded-lg flex flex-col justify-between hover:border-slate-300 transition-all shadow-3xs hover:scale-[1.01]">
                        <span className="font-bold text-slate-800 truncate block" title={r.kw}>{r.kw}</span>
                        <div className="mt-2 flex justify-between items-center text-[10.5px] font-mono border-t border-slate-50 pt-1.5">
                          <span className="text-slate-455">搜量: {r.qc.toLocaleString()}</span>
                          <span className="text-slate-650 flex gap-1">
                            <b className="text-sky-600 font-bold">自 {r.sqpOrd}</b>/
                            <b className="text-amber-605 font-bold font-mono">广 {r.adsOrd}</b>
                          </span>
                        </div>
                        <div className="mt-1 flex justify-between items-center text-[9.5px]">
                          <span className="bg-slate-100 px-1 py-0.1 rounded text-slate-500 text-[9px] font-medium">{r.tag}</span>
                          <span className="text-red-500 font-mono font-bold">投 ￥{r.adsSpend.toFixed(0)}</span>
                        </div>
                      </div>
                  ))}
                </div>
              </div>
            )}

            {/* E. Large Stem Aggregation Table */}
            <div className="table-wrapper border border-slate-150 rounded-lg overflow-auto max-h-[460px] custom-scrollbar z-10 font-sans">
              <table className="relative w-full border-collapse">
                <thead>
                  <tr className="bg-slate-55 border-b border-slate-200 text-slate-550 text-[10.5px] font-bold sticky top-0 z-20 shadow-xs bg-slate-50">
                    <th 
                      className="text-left p-3 cursor-pointer select-none border-b border-slate-200 sticky left-0 shadow-r-sm z-30 bg-slate-50"
                      onClick={() => handleStemSort('stem')}
                    >
                      词根短词 / 拆分层级 {stemSortState.key === 'stem' ? (stemSortState.dir === 'asc' ? '▲' : '▼') : '↕'}
                    </th>
                    <th className="text-right p-3 cursor-pointer select-none border-b border-slate-200" onClick={() => handleStemSort('count')}>关联长尾原词量</th>
                    <th className="text-right p-3 cursor-pointer select-none border-b border-slate-200" onClick={() => handleStemSort('totalQc')}>大盘总搜索qc</th>
                    <th className="text-right p-3 cursor-pointer select-none border-b border-slate-200" onClick={() => handleStemSort('totalSqpClk')}>自然端点击数 (clk)</th>
                    <th className="text-right p-3 cursor-pointer select-none border-b border-slate-200" onClick={() => handleStemSort('totalSqpOrd')}>自然端本品订单 (ord)</th>
                    <th className="text-right p-3 cursor-pointer select-none border-b border-slate-200" onClick={() => handleStemSort('sqpCvr')}>自然转化率 (sqp CVR)</th>
                    <th className="text-right p-3 cursor-pointer select-none border-b border-slate-200" onClick={() => handleStemSort('totalAdsClk')}>广告总点击 (clk)</th>
                    <th className="text-right p-3 cursor-pointer select-none border-b border-slate-200" onClick={() => handleStemSort('totalAdsOrd')}>广告出单量 (ord)</th>
                    <th className="text-right p-3 cursor-pointer select-none border-b border-slate-200" onClick={() => handleStemSort('adsCvr')}>广告转化率 (ads CVR)</th>
                    <th className="text-right p-3 cursor-pointer select-none border-b border-slate-200" onClick={() => handleStemSort('totalAdsSpend')}>广告累计开销 (spend)</th>
                    <th className="text-right p-3 cursor-pointer select-none border-b border-slate-200" onClick={() => handleStemSort('cpc')}>平均 CPC</th>
                    <th className="text-center p-3 cursor-pointer select-none border-b border-slate-200" onClick={() => handleStemSort('cvrRatio')}>CVR 转换对抗比 (广/自)</th>
                    <th className="text-center p-3 border-b border-slate-200" style={{ minWidth: '130px' }}>运营诊断标签</th>
                    <th className="text-left p-3 border-b border-slate-200" style={{ minWidth: '280px' }}>词组否定与高Bid独立词专案优化操作建议</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-705 bg-white">
                  {processedStemsList.map((item, idx) => {
                    const isExpanded = expandedStem === item.stem;
                    return (
                      <tr key={idx} className={`hover:bg-slate-50/65 transition-colors ${isExpanded ? 'bg-sky-50/15' : ''}`}>
                        <td 
                          className="p-3 font-bold sticky left-0 bg-white font-mono text-slate-800 border-r border-slate-100 flex items-center gap-2 truncate shadow-r-xs z-10"
                          style={{ width: '220px', minWidth: '220px', maxWidth: '220px' }}
                          title="点击在此处穿透看关联词明细"
                        >
                          <button 
                            onClick={() => setExpandedStem(isExpanded ? null : item.stem)}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 shadow-3xs cursor-pointer ${
                              item.type === '1-word' ? 'bg-amber-100 text-amber-800' : item.type === '2-word' ? 'bg-emerald-100 text-emerald-800 font-extrabold' : 'bg-indigo-150 text-indigo-800'
                            }`}
                          >
                            {item.type === '1-word' ? '1词' : item.type === '2-word' ? '2词' : '3词'}
                          </button>
                          <span 
                            onClick={() => setExpandedStem(isExpanded ? null : item.stem)}
                            className="truncate hover:text-sky-600 transition-all cursor-pointer underline decoration-dotted font-extrabold text-[12px] uppercase"
                          >
                            {item.stem}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono text-[11px] text-slate-505 font-bold">{item.count}组词</td>
                        <td className="p-3 text-right font-mono text-[11px] font-semibold">{item.totalQc.toLocaleString()}</td>
                        <td className="p-3 text-right font-mono text-[11px] text-slate-400">{item.totalSqpClk.toLocaleString()}</td>
                        <td className="p-3 text-right font-mono text-[11px] font-bold text-slate-800">{item.totalSqpOrd}</td>
                        <td className="p-3 text-right font-mono text-[11px] text-slate-455">{(item.sqpCvr * 100).toFixed(2)}%</td>
                        <td className="p-3 text-right font-mono text-[11px] text-slate-400">{item.totalAdsClk.toLocaleString()}</td>
                        <td className="p-3 text-right font-mono text-[11px] font-bold text-amber-605">{item.totalAdsOrd}</td>
                        <td className="p-3 text-right font-mono text-[11px] text-slate-455">{(item.adsCvr * 100).toFixed(2)}%</td>
                        <td className="p-3 text-right font-mono text-[11px] text-red-500 font-bold">￥{item.totalAdsSpend.toFixed(0)}</td>
                        <td className="p-3 text-right font-mono text-[11px] text-slate-455 font-semibold">￥{item.cpc.toFixed(2)}</td>
                        <td className={`p-3 text-center font-mono text-[11px] font-bold ${item.cvrRatio >= 1.25 ? 'text-emerald-600' : item.cvrRatio < 0.75 && item.cvrRatio > 0 ? 'text-rose-500' : 'text-slate-650'}`}>
                          {item.totalAdsClk === 0 ? '—' : item.cvrRatio.toFixed(2) + 'x'}
                        </td>
                        <td className="p-3 text-center w-[130px] min-w-[130px]">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-extrabold ${item.roleClass}`}>
                            {item.role}
                          </span>
                        </td>
                        <td className="p-3 min-w-[280px]">
                          <span 
                            title={item.advice}
                            className={`block max-w-[480px] truncate px-2.5 py-1 rounded text-[11px] font-medium leading-relaxed select-text ${
                              item.role.includes('黄金') ? 'bg-emerald-50 text-emerald-850 border border-emerald-300/35' :
                              item.role.includes('空砸') ? 'bg-red-50 text-red-850 border border-red-300/35' :
                              item.role.includes('防守') ? 'bg-purple-50 text-purple-850 border border-purple-300/35' :
                              item.role.includes('蚕食') ? 'bg-amber-55/15 text-amber-850 border border-amber-300/35' :
                              item.role.includes('潜力') ? 'bg-sky-50 text-sky-850 border border-sky-300/35' :
                              'bg-slate-50 text-slate-655 border border-slate-200'
                            }`}
                          >
                            {item.advice}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {processedStemsList.length === 0 && (
                    <tr>
                      <td colSpan={14} className="p-12 text-center text-slate-400 space-y-2 font-sans">
                        <Sliders className="w-8 h-8 mx-auto stroke-slate-300 animate-pulse" />
                        <p className="text-xs">未探测到符合设定要求的词根结构，建议降低“关联关键词数”或者放松检索字词重试。</p>
                      </td>
                    </tr>
                  )}
                </tbody>
                {crossStemTotals && (
                  <tfoot className="sticky bottom-0 z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] bg-slate-100">
                    <tr className="font-bold border-t-2 border-slate-300 text-slate-900">
                      <td 
                        className="p-3 bg-slate-100 font-extrabold border-r border-slate-200 text-slate-950 truncate"
                        style={{ width: '220px', minWidth: '220px', maxWidth: '220px', position: 'sticky', bottom: 0, left: 0, zIndex: 30 }}
                        title="词根聚合汇总"
                      >
                        词根汇总 (已贴底)
                      </td>
                      <td className="p-3 text-right bg-slate-100 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{crossStemTotals.count}组词</td>
                      <td className="p-3 text-right bg-slate-100 font-mono text-[11px] font-semibold" style={{ position: 'sticky', bottom: 0 }}>{crossStemTotals.totalQc.toLocaleString()}</td>
                      <td className="p-3 text-right bg-slate-100 font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>{crossStemTotals.totalSqpClk.toLocaleString()}</td>
                      <td className="p-3 text-right bg-slate-100 font-mono text-[11px] font-bold text-slate-800" style={{ position: 'sticky', bottom: 0 }}>{crossStemTotals.totalSqpOrd.toLocaleString()}</td>
                      <td className="p-3 text-right bg-slate-100 font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>{(crossStemTotals.sqpCvr * 100).toFixed(2)}%</td>
                      <td className="p-3 text-right bg-slate-100 font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>{crossStemTotals.totalAdsClk.toLocaleString()}</td>
                      <td className="p-3 text-right bg-slate-100 font-mono text-[11px] font-bold text-amber-605" style={{ position: 'sticky', bottom: 0 }}>{crossStemTotals.totalAdsOrd.toLocaleString()}</td>
                      <td className="p-3 text-right bg-slate-100 font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>{(crossStemTotals.adsCvr * 100).toFixed(2)}%</td>
                      <td className="p-3 text-right bg-slate-100 font-mono text-[11px] font-extrabold text-red-500" style={{ position: 'sticky', bottom: 0 }}>￥{crossStemTotals.totalAdsSpend.toFixed(0)}</td>
                      <td className="p-3 text-right bg-slate-100 font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>￥{crossStemTotals.cpc.toFixed(2)}</td>
                      <td className="p-3 text-center bg-slate-100 font-mono text-[11px] font-bold text-slate-800" style={{ position: 'sticky', bottom: 0 }}>{crossStemTotals.cvrRatio.toFixed(2)}x</td>
                      <td className="p-3 text-center bg-slate-100 text-[10px] font-extrabold text-slate-500" style={{ position: 'sticky', bottom: 0 }}>打标总括</td>
                      <td className="p-3 text-left bg-slate-100 font-semibold text-slate-600 text-[11px]" style={{ position: 'sticky', bottom: 0 }}>已贴底校验</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </div>

          {/* Dual Top 10 Core Keywords Overview Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {/* Column 1: Top 10 SQP Natural Purchase Share */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-5 bg-sky-500 rounded-xs" />
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    🍂 SQP 自然出单占比 前10关键词
                  </h4>
                </div>
                <span className="text-[10px] bg-sky-50 font-semibold text-sky-600 px-2 py-0.5 rounded-full border border-sky-100 font-mono">
                  Natural Share Rank
                </span>
              </div>

              {topSqpList.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 text-center">暂无 SQP 出单大盘匹配词汇</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {topSqpList.map((item, idx) => {
                    const isSelected = selectedChartKws.includes(item.kw);
                    const otherItem = otherActiveMap.get(item.kw.toLowerCase());
                    let compareText = '';
                    let compareColor = 'text-slate-400';

                    if (otherItem) {
                      const currentVal = activePeriod === 'current' ? item.sqpNaturalShare : otherItem.sqpNaturalShare;
                      const nextVal = activePeriod === 'current' ? otherItem.sqpNaturalShare : item.sqpNaturalShare;
                      const change = nextVal - currentVal;
                      const formattedVal = (otherItem.sqpNaturalShare * 100).toFixed(2);
                      const formattedDiff = (Math.abs(change) * 100).toFixed(2);
                      const periodLabel = activePeriod === 'current' ? '下期' : '本期';

                      if (change > 0) {
                        compareText = `▲ +${formattedDiff}% (${periodLabel} ${formattedVal}%)`;
                        compareColor = 'text-emerald-600 font-semibold';
                      } else if (change < 0) {
                        compareText = `▼ -${formattedDiff}% (${periodLabel} ${formattedVal}%)`;
                        compareColor = 'text-rose-500 font-semibold';
                      } else {
                        compareText = `• 持平 (${periodLabel} ${formattedVal}%)`;
                        compareColor = 'text-slate-400';
                      }
                    } else {
                      compareText = activePeriod === 'current' ? '(下期无对照/出局)' : '(本期无对照/新晋)';
                      compareColor = 'text-slate-400 italic';
                    }

                    return (
                      <div 
                        key={item.kw}
                        onClick={() => toggleKwSelection(item.kw)}
                        className={`flex items-center justify-between py-2 text-xs transition-colors cursor-pointer group hover:bg-slate-50 rounded px-2 -mx-2 ${
                          isSelected ? 'bg-amber-50/40' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2 w-0 flex-1 truncate">
                          <span className={`w-4 h-4 rounded text-[10px] font-bold font-mono flex items-center justify-center ${
                            idx < 3 ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {idx + 1}
                          </span>
                          <span className="font-medium text-slate-700 truncate group-hover:text-amber-600 transition-colors mr-1" title={item.kw}>
                            {item.kw}
                          </span>
                        </div>
                        <div className="flex flex-col items-end shrink-0 ml-4">
                          <div className="flex items-center gap-3">
                            <span className="text-slate-400 text-[10px] font-mono">{item.sqpOrd} 单 / {item.sqpClk} 击</span>
                            <span className="text-sky-600 font-bold font-mono text-right text-[12px]">
                              {(item.sqpNaturalShare * 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className={`text-[9px] font-mono mt-0.5 ${compareColor}`}>
                            {compareText}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Column 2: Top 10 Ads Order Contribution Share */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-5 bg-amber-500 rounded-xs" />
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    📢 Ads 广告出单占比（广告订单贡献比）前 10 关键词
                  </h4>
                </div>
                <span className="text-[10px] bg-amber-50 font-semibold text-amber-600 px-2 py-0.5 rounded-full border border-amber-100 font-mono">
                  Ads Share Rank
                </span>
              </div>

              {topAdsList.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 text-center">暂无 Ads 广告出单匹配词汇</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {topAdsList.map((item, idx) => {
                    const isSelected = selectedChartKws.includes(item.kw);
                    const otherItem = otherActiveMap.get(item.kw.toLowerCase());
                    let compareText = '';
                    let compareColor = 'text-slate-400';

                    if (otherItem) {
                      const currentVal = activePeriod === 'current' ? item.adsOrderShare : otherItem.adsOrderShare;
                      const nextVal = activePeriod === 'current' ? otherItem.adsOrderShare : item.adsOrderShare;
                      const change = nextVal - currentVal;
                      const formattedVal = (otherItem.adsOrderShare * 100).toFixed(2);
                      const formattedDiff = (Math.abs(change) * 100).toFixed(2);
                      const periodLabel = activePeriod === 'current' ? '下期' : '本期';

                      if (change > 0) {
                        compareText = `▲ +${formattedDiff}% (${periodLabel} ${formattedVal}%)`;
                        compareColor = 'text-emerald-600 font-semibold';
                      } else if (change < 0) {
                        compareText = `▼ -${formattedDiff}% (${periodLabel} ${formattedVal}%)`;
                        compareColor = 'text-rose-500 font-semibold';
                      } else {
                        compareText = `• 持平 (${periodLabel} ${formattedVal}%)`;
                        compareColor = 'text-slate-400';
                      }
                    } else {
                      compareText = activePeriod === 'current' ? '(下期无广告贡献)' : '(本期无广告贡献)';
                      compareColor = 'text-slate-400 italic';
                    }

                    return (
                      <div 
                        key={item.kw}
                        onClick={() => toggleKwSelection(item.kw)}
                        className={`flex items-center justify-between py-2 text-xs transition-colors cursor-pointer group hover:bg-slate-50 rounded px-2 -mx-2 ${
                          isSelected ? 'bg-amber-50/40' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2 w-0 flex-1 truncate">
                          <span className={`w-4 h-4 rounded text-[10px] font-bold font-mono flex items-center justify-center ${
                            idx < 3 ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {idx + 1}
                          </span>
                          <span className="font-medium text-slate-700 truncate group-hover:text-amber-600 transition-colors mr-1" title={item.kw}>
                            {item.kw}
                          </span>
                        </div>
                        <div className="flex flex-col items-end shrink-0 ml-4">
                          <div className="flex items-center gap-3">
                            <span className="text-slate-400 text-[10px] font-mono">{item.adsOrd} 单 / ￥{item.adsSpend.toFixed(0)}</span>
                            <span className="text-amber-600 font-bold font-mono text-right text-[12px]">
                              {(item.adsOrderShare * 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className={`text-[9px] font-mono mt-0.5 ${compareColor}`}>
                            {compareText}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Recharts CVR Comparison Trend Chart Area */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4 mt-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                  <TrendingUp className="text-amber-500 w-4 h-4" />
                  双端漏斗转化率对照阻尼曲线谱
                </h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  对比所选特定核心词的双端转化效率（SQP自然购单Cvr / Ads付费点击Cvr），直观可见两条漏斗的拟合重叠程度。Ads 广告转化率高开甚至溢出，能完美佐证本词广告强劲的助推拉升能力。
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500 text-[11px] mr-1">
                  当前已选：<strong className="font-mono text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">{selectedChartKws.length}</strong> 组词
                </span>
                <button
                  onClick={handleSelectAllFiltered}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition-all cursor-pointer"
                  title="全选当前过滤并排序结果下的前 100 个词进行图表比对"
                >
                  ⚡ 全选当前前100个
                </button>
                <button
                  onClick={handleRestoreDefaultTop}
                  className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[11px] font-semibold transition-all cursor-pointer shadow-xs border border-amber-600/10"
                  title="恢复为SQP自然出单占比前10 + 广告出单占比前10的合并去重关键词组"
                >
                  🎯 默认核心词 (出单占比两端Top10)
                </button>
                <button
                  onClick={handleClearAllChart}
                  className="px-2.5 py-1.5 bg-red-50 hover:bg-red-150 text-red-650 rounded-lg text-[11px] font-semibold transition-all cursor-pointer"
                >
                  🧹 清空所选
                </button>
              </div>
            </div>

            {chartData.length === 0 ? (
              <div className="h-64 border border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-400 space-y-2">
                <Filter className="w-8 h-8 text-slate-300 animate-pulse" />
                <p className="text-xs">当前没有勾选任何用于比对的词。请在下方表格中勾选关键词复选框，或点击上方“⚡ 全选当前前100个”自动计算展现。</p>
              </div>
            ) : (
              <div className="w-full h-[360px] pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      stroke="#94a3b8" 
                      fontSize={10} 
                      tickLine={false}
                      axisLine={false}
                      dy={10}
                      angle={-15}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis 
                      stroke="#94a3b8" 
                      fontSize={10} 
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <RechartsTooltip content={<CustomChartTooltip />} />
                    <Legend 
                      verticalAlign="top" 
                      height={36} 
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: '11px', fontWeight: '500' }}
                    />
                    <Line 
                      name="🍂 SQP 自然转化率" 
                      type="monotone" 
                      dataKey="SQP自然转化率" 
                      stroke="#0ea5e9" 
                      strokeWidth={2.5}
                      dot={{ r: 3, stroke: '#0ea5e9', strokeWidth: 1.5, fill: '#fff' }}
                      activeDot={{ r: 5, stroke: '#0ea5e9', strokeWidth: 2, fill: '#fff' }}
                    />
                    <Line 
                      name="📢 Ads 广告转化率" 
                      type="monotone" 
                      dataKey="Ads广告转化率" 
                      stroke="#f59e0b" 
                      strokeWidth={2.5}
                      dot={{ r: 3, stroke: '#f59e0b', strokeWidth: 1.5, fill: '#fff' }}
                      activeDot={{ r: 5, stroke: '#f59e0b', strokeWidth: 2, fill: '#fff' }}
                    />
                    <Line 
                      name="🌐 大盘基准 CVR" 
                      type="monotone" 
                      dataKey="大盘CVR" 
                      stroke="#8b5cf6" 
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={{ r: 3, stroke: '#8b5cf6', strokeWidth: 1.5, fill: '#fff' }}
                      activeDot={{ r: 5, stroke: '#8b5cf6', strokeWidth: 2, fill: '#fff' }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </React.Fragment>
      )}
    </div>
  );
}
