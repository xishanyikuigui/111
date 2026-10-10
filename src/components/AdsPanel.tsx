/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect, MouseEvent } from 'react';
import { motion } from 'motion/react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { 
  Megaphone, Search, Download, HelpCircle, ArrowUp, ArrowDown, 
  ChevronDown, Sliders, CheckCircle, Percent, Coins, TrendingUp,
  RefreshCw, FileText
} from 'lucide-react';
import { AdsRow, AdsCompareRow } from '../types';
import { cleanNum, cleanPct, getAdsDiag, getAdsTrendInterpretation, getDynamicThresholds } from '../utils/analyzers';


interface AdsPanelProps {
  adsRows: AdsRow[];
  setAdsRows: (rows: AdsRow[]) => void;
  adsCompareRows: AdsCompareRow[];
  setAdsCompareRows: (rows: AdsCompareRow[]) => void;
  compareAdsFile: File | null;
  setCompareAdsFile: (file: File | null) => void;
  compareStatusMsg: string;
  setCompareStatusMsg: (msg: string) => void;
  compareRawCache: any[];
  setCompareRawCache: (cache: any[]) => void;
  firstColWidth: number;
  setFirstColWidth: (w: number) => void;
  onDataLoaded: () => void;
}

export default function AdsPanel({
  adsRows,
  setAdsRows,
  adsCompareRows,
  setAdsCompareRows,
  compareAdsFile,
  setCompareAdsFile,
  compareStatusMsg,
  setCompareStatusMsg,
  compareRawCache,
  setCompareRawCache,
  firstColWidth,
  setFirstColWidth,
  onDataLoaded
}: AdsPanelProps) {
  const [adsFile, setAdsFile] = useState<File | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // State hooks for Ring Comparison Features (WoW/MoM) — Now lifted to App.tsx
  const [compareLimit, setCompareLimit] = useState(100);
  const [compareSort, setCompareSort] = useState<{ key: keyof AdsCompareRow | ''; dir: 'asc' | 'desc' }>({ key: 'sp_change', dir: 'desc' });


  // Configuration Thresholds (dynamic state, will re-trigger analysis on fly)
  const [targetAcos, setTargetAcos] = useState(25);
  const [targetCpa, setTargetCpa] = useState(8.0);
  const [margin, setMargin] = useState(35);
  const [targetCtr, setTargetCtr] = useState(2.0);
  const [targetCvr, setTargetCvr] = useState(3.0);
  const [isManualThreshold, setIsManualThreshold] = useState(false);
  const [showLogicInfo, setShowLogicInfo] = useState(false);

  const [limit, setLimit] = useState(100);
  const [sortState, setSortState] = useState<{ key: keyof AdsRow | ''; dir: 'asc' | 'desc' }>({ key: 'sp', dir: 'desc' });

  // Column resizing state management
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(firstColWidth);

  const rawDataRef = useRef<any[]>([]);

  const dynThresholds = useMemo(() => {
    return getDynamicThresholds({ targetAcos, targetCpa, margin });
  }, [targetAcos, targetCpa, margin]);

  // Sync automatic suggested defaults when targetAcos, targetCpa, or margin slides change
  // unless user has manually customized CTR/CVR sliders
  useEffect(() => {
    if (!isManualThreshold) {
      setTargetCtr(parseFloat((dynThresholds.ctrThreshold * 100).toFixed(1)));
      setTargetCvr(parseFloat((dynThresholds.cvrThreshold * 100).toFixed(1)));
    }
  }, [dynThresholds, isManualThreshold]);

  const stats = useMemo(() => {
    if (adsRows.length === 0) return { totalSpend: 0, totalSales: 0, totalOrders: 0, avgAcos: 0, healthyProfitWords: 0 };
    const totalSpend = adsRows.reduce((a, b) => a + b.sp, 0);
    const totalSales = adsRows.reduce((a, b) => a + b.ts, 0);
    const totalOrders = adsRows.reduce((a, b) => a + b.to, 0);
    const avgAcos = totalSales > 0 ? (totalSpend / totalSales) : 0;
    const healthyProfitWords = adsRows.filter(r => r.ac <= targetAcos / 100).length;
    return { totalSpend, totalSales, totalOrders, avgAcos, healthyProfitWords };
  }, [adsRows, targetAcos]);

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

  const findColIndex = (headers: string[], keywords: string[]) => {
    const normalizedHeaders = headers.map(h => String(h || '').trim().toLowerCase());
    
    // First pass: try exact match
    for (const kw of keywords) {
      const target = kw.toLowerCase();
      const idx = normalizedHeaders.findIndex(val => val === target);
      if (idx !== -1) return idx;
    }
    
    // Second pass: try relaxed contains matching
    for (const kw of keywords) {
      const target = kw.toLowerCase();
      const idx = normalizedHeaders.findIndex(val => {
        if (!val) return false;
        
        // Prevent false overlaps between total metrics and advertised ASIN metrics
        if (target === 'sales' || target === '销售额') {
          if (val.includes('advertised') || val.includes('直接') || val.includes('商品')) {
            return false;
          }
        }
        if (target === 'orders' || target === '订单量' || target === '广告订单') {
          if (val.includes('advertised') || val.includes('直接') || val.includes('商品') || val.includes('单位')) {
            return false;
          }
        }
        return val.includes(target);
      });
      if (idx !== -1) return idx;
    }
    
    return -1;
  };

  const parseFileToRows = (
    file: File,
    callback: (rows: string[][]) => void,
    errorCallback: (err: any) => void
  ) => {
    const name = file.name.toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, raw: false });
          const stringRows = rows.map((r) => {
            if (!Array.isArray(r)) return [];
            return r.map((cell) => (cell !== undefined && cell !== null ? String(cell) : ''));
          });
          callback(stringRows);
        } catch (err) {
          errorCallback(err);
        }
      };
      reader.onerror = (err) => {
        errorCallback(err);
      };
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data as string[][];
          callback(rows);
        },
        error: (err) => {
          errorCallback(err);
        },
      });
    }
  };

  const handleParseAds = (file: File) => {
    setStatusMsg('⏳ 正在解析广告报告...');
    parseFileToRows(
      file,
      (rows) => {
        try {
          if (rows.length < 2) throw new Error('数据为空或格式不匹配');
          let headerIdx = -1;
          for (let i = 0; i < Math.min(rows.length, 15); i++) {
            const rowStr = rows[i].map((c) => String(c || '').trim().toLowerCase());

            const hasKeywordCol = rowStr.some(
              (val) =>
                val.includes('用户搜索词') ||
                val.includes('customer search term') ||
                val.includes('customer search terms') ||
                val.includes('search term') ||
                val.includes('搜索词') ||
                val.includes('关键词') ||
                val.includes('keyword') ||
                val.includes('keywords') ||
                val.includes('targeting') ||
                val.includes('投放') ||
                val.includes('投放词') ||
                val === 'kw'
            );

            const metricMatches = rowStr.filter(
              (val) =>
                val.includes('曝光') ||
                val.includes('impression') ||
                val.includes('点击') ||
                val.includes('click') ||
                val.includes('花费') ||
                val.includes('spend') ||
                val.includes('cost') ||
                val.includes('销售') ||
                val.includes('sales') ||
                val.includes('订单') ||
                val.includes('orders') ||
                val.includes('acos') ||
                val.includes('cpc')
            ).length;

            if (hasKeywordCol || metricMatches >= 2) {
              headerIdx = i;
              break;
            }
          }
          if (headerIdx === -1 && rows.length > 0) {
            headerIdx = 0;
          }
          const headers = rows[headerIdx].map((h) => String(h || '').trim());
          const colMap = {
            kw: findColIndex(headers, [
              '用户搜索词',
              'customer search term',
              'customer search terms',
              'search term',
              '搜索词',
              '关键词',
              'keyword',
              'keywords',
              'targeting',
              '投放',
              '投放词',
              'kw',
            ]),
            fr: findColIndex(headers, ['词频', 'frequency', 'count', 'frequency count', '用户搜索词词频']),
            im: findColIndex(headers, [
              '曝光量',
              'impressions',
              '展现量',
              '展现数',
              '曝光数',
              'impression count',
              '曝光',
              '展现',
            ]),
            cl: findColIndex(headers, [
              '点击',
              'clicks',
              '点击量',
              '点击数',
              'click count',
              '点击数(clicks)',
              '点击数（clicks）',
            ]),
            ct: findColIndex(headers, ['ctr', 'click-through rate', '点击率', '点击率(ctr)']),
            cp: findColIndex(headers, ['cpc', 'average cpc', '平均每次点击费用(cpc)', '平均每次点击费用', '平均cpc']),
            sp: findColIndex(headers, ['花费', 'spend', '广告花费', '广告支出', '支出', 'spending', 'cost']),
            ts: findColIndex(headers, [
              '广告销售额',
              '7天总销售额',
              '销售额',
              '7 day total sales',
              'sales',
              '7-day total sales',
              '广告转化销售额',
              '销售',
              '总销售额',
            ]),
            ds: findColIndex(headers, [
              '直接销售额',
              '7天广告商品销售额',
              '直接销售额',
              '7 day advertised asin sales',
              '7-day advertised asin sales',
              'advertised asin sales',
            ]),
            ac: findColIndex(headers, [
              'acos',
              'advertising cost of sales',
              '广告成本销售比',
              '广告销售成本',
              '广告成本销售比(acos)',
              '7天广告成本销售比(acos)',
            ]),
            to: findColIndex(headers, [
              '广告订单',
              '7天总订单量',
              '订单量',
              '7 day total orders',
              'orders',
              '7-day total orders',
              '广告转化订单量',
              '7-day total units',
              '7天总商品销量',
              '7天总购买量',
              '总订单量',
            ]),
            do: findColIndex(headers, [
              '直接订单',
              '7天广告商品单位数',
              '7-day advertised asin units',
              '7 day advertised asin units',
              '直接销量',
              '7天广告商品销量',
              'direct orders',
              'advertised asin units',
            ]),
            ca: findColIndex(headers, ['cpa', '平均每次转化费用']),
            cv: findColIndex(headers, [
              'cvr',
              '7天转化率',
              '转化率',
              '7 day conversion rate',
              '7-day conversion rate',
              '7 day cvr',
              'click conversion rate',
            ]),
          };

          // Smart fallbacks
          if (colMap.kw === -1 && headers.length > 0) {
            colMap.kw = 0; // Default to column 0 if keyword column name couldn't be mapped
          }
          if (colMap.im === -1 && headers.length > 1) {
            const possibleIm = findColIndex(headers, ['曝光', 'impression', '展现']);
            if (possibleIm !== -1) colMap.im = possibleIm;
          }
          if (colMap.sp === -1 && headers.length > 1) {
            const possibleSp = findColIndex(headers, ['花费', 'spend', 'cost']);
            if (possibleSp !== -1) colMap.sp = possibleSp;
          }

          if (colMap.kw === -1 || colMap.im === -1 || colMap.sp === -1) {
            const missing = [];
            if (colMap.kw === -1) missing.push('用户搜索词/关键词/Customer Search Term');
            if (colMap.im === -1) missing.push('曝光量/Impressions');
            if (colMap.sp === -1) missing.push('花费/Spend');
            throw new Error(`缺少关键数据列: ${missing.join(', ')}。请确保报告中包含这些列并具有正确的表头标题。`);
          }

          const parsedList: any[] = [];
          let skippedTotals = 0;

          for (let i = headerIdx + 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r || r.length <= Math.max(...Object.values(colMap))) continue;
            const kw = String(r[colMap.kw] || '').trim();
            if (!kw) continue;

            // Check if summary totals row
            if (/总和|总计|合计|total|grand|summary|all/i.test(kw)) {
              skippedTotals++;
              continue;
            }

            parsedList.push({
              kw,
              fr: colMap.fr !== -1 ? cleanNum(r[colMap.fr]) : 0,
              im: cleanNum(r[colMap.im]),
              cl: cleanNum(r[colMap.cl]),
              ct: colMap.ct !== -1 ? cleanPct(r[colMap.ct]) : 0,
              cp: colMap.cp !== -1 ? cleanNum(r[colMap.cp]) : 0,
              sp: colMap.sp !== -1 ? cleanNum(r[colMap.sp]) : 0,
              ts: colMap.ts !== -1 ? cleanNum(r[colMap.ts]) : 0,
              ds: colMap.ds !== -1 ? cleanNum(r[colMap.ds]) : 0,
              ac: colMap.ac !== -1 ? cleanPct(r[colMap.ac]) : 0,
              to: colMap.to !== -1 ? cleanNum(r[colMap.to]) : 0,
              do: colMap.do !== -1 ? cleanNum(r[colMap.do]) : 0,
              ca: colMap.ca !== -1 ? cleanNum(r[colMap.ca]) : 0,
              cv: colMap.cv !== -1 ? cleanPct(r[colMap.cv]) : 0,
            });
          }

          rawDataRef.current = parsedList;
          setAdsFile(file);
          setStatusMsg(
            `✅ 成功载入数据：解析出 ${parsedList.length} 个广告推广搜索词（已跳过 ${skippedTotals}行 汇总数据关系）`
          );
          // Automatically run computation after loading
          runAnalysis(parsedList, targetAcos, targetCpa, margin, targetCtr, targetCvr);
        } catch (err: any) {
          setStatusMsg(`❌ 解析失败：${err.message}`);
        }
      },
      (err) => {
        setStatusMsg(`❌ 文件读取失败：${err.message || err}`);
      }
    );
  };

  const runAnalysis = (
    raw: any[], 
    acosTarget: number, 
    cpaTarget: number, 
    productMargin: number,
    ctrTarget?: number,
    cvrTarget?: number
  ) => {
    if (raw.length === 0) return;
    const totalOrders = raw.reduce((sum, r) => sum + r.to, 0);
    const totalSpend = raw.reduce((sum, r) => sum + r.sp, 0);

    const cfg = { 
      targetAcos: acosTarget, 
      targetCpa: cpaTarget, 
      margin: productMargin,
      targetCtr: ctrTarget,
      targetCvr: cvrTarget
    };

    const processed: AdsRow[] = raw.map(r => {
      const d = getAdsDiag(r, cfg);
      const directRatio = r.to > 0 ? r.do / r.to : 0;
      let attrTag = '🔄 混合转化型';
      let attrClass = 'bg-blue-50 text-blue-600 border border-blue-100';

      if (directRatio < 0.3) {
        attrTag = '🔗 矩阵引流型';
        attrClass = 'bg-purple-50 text-purple-600 border border-purple-100';
      } else if (directRatio >= 0.7) {
        attrTag = '🎯 爆款推类型';
        attrClass = 'bg-emerald-50 text-emerald-600 border border-emerald-100';
      }

      return {
        ...r,
        aos: totalOrders > 0 ? r.to / totalOrders : 0,
        adSpendShare: totalSpend > 0 ? r.sp / totalSpend : 0,
        attrTag,
        attrClass,
        t: d.t,
        c: d.c,
        dr: d.dr
      };
    }).filter(r => r.im > 0 || r.cl > 0);

    setAdsRows(processed);
    onDataLoaded();
    setLimit(100);
  };

  // Trigger analysis recalculation dynamically when sliders are adjusted
  useEffect(() => {
    if (rawDataRef.current.length > 0) {
      runAnalysis(rawDataRef.current, targetAcos, targetCpa, margin, targetCtr, targetCvr);
    }
  }, [targetAcos, targetCpa, margin, targetCtr, targetCvr]);

  const handleParseCompareAds = (file: File) => {
    setCompareStatusMsg('⏳ 正在解析环比时段广告报告...');
    parseFileToRows(
      file,
      (rows) => {
        try {
          if (rows.length < 2) throw new Error('数据为空或格式不匹配');
          let headerIdx = -1;
          for (let i = 0; i < Math.min(rows.length, 15); i++) {
            const rowStr = rows[i].map((c) => String(c || '').trim().toLowerCase());

            const hasKeywordCol = rowStr.some(
              (val) =>
                val.includes('用户搜索词') ||
                val.includes('customer search term') ||
                val.includes('customer search terms') ||
                val.includes('search term') ||
                val.includes('搜索词') ||
                val.includes('关键词') ||
                val.includes('keyword') ||
                val.includes('keywords') ||
                val.includes('targeting') ||
                val.includes('投放') ||
                val.includes('投放词') ||
                val === 'kw'
            );

            const metricMatches = rowStr.filter(
              (val) =>
                val.includes('曝光') ||
                val.includes('impression') ||
                val.includes('点击') ||
                val.includes('click') ||
                val.includes('花费') ||
                val.includes('spend') ||
                val.includes('cost') ||
                val.includes('销售') ||
                val.includes('sales') ||
                val.includes('订单') ||
                val.includes('orders') ||
                val.includes('acos') ||
                val.includes('cpc')
            ).length;

            if (hasKeywordCol || metricMatches >= 2) {
              headerIdx = i;
              break;
            }
          }
          if (headerIdx === -1 && rows.length > 0) {
            headerIdx = 0;
          }
          const headers = rows[headerIdx].map((h) => String(h || '').trim());
          const colMap = {
            kw: findColIndex(headers, [
              '用户搜索词',
              'customer search term',
              'customer search terms',
              'search term',
              '搜索词',
              '关键词',
              'keyword',
              'keywords',
              'targeting',
              '投放',
              '投放词',
              'kw',
            ]),
            fr: findColIndex(headers, ['词频', 'frequency', 'count', 'frequency count', '用户搜索词词频']),
            im: findColIndex(headers, [
              '曝光量',
              'impressions',
              '展现量',
              '展现数',
              '曝光数',
              'impression count',
              '曝光',
              '展现',
            ]),
            cl: findColIndex(headers, [
              '点击',
              'clicks',
              '点击量',
              '点击数',
              'click count',
              '点击数(clicks)',
              '点击数（clicks）',
            ]),
            ct: findColIndex(headers, ['ctr', 'click-through rate', '点击率', '点击率(ctr)']),
            cp: findColIndex(headers, ['cpc', 'average cpc', '平均每次点击费用(cpc)', '平均每次点击费用', '平均cpc']),
            sp: findColIndex(headers, ['花费', 'spend', '广告花费', '广告支出', '支出', 'spending', 'cost']),
            ts: findColIndex(headers, [
              '广告销售额',
              '7天总销售额',
              '销售额',
              '7 day total sales',
              'sales',
              '7-day total sales',
              '广告转化销售额',
              '销售',
              '总销售额',
            ]),
            ds: findColIndex(headers, [
              '直接销售额',
              '7天广告商品销售额',
              '直接销售额',
              '7 day advertised asin sales',
              '7-day advertised asin sales',
              'advertised asin sales',
            ]),
            ac: findColIndex(headers, [
              'acos',
              'advertising cost of sales',
              '广告成本销售比',
              '广告销售成本',
              '广告成本销售比(acos)',
              '7天广告成本销售比(acos)',
            ]),
            to: findColIndex(headers, [
              '广告订单',
              '7天总订单量',
              '订单量',
              '7 day total orders',
              'orders',
              '7-day total orders',
              '广告转化订单量',
              '7-day total units',
              '7天总商品销量',
              '7天总购买量',
              '总订单量',
            ]),
            do: findColIndex(headers, [
              '直接订单',
              '7天广告商品单位数',
              '7-day advertised asin units',
              '7 day advertised asin units',
              '直接销量',
              '7天广告商品销量',
              'direct orders',
              'advertised asin units',
            ]),
            ca: findColIndex(headers, ['cpa', '平均每次转化费用']),
            cv: findColIndex(headers, [
              'cvr',
              '7天转化率',
              '转化率',
              '7 day conversion rate',
              '7-day conversion rate',
              '7 day cvr',
              'click conversion rate',
            ]),
          };

          // Smart fallbacks
          if (colMap.kw === -1 && headers.length > 0) {
            colMap.kw = 0; // Default to column 0 if keyword column name couldn't be mapped
          }
          if (colMap.im === -1 && headers.length > 1) {
            const possibleIm = findColIndex(headers, ['曝光', 'impression', '展现']);
            if (possibleIm !== -1) colMap.im = possibleIm;
          }
          if (colMap.sp === -1 && headers.length > 1) {
            const possibleSp = findColIndex(headers, ['花费', 'spend', 'cost']);
            if (possibleSp !== -1) colMap.sp = possibleSp;
          }

          if (colMap.kw === -1 || colMap.im === -1 || colMap.sp === -1) {
            const missing = [];
            if (colMap.kw === -1) missing.push('用户搜索词/关键词/Customer Search Term');
            if (colMap.im === -1) missing.push('曝光量/Impressions');
            if (colMap.sp === -1) missing.push('花费/Spend');
            throw new Error(`缺少关键数据列: ${missing.join(', ')}。请确保报告中包含这些列并具有正确的表头标题。`);
          }

          const parsedList: any[] = [];
          let skippedTotals = 0;

          for (let i = headerIdx + 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r || r.length <= Math.max(...Object.values(colMap))) continue;
            const kw = String(r[colMap.kw] || '').trim();
            if (!kw) continue;

            if (/总和|总计|合计|total|grand|summary|all/i.test(kw)) {
              skippedTotals++;
              continue;
            }

            parsedList.push({
              kw,
              fr: colMap.fr !== -1 ? cleanNum(r[colMap.fr]) : 0,
              im: cleanNum(r[colMap.im]),
              cl: cleanNum(r[colMap.cl]),
              ct: colMap.ct !== -1 ? cleanPct(r[colMap.ct]) : 0,
              cp: colMap.cp !== -1 ? cleanNum(r[colMap.cp]) : 0,
              sp: colMap.sp !== -1 ? cleanNum(r[colMap.sp]) : 0,
              ts: colMap.ts !== -1 ? cleanNum(r[colMap.ts]) : 0,
              ds: colMap.ds !== -1 ? cleanNum(r[colMap.ds]) : 0,
              ac: colMap.ac !== -1 ? cleanPct(r[colMap.ac]) : 0,
              to: colMap.to !== -1 ? cleanNum(r[colMap.to]) : 0,
              do: colMap.do !== -1 ? cleanNum(r[colMap.do]) : 0,
              ca: colMap.ca !== -1 ? cleanNum(r[colMap.ca]) : 0,
              cv: colMap.cv !== -1 ? cleanPct(r[colMap.cv]) : 0,
            });
          }

          setCompareRawCache(parsedList);
          setCompareAdsFile(file);
          setCompareStatusMsg(
            `✅ 下一期载入成功：解析出 ${parsedList.length} 个广告推广搜索词（已跳过 ${skippedTotals} 行汇总）`
          );
        } catch (err: any) {
          setCompareStatusMsg(`❌ 环比解析失败：${err.message}`);
        }
      },
      (err) => {
        setCompareStatusMsg(`❌ 对比时段文件读取失败：${err.message || err}`);
      }
    );
  };

  const generateCompareReport = () => {
    if (adsRows.length === 0) {
      setCompareStatusMsg('⚠️ 请先成功解析并激活属于当前时段的广告诊断');
      return;
    }
    const rawNext = compareRawCache;
    if (rawNext.length === 0) {
      setCompareStatusMsg('⚠️ 请先上传下一个时段对比的广告 CSV');
      return;
    }

    const totalOrdersNext = rawNext.reduce((sum, r) => sum + r.to, 0);
    const totalSpendNext = rawNext.reduce((sum, r) => sum + r.sp, 0);

    const nextProcessed = rawNext.map(r => ({
      kw: r.kw,
      fr: r.fr,
      im: r.im,
      cl: r.cl,
      ct: r.ct,
      cp: r.cp,
      sp: r.sp,
      ts: r.ts,
      ds: r.ds,
      ac: r.ac,
      to: r.to,
      do: r.do,
      ca: r.ca,
      cv: r.cv,
      aos: totalOrdersNext > 0 ? r.to / totalOrdersNext : 0,
      adSpendShare: totalSpendNext > 0 ? r.sp / totalSpendNext : 0
    }));

    const currentMap = new Map<string, AdsRow>();
    adsRows.forEach(item => currentMap.set(item.kw.toLowerCase(), item));

    const allKeys = new Set<string>();
    currentMap.forEach((_, k) => allKeys.add(k));
    nextProcessed.forEach(item => allKeys.add(item.kw.toLowerCase()));

    const compareList: AdsCompareRow[] = [];

    allKeys.forEach(key => {
      const cur = adsRows.find(r => r.kw.toLowerCase() === key) || {
        kw: key, fr: 0, im: 0, cl: 0, ct: 0, cp: 0, sp: 0, ts: 0, ds: 0, ac: 0, to: 0, do: 0, ca: 0, cv: 0, aos: 0, adSpendShare: 0
      };
      const nxt = nextProcessed.find(r => r.kw.toLowerCase() === key) || {
        kw: key, fr: 0, im: 0, cl: 0, ct: 0, cp: 0, sp: 0, ts: 0, ds: 0, ac: 0, to: 0, do: 0, ca: 0, cv: 0, aos: 0, adSpendShare: 0
      };

      const displayKw = adsRows.find(xr => xr.kw.toLowerCase() === key)?.kw || nextProcessed.find(xr => xr.kw.toLowerCase() === key)?.kw || key;

      const impChange = cur.im === 0 ? (nxt.im === 0 ? 0 : 1.0) : ((nxt.im - cur.im) / cur.im);
      const clChange = cur.cl === 0 ? (nxt.cl === 0 ? 0 : 1.0) : ((nxt.cl - cur.cl) / cur.cl);
      const spChange = cur.sp === 0 ? (nxt.sp === 0 ? 0 : 1.0) : ((nxt.sp - cur.sp) / cur.sp);
      const tsChange = cur.ts === 0 ? (nxt.ts === 0 ? 0 : 1.0) : ((nxt.ts - cur.ts) / cur.ts);
      const toChange = cur.to === 0 ? (nxt.to === 0 ? 0 : 1.0) : ((nxt.to - cur.to) / cur.to);

      const acChange = nxt.ac - cur.ac;
      const cvrChange = nxt.cv - cur.cv;
      const aosChange = nxt.aos - cur.aos;
      const adSpendShareChange = nxt.adSpendShare - cur.adSpendShare;

      compareList.push({
        kw: displayKw,
        imp_current: cur.im, imp_next: nxt.im, imp_change: impChange,
        cl_current: cur.cl, cl_next: nxt.cl, cl_change: clChange,
        sp_current: cur.sp, sp_next: nxt.sp, sp_change: spChange,
        ts_current: cur.ts, ts_next: nxt.ts, ts_change: tsChange,
        ac_current: cur.ac, ac_next: nxt.ac, ac_change: acChange,
        to_current: cur.to, to_next: nxt.to, to_change: toChange,
        cvr_current: cur.cv, cvr_next: nxt.cv, cvr_change: cvrChange,
        aos_current: cur.aos, aos_next: nxt.aos, aos_change: aosChange,
        adSpendShare_current: cur.adSpendShare, adSpendShare_next: nxt.adSpendShare, adSpendShare_change: adSpendShareChange,
        trend: getAdsTrendInterpretation(cur, nxt)
      });
    });

    setAdsCompareRows(compareList);
    setCompareLimit(100);
    setCompareStatusMsg('🔄 广告环比分析已经全部建立，异向趋势解读生成完成！');
  };

  const handleSort = (key: keyof AdsRow) => {
    setSortState(prev => {
      if (prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key, dir: 'desc' };
    });
    setLimit(100);
  };

  const handleCompareSort = (key: keyof AdsCompareRow) => {
    setCompareSort(prev => {
      if (prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key, dir: 'desc' };
    });
    setCompareLimit(100);
  };

  const processedList = useMemo(() => {
    let result = [...adsRows];
    if (searchQuery) {
      result = result.filter(r => r.kw.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (selectedTag) {
      result = result.filter(r => r.attrTag === selectedTag);
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
  }, [adsRows, searchQuery, selectedTag, sortState]);

  const adsTotals = useMemo(() => {
    if (processedList.length === 0) return null;
    const fr = processedList.reduce((acc, r) => acc + (r.fr || 0), 0) / processedList.length;
    const im = processedList.reduce((acc, r) => acc + (r.im || 0), 0);
    const cl = processedList.reduce((acc, r) => acc + (r.cl || 0), 0);
    const ct = im > 0 ? cl / im : 0;
    const sp = processedList.reduce((acc, r) => acc + (r.sp || 0), 0);
    const cp = cl > 0 ? sp / cl : 0;
    const adSpendShare = processedList.reduce((acc, r) => acc + (r.adSpendShare || 0), 0);
    const ts = processedList.reduce((acc, r) => acc + (r.ts || 0), 0);
    const ds = processedList.reduce((acc, r) => acc + (r.ds || 0), 0);
    const ac = ts > 0 ? sp / ts : 0;
    const to = processedList.reduce((acc, r) => acc + (r.to || 0), 0);
    const doVal = processedList.reduce((acc, r) => acc + (r.do || 0), 0);
    const totalOrders = to + doVal;
    const aos = totalOrders > 0 ? to / totalOrders : 0;
    const ca = to > 0 ? sp / to : 0;
    const cv = cl > 0 ? to / cl : 0;

    return {
      fr, im, cl, ct, cp, sp, adSpendShare, ts, ds, ac, to, do: doVal, aos, ca, cv
    };
  }, [processedList]);

  const processedCompareList = useMemo(() => {
    let result = [...adsCompareRows];
    if (searchQuery) {
      result = result.filter(r => r.kw.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (compareSort.key) {
      const { key, dir } = compareSort;
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
  }, [adsCompareRows, searchQuery, compareSort]);

  const compareTotals = useMemo(() => {
    if (processedCompareList.length === 0) return null;

    const imp_current = processedCompareList.reduce((acc, r) => acc + r.imp_current, 0);
    const imp_next = processedCompareList.reduce((acc, r) => acc + r.imp_next, 0);
    const imp_change = imp_current > 0 ? (imp_next - imp_current) / imp_current : 0;

    const cl_current = processedCompareList.reduce((acc, r) => acc + r.cl_current, 0);
    const cl_next = processedCompareList.reduce((acc, r) => acc + r.cl_next, 0);
    const cl_change = cl_current > 0 ? (cl_next - cl_current) / cl_current : 0;

    const sp_current = processedCompareList.reduce((acc, r) => acc + r.sp_current, 0);
    const sp_next = processedCompareList.reduce((acc, r) => acc + r.sp_next, 0);
    const sp_change = sp_current > 0 ? (sp_next - sp_current) / sp_current : 0;

    const ts_current = processedCompareList.reduce((acc, r) => acc + r.ts_current, 0);
    const ts_next = processedCompareList.reduce((acc, r) => acc + r.ts_next, 0);
    const ts_change = ts_current > 0 ? (ts_next - ts_current) / ts_current : 0;

    const ac_current = ts_current > 0 ? sp_current / ts_current : 0;
    const ac_next = ts_next > 0 ? sp_next / ts_next : 0;
    const ac_change = ac_next - ac_current;

    const to_current = processedCompareList.reduce((acc, r) => acc + r.to_current, 0);
    const to_next = processedCompareList.reduce((acc, r) => acc + r.to_next, 0);
    const to_change = to_current > 0 ? (to_next - to_current) / to_current : 0;

    const cvr_current = cl_current > 0 ? to_current / cl_current : 0;
    const cvr_next = cl_next > 0 ? to_next / cl_next : 0;
    const cvr_change = cvr_next - cvr_current;

    const aos_current = processedCompareList.reduce((acc, r) => acc + r.aos_current, 0);
    const aos_next = processedCompareList.reduce((acc, r) => acc + r.aos_next, 0);
    const aos_change = aos_next - aos_current;

    const adSpendShare_current = processedCompareList.reduce((acc, r) => acc + r.adSpendShare_current, 0);
    const adSpendShare_next = processedCompareList.reduce((acc, r) => acc + r.adSpendShare_next, 0);
    const adSpendShare_change = adSpendShare_next - adSpendShare_current;

    return {
      imp_current, imp_next, imp_change,
      cl_current, cl_next, cl_change,
      sp_current, sp_next, sp_change,
      ts_current, ts_next, ts_change,
      ac_current, ac_next, ac_change,
      to_current, to_next, to_change,
      cvr_current, cvr_next, cvr_change,
      aos_current, aos_next, aos_change,
      adSpendShare_current, adSpendShare_next, adSpendShare_change
    };
  }, [processedCompareList]);

  const renderTrendChange = (current: number, changeVal: number, inverse: boolean = false) => {
    if (current === 0) return <span className="text-slate-400 font-mono">—</span>;
    const isUp = changeVal > 0;
    const isZero = changeVal === 0;
    const displayNum = Math.abs(changeVal * 100).toFixed(1) + '%';
    const goodColor = inverse ? 'text-red-500 font-semibold' : 'text-emerald-600 font-semibold';
    const badColor = inverse ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold';
    return (
      <span className={`inline-flex items-center gap-0.5 font-mono text-[10.5px] ${isUp ? goodColor : isZero ? 'text-slate-500' : badColor}`}>
        {isUp ? '▲' : isZero ? '●' : '▼'} {displayNum}
      </span>
    );
  };

  const renderPointChange = (changeVal: number, inverse: boolean = false) => {
    const isUp = changeVal > 0;
    const isZero = changeVal === 0;
    const displayNum = Math.abs(changeVal * 100).toFixed(2) + 'pp';
    const goodColor = inverse ? 'text-red-500 font-semibold' : 'text-emerald-600 font-semibold';
    const badColor = inverse ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold';
    return (
      <span className={`inline-flex items-center gap-0.5 font-mono text-[10.5px] ${isUp ? goodColor : isZero ? 'text-slate-500' : badColor}`}>
        {isUp ? '▲' : isZero ? '●' : '▼'} {displayNum}
      </span>
    );
  };

  const exportCompareXlsx = () => {
    if (adsCompareRows.length === 0) return;
    const wb = XLSX.utils.book_new();
    const headers = [
      '搜索词', '曝光(当前)', '曝光(下一个)', '曝光环比', '点击(当前)', '点击(下一个)', '点击环比',
      '花费(当前)', '花费(下一个)', '花费环比', '销售额(当前)', '销售额(下一个)', '销售额环比',
      'ACoS(当前)', 'ACoS(下一个)', 'ACoS环比绝对值', '订单量(当前)', '订单量(下一个)', '订单环比',
      '广告CVR(当前)', '广告CVR(下一个)', '广告CVR环比差(pp)', '广告订单占比(当前)', '广告订单占比(下一个)', '订单占比环比绝对差(pp)',
      '广告花费占比(当前)', '广告花费占比(下一个)', '花费占比绝对差(pp)', '趋势异动诊断'
    ];
    const rows = adsCompareRows.map(r => [
      r.kw, r.imp_current, r.imp_next, (r.imp_change * 100).toFixed(1) + '%',
      r.cl_current, r.cl_next, (r.cl_change * 100).toFixed(1) + '%',
      r.sp_current, r.sp_next, (r.sp_change * 100).toFixed(1) + '%',
      r.ts_current, r.ts_next, (r.ts_change * 100).toFixed(1) + '%',
      (r.ac_current * 100).toFixed(1) + '%', (r.ac_next * 100).toFixed(1) + '%', (r.ac_change * 100).toFixed(1) + '%',
      r.to_current, r.to_next, (r.to_change * 100).toFixed(1) + '%',
      (r.cvr_current * 100).toFixed(2) + '%', (r.cvr_next * 100).toFixed(2) + '%', (r.cvr_change * 100).toFixed(2) + 'pp',
      (r.aos_current * 100).toFixed(1) + '%', (r.aos_next * 100).toFixed(1) + '%', (r.aos_change * 100).toFixed(1) + 'pp',
      (r.adSpendShare_current * 100).toFixed(1) + '%', (r.adSpendShare_next * 100).toFixed(1) + '%', (r.adSpendShare_change * 100).toFixed(1) + 'pp',
      r.trend
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, '广告搜索词环比诊断');
    XLSX.writeFile(wb, `广告词_WoW_环比对比报告_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleDownloadTemplate = () => {
    const headers = [
      '用户搜索词',
      '用户搜索词词频',
      '展现量',
      '点击量',
      '点击率(ctr)',
      '平均每次点击费用(cpc)',
      '花费',
      '7天总销售额(sales)',
      '7天广告商品销售额(sales)',
      '7天广告成本销售比(acos)',
      '7天总订单量',
      '7天广告商品单位数',
      '7天转化率'
    ];

    const sampleData = [
      [
        'custom protective glass iphone 15 pro',
        '15',
        '8500',
        '185',
        '2.18%',
        '1.12',
        '207.20',
        '1890.00',
        '1250.00',
        '10.96%',
        '63',
        '41',
        '34.05%'
      ],
      [
        'leather phone cases protective standard',
        '42',
        '12400',
        '248',
        '2.00%',
        '0.95',
        '235.60',
        '1450.00',
        '920.00',
        '16.25%',
        '48',
        '30',
        '19.35%'
      ],
      [
        'magnetic card pack holder back accessory',
        '8',
        '5000',
        '65',
        '1.30%',
        '1.30',
        '84.50',
        '420.00',
        '180.00',
        '20.12%',
        '14',
        '6',
        '21.54%'
      ],
      [
        'cheap charging cable pack bulk combo',
        '19',
        '25000',
        '380',
        '1.52%',
        '0.45',
        '171.00',
        '180.00',
        '0.00',
        '95.00%',
        '18',
        '0',
        '4.74%'
      ],
      [
        'ultra strong magnetic connector ring',
        '3',
        '3400',
        '41',
        '1.21%',
        '0.80',
        '32.80',
        '0.00',
        '0.00',
        '0.00%',
        '0',
        '0',
        '0.00%'
      ]
    ];

    const wsData = [headers, ...sampleData];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = [
      { wch: 38 }, // 用户搜索词
      { wch: 15 }, // 用户搜索词词频
      { wch: 10 }, // 展现量
      { wch: 10 }, // 点击量
      { wch: 12 }, // 点击率
      { wch: 22 }, // 平均CPC
      { wch: 10 }, // 花费
      { wch: 20 }, // 7天总销售额
      { wch: 24 }, // 直接销售额
      { wch: 24 }, // ACoS
      { wch: 12 }, // 7天总订单量
      { wch: 20 }, // 直接订单量
      { wch: 12 }  // CVR
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'SP广告搜索词参考模板');
    XLSX.writeFile(wb, '亚马逊SP广告词报告_标准上传模版.xlsx');
  };

  const exportCurrentXlsx = () => {
    if (adsRows.length === 0) return;
    const wb = XLSX.utils.book_new();
    const headers = [
      '用户搜索词', '词频数', '展现量', '点击数', 'CTR 点击率', '平均 CPC', '广告花费 ($)', 
      '花费占比', '销售额 ($)', '直接销售额 ($)', 'ACoS (%)', '广告订单', '直接转化订单', 
      '订单产出占比', 'CPA 获客单价', '广告 CVR', '归因转化标签', '系统推荐诊断策略建议'
    ];
    const rows = adsRows.map(r => [
      r.kw, r.fr, r.im, r.cl, (r.ct * 100).toFixed(2) + '%', r.cp.toFixed(2), r.sp.toFixed(2),
      (r.adSpendShare * 100).toFixed(2) + '%', r.ts.toFixed(2), r.ds.toFixed(2), (r.ac * 100).toFixed(2) + '%',
      r.to, r.do, (r.aos * 100).toFixed(2) + '%', r.ca.toFixed(2), (r.cv * 100).toFixed(2) + '%',
      r.attrTag, r.t
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, '广告搜索词策略诊断');
    XLSX.writeFile(wb, `广告词_分级分类策略报表_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Dual Upload Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 bg-white rounded-xl shadow-xs border border-slate-200 p-6">
        {/* Upload Current Period */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                本期广告搜索词报告 (Current period)
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                分析广告词消耗分拨，诊断素材漏斗。上传前缀通常为 SP Search Term Report 的标准 CSV 报表。
              </p>
            </div>
            <button 
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/50 hover:border-blue-300 transition-all cursor-pointer shadow-3xs shrink-0 h-fit"
              title="点击下载标准亚马逊SP广告搜索词报告示例Excel模板，可作为填充参考"
            >
              <Download className="w-3.5 h-3.5 text-blue-500" />
              下载标准上传模板
            </button>
          </div>
          
          <label className="group flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-lg p-5 cursor-pointer bg-slate-50/50 hover:bg-indigo-50/20 hover:border-indigo-400 transition-all">
            <Megaphone className="w-8 h-8 text-slate-400 group-hover:text-indigo-500 transition-colors mb-2" />
            <span className="text-xs font-semibold text-slate-600 group-hover:text-indigo-600 transition-colors text-center">
              {adsFile ? adsFile.name : '点击或拖曳上传本期销售词 Excel(XLS/XLSX) 或 CSV 报告'}
            </span>
            <input 
              type="file" 
              accept=".csv,.txt,.xls,.xlsx" 
              className="hidden" 
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) handleParseAds(e.target.files[0]);
              }} 
            />
          </label>
          <p className="text-[11px] font-mono text-slate-550 break-all">
            {statusMsg || '等待加载您的本期广告推广搜索词报告，支持后台直接导出的全部标准字段。'}
          </p>
        </div>

        {/* Upload WoW period */}
        <div className="space-y-3 border-t lg:border-t-0 lg:border-l border-slate-100 lg:pl-6 pt-6 lg:pt-0 flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5 font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              环比对比广告报告 (Next period, 可选)
            </h3>
            <p className="text-xs text-slate-500">
              上传下一个时段的广告搜索词报告，与本期数据自动做词汇级别对碰，生成异动解释。
            </p>
            
            <label className="group flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-lg p-5 cursor-pointer bg-slate-50/50 hover:bg-amber-50/20 hover:border-amber-400 transition-all">
              <FileText className="w-8 h-8 text-slate-400 group-hover:text-amber-500 transition-colors mb-2" />
              <span className="text-xs font-semibold text-slate-600 group-hover:text-amber-600 transition-colors text-center">
                {compareAdsFile ? compareAdsFile.name : '点击或拖曳上传对比时段（后期）广告 Excel(XLS/XLSX) 或 CSV 报告'}
              </span>
              <input 
                type="file" 
                accept=".csv,.txt,.xls,.xlsx" 
                className="hidden" 
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) handleParseCompareAds(e.target.files[0]);
                }} 
              />
            </label>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-slate-100/50">
            <span className="text-[10.5px] font-mono text-slate-500 truncate max-w-xs">
              {compareStatusMsg || '等待上传后期对比报告。'}
            </span>
            <button
              onClick={generateCompareReport}
              disabled={adsRows.length === 0 || !compareAdsFile}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs flex items-center justify-center gap-1 transition-all ${
                adsRows.length > 0 && compareAdsFile 
                  ? 'bg-amber-500 hover:bg-amber-600 text-white cursor-pointer' 
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" /> 运行广告环比诊断
            </button>
          </div>
        </div>
      </div>

      {/* Configurations sliders */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-indigo-500" /> 推广微操灵敏度与漏斗参数预置
            </h4>
            <p className="text-[10px] text-slate-500">
              {isManualThreshold 
                ? '⚠️ 当前已启用自定义 CTR / CVR 滑动诊断阈值，指标独立运作' 
                : '✨ 诊断线已开启智能关联映射（随目标 ACoS, CPA, 毛利率变化自动对齐类目转化特征）'}
            </p>
          </div>
          <button
            onClick={() => setShowLogicInfo(!showLogicInfo)}
            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100/80 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            {showLogicInfo ? '隐藏底层分析决策逻辑' : '查看 🧠 漏斗微操决策逻辑看板'}
          </button>
        </div>

        {showLogicInfo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden border-b border-slate-100 pb-3"
          >
            <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-200/50 space-y-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                  系统漏斗微操与预算动作决策链路（向上熔断 & 漏斗级联架构）
                </span>
                <span className="text-[11px] text-slate-500 leading-relaxed">
                  系统在获取到单条广告词条时，会基于精细化跨境电商流量漏斗学说进行<strong>顺次检验与级别熔断</strong>。哪个关键漏斗率先处于非正常溢出状态，即立即产出该截面的微操建议与预算修正动作：
                </span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Rule 1 */}
                <div className="bg-white p-3.5 rounded-lg border border-slate-100 hover:border-indigo-300 transition-all shadow-xs flex flex-col justify-between space-y-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="px-1.5 py-0.5 text-[9.5px] bg-amber-50 text-amber-700 font-extrabold rounded border border-amber-200">1. 最前置漏斗</span>
                      <span className="text-[9.5px] text-indigo-500 font-mono font-bold">优先级: TOP 1</span>
                    </div>
                    <p className="text-xs font-bold text-slate-800 pt-1">👁️ CTR 点击率疲软</p>
                    <p className="text-[10.5px] text-indigo-950 font-mono font-semibold bg-indigo-50/50 px-1 py-0.5 rounded mt-1">
                      漏斗诊断线: &lt; {targetCtr.toFixed(1)}% (曝光&gt;50)
                    </p>
                    <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
                      <strong>分析逻辑:</strong> 基于目标 CPA ${targetCpa} 与 ACoS ${targetAcos}% 推算或手动设定的期望点击率。若实际点击率不足此值，说明视觉首图与人群不对齐。
                    </p>
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-[10.5px] font-semibold text-amber-800">🛠️ 微操与预算修正:</span>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                      优化首图或主图材质、优化标题前置词、增加 Coupon 专属绿色标签或执行小幅下压曝光竞价。
                    </p>
                  </div>
                </div>

                {/* Rule 2 */}
                <div className="bg-white p-3.5 rounded-lg border border-slate-101 hover:border-indigo-300 transition-all shadow-xs flex flex-col justify-between space-y-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="px-1.5 py-0.5 text-[9.5px] bg-red-50 text-red-700 font-extrabold rounded border border-red-200">2. 自主转化承接</span>
                      <span className="text-[9.5px] text-slate-400 font-mono font-bold">优先级: TOP 2</span>
                    </div>
                    <p className="text-xs font-bold text-slate-850 pt-1">🛒 广告 CVR 剧烈不振</p>
                    <p className="text-[10.5px] text-indigo-950 font-mono font-semibold bg-red-50/40 px-1 py-0.5 rounded mt-1">
                      漏斗诊断线: &lt; {targetCvr.toFixed(1)}% (点击&gt;15)
                    </p>
                    <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
                      <strong>分析逻辑:</strong> 毛利率仅有 {margin}% 且获客指导价限制在 ${targetCpa}。要达成保本及盈利转化下线，此 CVR 为熔断红线。低于它会快速造成溢价失血。
                    </p>
                  </div>
                  <div className="pt-2 border-t border-slate-101">
                    <span className="text-[10.5px] font-semibold text-red-800">🛠️ 微操与预算修正:</span>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                      极速派发限时大额 Coupon 锁单。排查详情页负面 Feedback、排查 Q&A 以及 A+ 卖点说服力。
                    </p>
                  </div>
                </div>

                {/* Rule 3 */}
                <div className="bg-white p-3.5 rounded-lg border border-slate-101 hover:border-indigo-300 transition-all shadow-xs flex flex-col justify-between space-y-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="px-1.5 py-0.5 text-[9.5px] bg-red-50 text-red-700 font-extrabold rounded border border-red-200">3. 宏观投产效率</span>
                      <span className="text-[9.5px] text-slate-400 font-mono font-bold">优先级: TOP 3</span>
                    </div>
                    <p className="text-xs font-bold text-slate-800 pt-1">💰 ACoS 吞噬利润</p>
                    <p className="text-[10.5px] text-indigo-950 font-mono font-semibold bg-slate-50 px-1 py-0.5 rounded mt-1">
                      漏斗诊断线: &gt; {(targetAcos * 1.3).toFixed(1)}%
                    </p>
                    <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
                      <strong>分析逻辑:</strong> 严重背离设定的目标 ACoS ${targetAcos}%（溢出幅度超 30%）。在低效广泛匹配流量下最易触发。
                    </p>
                  </div>
                  <div className="pt-2 border-t border-slate-101">
                    <span className="text-[10.5px] font-semibold text-red-800">🛠️ 微操与预算修正:</span>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                      将对应转化差的检索词精准否定，或对对应广告组的默认 Bid 顺次梯级压低 10%-20%。
                    </p>
                  </div>
                </div>

                {/* Rule 4 */}
                <div className="bg-white p-3.5 rounded-lg border border-slate-101 hover:border-indigo-300 transition-all shadow-xs flex flex-col justify-between space-y-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="px-1.5 py-0.5 text-[9.5px] bg-amber-50 text-amber-700 font-extrabold rounded border border-amber-200">4. 单元获客价位</span>
                      <span className="text-[9.5px] text-slate-400 font-mono font-bold">优先级: TOP 4</span>
                    </div>
                    <p className="text-xs font-bold text-slate-800 pt-1">📉 CPA 偏高溢损</p>
                    <p className="text-[10.5px] text-indigo-950 font-mono font-semibold bg-slate-50 px-1 py-0.5 rounded mt-1">
                      漏斗诊断线: &gt; ${(targetCpa * 1.5).toFixed(2)}
                    </p>
                    <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
                      <strong>分析逻辑:</strong> 实际每单获取成本已超出预期 CPA (上限 ${targetCpa * 1.5})。常在同行争抢红海大词的高溢价 Bid 竞合期造成。
                    </p>
                  </div>
                  <div className="pt-2 border-t border-slate-101">
                    <span className="text-[10.5px] font-semibold text-amber-800">🛠️ 微操与预算修正:</span>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                      适度收窄首屏（Top of Search）广告位不健康的百分比溢价额度，采用平摊防御出价策略。
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Rule 5 */}
                <div className="bg-white p-3.5 rounded-lg border border-slate-101 hover:border-indigo-300 transition-all shadow-xs flex flex-col justify-between space-y-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="px-1.5 py-0.5 text-[9.5px] bg-purple-50 text-purple-700 font-extrabold rounded border border-purple-200">5. 溢位非闭环转化</span>
                      <span className="text-[9.5px] text-slate-400 font-mono font-bold">优先级: TOP 5</span>
                    </div>
                    <p className="text-xs font-bold text-slate-850 pt-1">🔗 泛跳转/矩阵溢出</p>
                    <p className="text-[10.5px] text-indigo-950 font-mono font-semibold bg-slate-50 px-1 py-0.5 rounded mt-1">
                      漏斗诊断线: 直接成单比 &lt; 30% 且订单&gt;5
                    </p>
                    <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
                      <strong>分析逻辑:</strong> 用户点击本款进入，却跨行购买了店铺内的同店其他关联 listing。证明此词蕴藏着广泛的全店品牌关联引流效应。
                    </p>
                  </div>
                  <div className="pt-2 border-t border-slate-101">
                    <span className="text-[10.5px] font-semibold text-purple-800">🛠️ 微操与预算修正:</span>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                      保全此词稳态预算，将用户点击引向更有商品货架承接性的品牌旗舰店。
                    </p>
                  </div>
                </div>

                {/* Rule 6 */}
                <div className="bg-white p-3.5 rounded-lg border border-slate-101 hover:border-indigo-300 transition-all shadow-xs flex flex-col justify-between space-y-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="px-1.5 py-0.5 text-[9.5px] bg-emerald-50 text-emerald-700 font-extrabold rounded border border-emerald-200">6. 高效利润资产</span>
                      <span className="text-[9.5px] text-slate-400 font-mono font-bold">优先级: GOLD 🎯</span>
                    </div>
                    <p className="text-xs font-bold text-slate-850 pt-1">🏆 广告黄金明星词</p>
                    <p className="text-[10.5px] text-indigo-950 font-mono font-semibold bg-slate-50 px-1 py-0.5 rounded mt-1">
                      漏斗诊断线: ACoS &le; {(targetAcos * 0.8).toFixed(1)}% 且 CVR &ge; 5.0%
                    </p>
                    <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
                      <strong>分析逻辑:</strong> ACoS 在优等线（目标${targetAcos}% 折扣线）以内，转化率高亢（均值&ge;5%）。极优良健康的销售权重大本营。
                    </p>
                  </div>
                  <div className="pt-2 border-t border-slate-101">
                    <span className="text-[10.5px] font-semibold text-emerald-800">🛠️ 微操与预算修正:</span>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                      黄金主力资产。绝不可出现日内广告预算断流。应当提溢 10%-15% 出价，强力压实优势广告展位。
                    </p>
                  </div>
                </div>

                {/* Rule 7 */}
                <div className="bg-white p-3.5 rounded-lg border border-slate-101 hover:border-indigo-300 transition-all shadow-xs flex flex-col justify-between space-y-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="px-1.5 py-0.5 text-[9.5px] bg-slate-50 text-slate-700 font-extrabold rounded border border-slate-200">7. 常规稳态留空</span>
                      <span className="text-[9.5px] text-slate-400 font-mono font-bold">优先级: BASE</span>
                    </div>
                    <p className="text-xs font-bold text-slate-850 pt-1">✅ 指标平衡正常词</p>
                    <p className="text-[10.5px] text-indigo-950 font-mono font-semibold bg-slate-50 px-1 py-0.5 rounded mt-1">
                      漏斗诊断线: ACoS 与 CVR 在动态线正常浮动
                    </p>
                    <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
                      <strong>分析逻辑:</strong> 目前指标整体跟随设置的目标获客水平运转平稳，未溢出异常。属于平稳引流阶梯的一部分。
                    </p>
                  </div>
                  <div className="pt-2 border-t border-slate-101">
                    <span className="text-[10.5px] font-semibold text-slate-800">🛠️ 微操与预算修正:</span>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                      维持既定投放策略，不做出价浮动干扰。常规观察 SQP 品牌渗透词环比趋势即可。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Target ACoS (%) */}
          <div className="space-y-1.5 p-3.5 bg-slate-50/50 rounded-lg border border-slate-100 flex flex-col justify-between">
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1">🎯 目标 ACoS:</span>
                <span className="font-mono text-indigo-600 font-bold">{targetAcos}%</span>
              </div>
              <input 
                type="range" 
                min="5" 
                max="80" 
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500 my-2.5" 
                value={targetAcos}
                onChange={(e) => setTargetAcos(parseInt(e.target.value))}
              />
            </div>
            <p className="text-[10px] text-slate-400">高于该数值 1.3 倍的搜索词将被标记为消耗超标。</p>
          </div>

          {/* Target CPA ($) */}
          <div className="space-y-1.5 p-3.5 bg-slate-50/50 rounded-lg border border-slate-100 flex flex-col justify-between">
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1">💰 目标 CPA 上限:</span>
                <span className="font-mono text-indigo-600 font-bold">${targetCpa.toFixed(1)}</span>
              </div>
              <input 
                type="range" 
                min="2" 
                max="30" 
                step="0.5"
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500 my-2.5" 
                value={targetCpa}
                onChange={(e) => setTargetCpa(parseFloat(e.target.value))}
              />
            </div>
            <p className="text-[10px] text-slate-400">单均获客成本控制线。超标 1.5 倍将提示 CPA 溢价。</p>
          </div>

          {/* Margin (%) */}
          <div className="space-y-1.5 p-3.5 bg-slate-50/50 rounded-lg border border-slate-100 flex flex-col justify-between">
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1">📉 预估毛利率:</span>
                <span className="font-mono text-indigo-600 font-bold">{margin}%</span>
              </div>
              <input 
                type="range" 
                min="10" 
                max="75" 
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500 my-2.5" 
                value={margin}
                onChange={(e) => setMargin(parseInt(e.target.value))}
              />
            </div>
            <p className="text-[10px] text-slate-400">核算广告词 ACoS 是否侵蚀毛利润的数据基础。</p>
          </div>

          {/* Target CTR (%) */}
          <div className="space-y-1.5 p-3.5 bg-indigo-50/25 rounded-lg border border-indigo-100/50 flex flex-col justify-between relative">
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1">👁️ CTR 点击率诊断线:</span>
                <span className="font-mono text-indigo-700 font-bold">{targetCtr.toFixed(1)}%</span>
              </div>
              <input 
                type="range" 
                min="0.1" 
                max="10.0" 
                step="0.1"
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 my-2.5" 
                value={targetCtr}
                onChange={(e) => {
                  setIsManualThreshold(true);
                  setTargetCtr(parseFloat(e.target.value));
                }}
              />
            </div>
            <div className="flex justify-between items-center text-[9px] pt-1">
              <span className="text-slate-400">曝光点击弱警戒线。</span>
              {!isManualThreshold ? (
                <span className="text-[9.5px] text-emerald-600 font-bold px-1 py-0.5 bg-emerald-50 rounded border border-emerald-100/60 leading-none">类目智算中</span>
              ) : (
                <button 
                  onClick={() => setIsManualThreshold(false)}
                  className="text-xs text-indigo-600 font-bold hover:text-indigo-800 hover:underline cursor-pointer flex items-center gap-0.5 bg-white px-1.5 py-0.5 rounded border border-slate-200/60 shadow-3xs"
                  title="重新接入并挂钩毛利和ACOS算法的智能测值"
                >
                  ↩ 恢复智算
                </button>
              )}
            </div>
          </div>

          {/* Target CVR (%) */}
          <div className="space-y-1.5 p-3.5 bg-indigo-50/25 rounded-lg border border-indigo-100/50 flex flex-col justify-between relative">
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1">🛒 CVR 转化率诊断线:</span>
                <span className="font-mono text-indigo-700 font-bold">{targetCvr.toFixed(1)}%</span>
              </div>
              <input 
                type="range" 
                min="0.5" 
                max="30.0" 
                step="0.1"
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 my-2.5" 
                value={targetCvr}
                onChange={(e) => {
                  setIsManualThreshold(true);
                  setTargetCvr(parseFloat(e.target.value));
                }}
              />
            </div>
            <div className="flex justify-between items-center text-[9px] pt-1">
              <span className="text-slate-400">进店落地下单警戒线。</span>
              {!isManualThreshold ? (
                <span className="text-[9.5px] text-emerald-600 font-bold px-1 py-0.5 bg-emerald-50 rounded border border-emerald-100/60 leading-none font-sans">类目智算中</span>
              ) : (
                <button 
                  onClick={() => setIsManualThreshold(false)}
                  className="text-xs text-indigo-600 font-bold hover:text-indigo-800 hover:underline cursor-pointer flex items-center gap-0.5 bg-white px-1.5 py-0.5 rounded border border-slate-200/60 shadow-3xs"
                  title="重新接入并挂钩毛利和ACOS算法的智能测值"
                >
                  ↩ 恢复智算
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {adsRows.length > 0 && (
        <React.Fragment>
          {/* Diagnostic Metrics Widgets */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
                <Megaphone className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">广告搜索词总和</p>
                <div className="text-lg font-bold text-slate-800 font-mono flex items-baseline gap-0.5">
                  {adsRows.length} <span className="text-xs font-normal text-slate-500">组</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">广告投入总计</p>
                <p className="text-lg font-bold text-slate-800 font-mono">${stats.totalSpend.toFixed(0)}</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">广告销售成交额</p>
                <p className="text-lg font-bold text-slate-800 font-mono">${stats.totalSales.toFixed(0)}</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-lg">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">综合 ACoS 占比</p>
                <p className="text-lg font-bold text-slate-800 font-mono">{(stats.avgAcos * 100).toFixed(1)}%</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-purple-50 text-purple-600 rounded-lg">
                <Percent className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">ACoS 达标词</p>
                <div className="text-lg font-bold text-slate-800 font-mono flex items-baseline gap-0.5">
                  {stats.healthyProfitWords} <span className="text-xs font-normal text-slate-500">组</span>
                </div>
              </div>
            </div>
          </div>

          {/* Primary detailed diagnostics table */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">本期广告搜索词策略漏斗表</h4>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="秒级筛选推广词..."
                    className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs w-52 focus:outline-none focus:border-indigo-500 text-slate-700"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <button
                onClick={exportCurrentXlsx}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 text-xs text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-1.5 transition-all cursor-pointer font-semibold"
              >
                <Download className="w-3.5 h-3.5" /> 导出本期归类策略 Excel
              </button>
            </div>

            {/* Quick chips filter */}
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-wider mr-2">
                归因大分类:
              </span>
              <button
                onClick={() => setSelectedTag(null)}
                className={`py-1 px-3 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  selectedTag === null ? 'bg-indigo-950 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                全部广告词 ({adsRows.length})
              </button>
              {['🎯 爆款推类型', '🔄 混合转化型', '🔗 矩阵引流型'].map(tag => {
                const count = adsRows.filter(r => r.attrTag === tag).length;
                return (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(tag)}
                    className={`py-1 px-3 rounded-full text-xs font-medium transition-all cursor-pointer ${
                      selectedTag === tag ? 'bg-indigo-950 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    {tag} ({count})
                  </button>
                );
              })}
            </div>

            {/* Main diagnostic table table */}
            <div className="table-wrapper max-h-[440px] custom-scrollbar border border-slate-200 rounded-lg overflow-auto">
              <table className="relative w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 text-[10px] font-semibold sticky top-0 z-20 shadow-xs">
                    <th 
                      className="text-left font-bold uppercase tracking-wider py-1.5 px-2 sticky left-0 bg-slate-50/90 z-30 flex items-center justify-between border-r border-slate-200"
                      style={{ width: `${firstColWidth}px`, minWidth: `${firstColWidth}px` }}
                    >
                      <span className="cursor-pointer select-none" onClick={() => handleSort('kw')}>
                        用户搜索词 {sortState.key === 'kw' ? (sortState.dir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                      <div 
                        className="w-1.5 h-6 bg-transparent hover:bg-indigo-400 active:bg-indigo-600 cursor-col-resize self-stretch select-none"
                        onMouseDown={handleStartResize}
                      />
                    </th>
                    <th className="text-center font-bold py-1.5 px-2 cursor-pointer select-none border-b border-slate-200 whitespace-nowrap" onClick={() => handleSort('fr')}>词频</th>
                    <th className="text-right font-bold py-1.5 px-2 cursor-pointer select-none border-b border-slate-200 whitespace-nowrap" onClick={() => handleSort('im')}>展现量</th>
                    <th className="text-right font-bold py-1.5 px-2 cursor-pointer select-none border-b border-slate-200 whitespace-nowrap" onClick={() => handleSort('cl')}>点击数</th>
                    <th className="text-center font-bold py-1.5 px-2 cursor-pointer select-none border-b border-slate-200 whitespace-nowrap" onClick={() => handleSort('ct')}>点击率 CTR</th>
                    <th className="text-right font-bold py-1.5 px-2 cursor-pointer select-none border-b border-slate-200 whitespace-nowrap" onClick={() => handleSort('cp')}>平均 CPC</th>
                    <th className="text-right font-bold py-1.5 px-2 cursor-pointer select-none border-b border-slate-200 whitespace-nowrap" onClick={() => handleSort('sp')}>花费</th>
                    <th className="text-center font-bold py-1.5 px-2 cursor-pointer select-none border-b border-slate-200 whitespace-nowrap" onClick={() => handleSort('adSpendShare')}>预算占比</th>
                    <th className="text-right font-bold py-1.5 px-2 cursor-pointer select-none border-b border-slate-200 whitespace-nowrap" onClick={() => handleSort('ts')}>广告销售</th>
                    <th className="text-right font-bold py-1.5 px-2 cursor-pointer select-none border-b border-slate-200 whitespace-nowrap" onClick={() => handleSort('ds')}>直接销售</th>
                    <th className="text-center font-bold py-1.5 px-2 cursor-pointer select-none border-b border-slate-200 whitespace-nowrap" onClick={() => handleSort('ac')}>ACoS</th>
                    <th className="text-right font-bold py-1.5 px-2 cursor-pointer select-none border-b border-slate-200 whitespace-nowrap" onClick={() => handleSort('to')}>广告单量</th>
                    <th className="text-right font-bold py-1.5 px-2 cursor-pointer select-none border-b border-slate-200 whitespace-nowrap" onClick={() => handleSort('do')}>直接单量</th>
                    <th className="text-center font-bold py-1.5 px-2 cursor-pointer select-none border-b border-slate-200 whitespace-nowrap" onClick={() => handleSort('aos')}>广告订单比</th>
                    <th className="text-right font-bold py-1.5 px-2 cursor-pointer select-none border-b border-slate-200 whitespace-nowrap" onClick={() => handleSort('ca')}>CPA 获客价</th>
                    <th className="text-center font-bold py-1.5 px-2 cursor-pointer select-none border-b border-slate-200 whitespace-nowrap" onClick={() => handleSort('cv')}>广告 CVR</th>
                    <th className="text-center font-bold py-1.5 px-2.5 border-b border-slate-200 whitespace-nowrap">直接转化归因</th>
                    <th className="text-left font-bold py-1.5 px-3 min-w-[280px] border-b border-slate-200 whitespace-nowrap">系统漏斗微操与预算动作建议</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {processedList.slice(0, limit).map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/65 transition-colors">
                      <td 
                        className="py-1 px-2 sticky left-0 bg-white font-semibold border-r border-slate-100 text-slate-800 truncate"
                        style={{ width: `${firstColWidth}px`, minWidth: `${firstColWidth}px`, maxWidth: `${firstColWidth}px` }}
                        title={r.kw}
                      >
                        {r.kw}
                      </td>
                      <td className="py-1 px-2 text-center font-mono text-[11px] text-slate-550">{r.fr}</td>
                      <td className="py-1 px-2 text-right font-mono text-[11px]">{r.im.toLocaleString()}</td>
                      <td className="py-1 px-2 text-right font-mono text-[11px] font-semibold">{r.cl.toLocaleString()}</td>
                      <td className={`py-1 px-2 text-center font-mono text-[11px] font-semibold ${r.ct >= 0.03 ? 'text-emerald-600' : r.ct < 0.015 ? 'text-red-500' : 'text-slate-600'}`}>
                        {(r.ct * 100).toFixed(2)}%
                      </td>
                      <td className="py-1 px-2 text-right font-mono text-[11px] text-slate-500">${r.cp.toFixed(2)}</td>
                      <td className="py-1 px-2 text-right font-mono text-[11px] font-semibold text-slate-800">${r.sp.toFixed(2)}</td>
                      <td className="py-1 px-2 text-center font-mono text-[11px] text-slate-500">{(r.adSpendShare * 100).toFixed(1)}%</td>
                      <td className="py-1 px-2 text-right font-mono text-[11px] text-slate-800">${r.ts.toFixed(1)}</td>
                      <td className="py-1 px-2 text-right font-mono text-[11px] text-slate-500">${r.ds.toFixed(1)}</td>
                      <td className={`py-1 px-2 text-center font-mono text-[11px] font-semibold ${r.ac <= targetAcos / 100 ? 'text-emerald-600' : r.ac > targetAcos / 100 * 1.3 ? 'text-red-500' : 'text-slate-600'}`}>
                        {(r.ac * 100).toFixed(1)}%
                      </td>
                      <td className="py-1 px-2 text-right font-mono text-[11px] font-semibold">{r.to}</td>
                      <td className="py-1 px-2 text-right font-mono text-[11px] text-slate-500">{r.do}</td>
                      <td className="py-1 px-2 text-center font-mono text-[11px] text-slate-500">{(r.aos * 100).toFixed(1)}%</td>
                      <td className={`py-1 px-2 text-right font-mono text-[11px] ${r.ca <= targetCpa ? 'text-emerald-600' : r.ca > targetCpa * 1.4 ? 'text-red-500' : 'text-slate-600'}`}>
                        ${r.ca.toFixed(2)}
                      </td>
                      <td className={`py-1 px-2 text-center font-mono text-[11px] font-semibold ${r.cv >= 0.05 ? 'text-emerald-600' : r.cv < 0.03 ? 'text-red-500' : 'text-slate-600'}`}>
                        {(r.cv * 100).toFixed(2)}%
                      </td>
                      <td className="py-1 px-2.5 text-center whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold whitespace-nowrap ${r.attrClass}`}>
                          {r.attrTag}
                        </span>
                      </td>
                      <td className="py-1 px-3 min-w-[280px]">
                        <span 
                          title={r.t}
                          className={`block max-w-[480px] truncate px-2 py-0.5 rounded text-[10.5px] font-normal select-text ${
                            r.c === 'badge-green' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' :
                            r.c === 'badge-red' ? 'bg-red-50 text-red-800 border border-red-100' :
                            r.c === 'badge-yellow' ? 'bg-amber-50 text-amber-800 border border-amber-100' :
                            'bg-slate-50 text-slate-755 border border-slate-205'
                          }`}
                        >
                          {r.t}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {adsTotals && (
                  <tfoot className="sticky bottom-0 z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] bg-slate-100">
                    <tr className="font-bold border-t-2 border-slate-300 text-slate-900">
                      <td 
                        className="py-1 px-2 sticky left-0 bg-slate-100 font-extrabold border-r border-slate-200 text-slate-950 truncate"
                        style={{ width: `${firstColWidth}px`, minWidth: `${firstColWidth}px`, maxWidth: `${firstColWidth}px`, position: 'sticky', bottom: 0, left: 0, zIndex: 30 }}
                        title="数据总和"
                      >
                        数据总和 (已贴底)
                      </td>
                      <td className="py-1 px-2 text-center bg-slate-100 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{adsTotals.fr.toFixed(1)}</td>
                      <td className="py-1 px-2 text-right bg-slate-100 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{adsTotals.im.toLocaleString()}</td>
                      <td className="py-1 px-2 text-right bg-slate-100 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{adsTotals.cl.toLocaleString()}</td>
                      <td className="py-1 px-2 text-center bg-slate-100 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{(adsTotals.ct * 100).toFixed(2)}%</td>
                      <td className="py-1 px-2 text-right bg-slate-100 font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>${adsTotals.cp.toFixed(2)}</td>
                      <td className="py-1 px-2 text-right bg-slate-100 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>${adsTotals.sp.toFixed(2)}</td>
                      <td className="py-1 px-2 text-center bg-slate-100 font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>{(adsTotals.adSpendShare * 100).toFixed(1)}%</td>
                      <td className="py-1 px-2 text-right bg-slate-100 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>${adsTotals.ts.toFixed(1)}</td>
                      <td className="py-1 px-2 text-right bg-slate-100 font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>${adsTotals.ds.toFixed(1)}</td>
                      <td className="py-1 px-2 text-center bg-slate-100 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{(adsTotals.ac * 100).toFixed(1)}%</td>
                      <td className="py-1 px-2 text-right bg-slate-100 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{adsTotals.to}</td>
                      <td className="py-1 px-2 text-right bg-slate-100 font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>{adsTotals.do}</td>
                      <td className="py-1 px-2 text-center bg-slate-100 font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>{(adsTotals.aos * 100).toFixed(1)}%</td>
                      <td className="py-1 px-2 text-right bg-slate-100 font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>${adsTotals.ca.toFixed(2)}</td>
                      <td className="py-1 px-2 text-center bg-slate-100 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{(adsTotals.cv * 100).toFixed(2)}%</td>
                      <td className="py-1 px-2.5 text-center bg-slate-100 text-[10px] font-bold text-slate-500" style={{ position: 'sticky', bottom: 0 }}>综合归因</td>
                      <td className="py-1 px-3 bg-slate-100 font-semibold text-slate-600 text-[11px]" style={{ position: 'sticky', bottom: 0 }}>已贴底校验</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {processedList.length > limit && (
              <div className="text-center pt-2">
                <button
                  onClick={() => setLimit(prev => prev + 100)}
                  className="px-4 py-2 border border-slate-200 shadow-2xs hover:bg-slate-50 hover:border-slate-350 text-xs text-indigo-600 font-semibold rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer"
                >
                  <ChevronDown className="w-4 h-4" /> 展开加载后续广告词数据 ({processedList.length - limit} 词条未显示)
                </button>
              </div>
            )}
          </div>

          {/* WoW / Comparative Results Section */}
          {adsCompareRows.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-amber-50/25 border border-amber-200 rounded-xl p-4 space-y-4 shadow-sm"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50/40 p-3 rounded-lg border border-amber-100">
                <div>
                  <h3 className="text-sm font-bold text-amber-900 flex items-center gap-1.5 uppercase tracking-wide">
                    <TrendingUp className="w-5 h-5 text-amber-600" /> 广告词环比对碰诊断看板 (WoW / MoM)
                  </h3>
                  <p className="text-xs text-amber-700/80 mt-0.5">
                    对比当前时段与环比时段的流量、消耗及成效变动，诊断投流走势与归因转移。
                  </p>
                </div>
                <button
                  onClick={exportCompareXlsx}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap"
                >
                  <Download className="w-4 h-4" /> 导出广告词环比 Excel
                </button>
              </div>

              <div className="table-wrapper max-h-[440px] custom-scrollbar border border-amber-200 rounded-lg overflow-auto">
                <table className="relative w-full border-collapse bg-white">
                  <thead>
                    <tr className="bg-amber-50/45 border-b border-amber-250 text-amber-955 text-[10px] font-semibold sticky top-0 z-20">
                      <th className="text-left font-bold uppercase tracking-wider py-1.5 px-2 sticky left-0 bg-amber-50 z-30 border-r border-amber-200 whitespace-nowrap" style={{ width: `${firstColWidth}px` }}>
                        搜索词
                      </th>
                      <th className="text-right py-1.5 px-1.5 cursor-pointer select-none hover:bg-amber-100/50 whitespace-nowrap" onClick={() => handleCompareSort('imp_current')}>曝光(当前)</th>
                      <th className="text-right py-1.5 px-1.5 cursor-pointer select-none hover:bg-amber-100/50 whitespace-nowrap" onClick={() => handleCompareSort('imp_next')}>曝光(后)</th>
                      <th className="text-center py-1.5 px-1.5 cursor-pointer select-none bg-amber-50/30 hover:bg-amber-100/50 font-bold whitespace-nowrap" onClick={() => handleCompareSort('imp_change')}>曝光环比</th>
                      <th className="text-right py-1.5 px-1.5 cursor-pointer select-none hover:bg-amber-100/50 whitespace-nowrap" onClick={() => handleCompareSort('cl_current')}>点击(当前)</th>
                      <th className="text-right py-1.5 px-1.5 cursor-pointer select-none hover:bg-amber-100/50 whitespace-nowrap" onClick={() => handleCompareSort('cl_next')}>点击(后)</th>
                      <th className="text-center py-1.5 px-1.5 cursor-pointer select-none bg-amber-50/30 hover:bg-amber-100/50 font-bold whitespace-nowrap" onClick={() => handleCompareSort('cl_change')}>点击环比</th>
                      <th className="text-right py-1.5 px-1.5 cursor-pointer select-none hover:bg-amber-100/50 whitespace-nowrap" onClick={() => handleCompareSort('sp_current')}>花费(当前)</th>
                      <th className="text-right py-1.5 px-1.5 cursor-pointer select-none hover:bg-amber-100/50 whitespace-nowrap" onClick={() => handleCompareSort('sp_next')}>花费(后)</th>
                      <th className="text-center py-1.5 px-1.5 cursor-pointer select-none bg-amber-50/30 hover:bg-amber-100/50 font-bold whitespace-nowrap" onClick={() => handleCompareSort('sp_change')}>花费环比</th>
                      <th className="text-right py-1.5 px-1.5 cursor-pointer select-none hover:bg-amber-100/50 whitespace-nowrap" onClick={() => handleCompareSort('ts_current')}>销售(当前)</th>
                      <th className="text-right py-1.5 px-1.5 cursor-pointer select-none hover:bg-amber-100/50 whitespace-nowrap" onClick={() => handleCompareSort('ts_next')}>销售(后)</th>
                      <th className="text-center py-1.5 px-1.5 cursor-pointer select-none bg-amber-50/30 hover:bg-amber-100/50 font-bold whitespace-nowrap" onClick={() => handleCompareSort('ts_change')}>销售环比</th>
                      <th className="text-center py-1.5 px-1.5 cursor-pointer select-none hover:bg-amber-100/50 whitespace-nowrap" onClick={() => handleCompareSort('ac_current')}>ACoS(前)</th>
                      <th className="text-center py-1.5 px-1.5 cursor-pointer select-none hover:bg-amber-100/50 whitespace-nowrap" onClick={() => handleCompareSort('ac_next')}>ACoS(后)</th>
                      <th className="text-center py-1.5 px-1.5 cursor-pointer select-none bg-amber-50/30 hover:bg-amber-100/50 font-bold whitespace-nowrap" onClick={() => handleCompareSort('ac_change')}>ACoS差(pp)</th>
                      <th className="text-right py-1.5 px-1.5 cursor-pointer select-none hover:bg-amber-100/50 whitespace-nowrap" onClick={() => handleCompareSort('to_current')}>单量(当前)</th>
                      <th className="text-right py-1.5 px-1.5 cursor-pointer select-none hover:bg-amber-100/50 whitespace-nowrap" onClick={() => handleCompareSort('to_next')}>单量(后)</th>
                      <th className="text-center py-1.5 px-1.5 cursor-pointer select-none hover:bg-amber-100/50 font-bold whitespace-nowrap" onClick={() => handleCompareSort('to_change')}>单量环比</th>
                      <th className="text-center py-1.5 px-1.5 cursor-pointer select-none hover:bg-amber-100/50 whitespace-nowrap" onClick={() => handleCompareSort('cvr_current')}>CVR(当前)</th>
                      <th className="text-center py-1.5 px-1.5 cursor-pointer select-none hover:bg-amber-100/50 whitespace-nowrap" onClick={() => handleCompareSort('cvr_next')}>CVR(后)</th>
                      <th className="text-center py-1.5 px-1.5 cursor-pointer select-none hover:bg-amber-100/50 font-bold whitespace-nowrap" onClick={() => handleCompareSort('cvr_change')}>CVR差(pp)</th>
                      <th className="text-center py-1.5 px-1.5 cursor-pointer select-none hover:bg-amber-100/50 whitespace-nowrap" onClick={() => handleCompareSort('aos_current')}>订单占比(前)</th>
                      <th className="text-center py-1.5 px-1.5 cursor-pointer select-none hover:bg-amber-100/50 whitespace-nowrap" onClick={() => handleCompareSort('aos_next')}>订单占比(后)</th>
                      <th className="text-center py-1.5 px-1.5 cursor-pointer select-none bg-amber-50/30 hover:bg-amber-100/50 font-bold whitespace-nowrap" onClick={() => handleCompareSort('aos_change')}>占比差(pp)</th>
                      <th className="text-center py-1.5 px-1.5 cursor-pointer select-none hover:bg-amber-100/50 whitespace-nowrap" onClick={() => handleCompareSort('adSpendShare_current')}>预算占比(前)</th>
                      <th className="text-center py-1.5 px-1.5 cursor-pointer select-none hover:bg-amber-100/50 whitespace-nowrap" onClick={() => handleCompareSort('adSpendShare_next')}>预算占比(后)</th>
                      <th className="text-center py-1.5 px-1.5 cursor-pointer select-none bg-amber-50/30 hover:bg-amber-100/50 font-bold whitespace-nowrap" onClick={() => handleCompareSort('adSpendShare_change')}>占比差(pp)</th>
                      <th className="text-left font-bold py-1.5 px-2.5 min-w-[250px] border-b border-amber-200 whitespace-nowrap">异向波动主干及策略诊断</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100 text-xs text-slate-700">
                    {processedCompareList.slice(0, compareLimit).map((cr, idx) => (
                      <tr key={idx} className="hover:bg-amber-50/10 transition-colors">
                        <td 
                          className="py-1 px-1.5 sticky left-0 bg-slate-50/95 font-semibold border-r border-amber-100 text-amber-900 truncate" 
                          style={{ width: `${firstColWidth}px`, maxWidth: `${firstColWidth}px` }} 
                          title={cr.kw}
                        >
                          {cr.kw}
                        </td>
                        <td className="py-1 px-1.5 text-right font-mono text-[11px]">{cr.imp_current.toLocaleString()}</td>
                        <td className="py-1 px-1.5 text-right font-mono text-[11px]">{cr.imp_next.toLocaleString()}</td>
                        <td className="py-1 px-1.5 text-center font-mono text-[11px] bg-amber-50/10">{renderTrendChange(cr.imp_current, cr.imp_change)}</td>
                        <td className="py-1 px-1.5 text-right font-mono text-[11px]">{cr.cl_current.toLocaleString()}</td>
                        <td className="py-1 px-1.5 text-right font-mono text-[11px]">{cr.cl_next.toLocaleString()}</td>
                        <td className="py-1 px-1.5 text-center font-mono text-[11px] bg-amber-50/10">{renderTrendChange(cr.cl_current, cr.cl_change)}</td>
                        <td className="py-1 px-1.5 text-right font-mono text-[11px]">${cr.sp_current.toFixed(1)}</td>
                        <td className="py-1 px-1.5 text-right font-mono text-[11px]">${cr.sp_next.toFixed(1)}</td>
                        <td className="py-1 px-1.5 text-center font-mono text-[11px] bg-amber-50/10">{renderTrendChange(cr.sp_current, cr.sp_change, true)}</td>
                        <td className="py-1 px-1.5 text-right font-mono text-[11px]">${cr.ts_current.toFixed(1)}</td>
                        <td className="py-1 px-1.5 text-right font-mono text-[11px]">${cr.ts_next.toFixed(1)}</td>
                        <td className="py-1 px-1.5 text-center font-mono text-[11px] bg-amber-50/10">{renderTrendChange(cr.ts_current, cr.ts_change)}</td>
                        <td className="py-1 px-1.5 text-center font-mono text-[11px]">{(cr.ac_current * 100).toFixed(1)}%</td>
                        <td className="py-1 px-1.5 text-center font-mono text-[11px]">{(cr.ac_next * 100).toFixed(1)}%</td>
                        <td className="py-1 px-1.5 text-center font-mono text-[11px] bg-amber-50/10">{renderPointChange(cr.ac_change, true)}</td>
                        <td className="py-1 px-1.5 text-right font-mono text-[11px]">{cr.to_current}</td>
                        <td className="py-1 px-1.5 text-right font-mono text-[11px]">{cr.to_next}</td>
                        <td className="py-1 px-1.5 text-center font-mono text-[11px] bg-amber-50/10">{renderTrendChange(cr.to_current, cr.to_change)}</td>
                        <td className="py-1 px-1.5 text-center font-mono text-[11px]">{(cr.cvr_current * 100).toFixed(1)}%</td>
                        <td className="py-1 px-1.5 text-center font-mono text-[11px]">{(cr.cvr_next * 100).toFixed(1)}%</td>
                        <td className="py-1 px-1.5 text-center font-mono text-[11px] bg-amber-50/10">{renderPointChange(cr.cvr_change)}</td>
                        <td className="py-1 px-1.5 text-center font-mono text-[11px]">{(cr.aos_current * 100).toFixed(1)}%</td>
                        <td className="py-1 px-1.5 text-center font-mono text-[11px]">{(cr.aos_next * 100).toFixed(1)}%</td>
                        <td className="py-1 px-1.5 text-center font-mono text-[11px] bg-amber-50/10">{renderPointChange(cr.aos_change)}</td>
                        <td className="py-1 px-1.5 text-center font-mono text-[11px]">{(cr.adSpendShare_current * 100).toFixed(1)}%</td>
                        <td className="py-1 px-1.5 text-center font-mono text-[11px]">{(cr.adSpendShare_next * 100).toFixed(1)}%</td>
                        <td className="py-1 px-1.5 text-center font-mono text-[11px] bg-amber-50/10">{renderPointChange(cr.adSpendShare_change)}</td>
                        <td className="py-1 px-2.5 text-slate-700 min-w-[255px] max-w-sm select-text" title={cr.trend}>
                          <span className="block truncate max-w-[400px]">
                            {cr.trend}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {compareTotals && (
                    <tfoot className="sticky bottom-0 z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] bg-amber-50">
                      <tr className="font-bold border-t-2 border-amber-250 text-amber-955">
                        <td 
                          className="py-1 px-1.5 sticky left-0 bg-amber-50 border-r border-amber-155 text-amber-955 font-extrabold whitespace-nowrap"
                          style={{ width: `${firstColWidth}px`, minWidth: `${firstColWidth}px`, maxWidth: `${firstColWidth}px`, position: 'sticky', bottom: 0, left: 0, zIndex: 30 }}
                          title="数据总和"
                        >
                          数据总和 (已贴底)
                        </td>
                        <td className="py-1 px-1.5 text-right bg-amber-50 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{compareTotals.imp_current.toLocaleString()}</td>
                        <td className="py-1 px-1.5 text-right bg-amber-50 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{compareTotals.imp_next.toLocaleString()}</td>
                        <td className="py-1 px-1.5 text-center bg-amber-50/20 font-extrabold font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>{renderTrendChange(compareTotals.imp_current, compareTotals.imp_change)}</td>
                        <td className="py-1 px-1.5 text-right bg-amber-50 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{compareTotals.cl_current.toLocaleString()}</td>
                        <td className="py-1 px-1.5 text-right bg-amber-50 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{compareTotals.cl_next.toLocaleString()}</td>
                        <td className="py-1 px-1.5 text-center bg-amber-50/20 font-extrabold font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>{renderTrendChange(compareTotals.cl_current, compareTotals.cl_change)}</td>
                        <td className="py-1 px-1.5 text-right bg-amber-50 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>${compareTotals.sp_current.toFixed(1)}</td>
                        <td className="py-1 px-1.5 text-right bg-amber-50 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>${compareTotals.sp_next.toFixed(1)}</td>
                        <td className="py-1 px-1.5 text-center bg-amber-50/20 font-extrabold font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>{renderTrendChange(compareTotals.sp_current, compareTotals.sp_change, true)}</td>
                        <td className="py-1 px-1.5 text-right bg-amber-50 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>${compareTotals.ts_current.toFixed(1)}</td>
                        <td className="py-1 px-1.5 text-right bg-amber-50 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>${compareTotals.ts_next.toFixed(1)}</td>
                        <td className="py-1 px-1.5 text-center bg-amber-50/20 font-extrabold font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>{renderTrendChange(compareTotals.ts_current, compareTotals.ts_change)}</td>
                        <td className="py-1 px-1.5 text-center bg-amber-50 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{(compareTotals.ac_current * 100).toFixed(1)}%</td>
                        <td className="py-1 px-1.5 text-center bg-amber-50 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{(compareTotals.ac_next * 100).toFixed(1)}%</td>
                        <td className="py-1 px-1.5 text-center bg-amber-50/20 font-extrabold font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>{renderPointChange(compareTotals.ac_change, true)}</td>
                        <td className="py-1 px-1.5 text-right bg-amber-50 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{compareTotals.to_current.toLocaleString()}</td>
                        <td className="py-1 px-1.5 text-right bg-amber-50 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{compareTotals.to_next.toLocaleString()}</td>
                        <td className="py-1 px-1.5 text-center bg-amber-50/20 font-extrabold font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>{renderTrendChange(compareTotals.to_current, compareTotals.to_change)}</td>
                        <td className="py-1 px-1.5 text-center bg-amber-50 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{(compareTotals.cvr_current * 100).toFixed(1)}%</td>
                        <td className="py-1 px-1.5 text-center bg-amber-50 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{(compareTotals.cvr_next * 100).toFixed(1)}%</td>
                        <td className="py-1 px-1.5 text-center bg-amber-50/20 font-extrabold font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>{renderPointChange(compareTotals.cvr_change)}</td>
                        <td className="py-1 px-1.5 text-center bg-amber-50 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{(compareTotals.aos_current * 100).toFixed(1)}%</td>
                        <td className="py-1 px-1.5 text-center bg-amber-50 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{(compareTotals.aos_next * 100).toFixed(1)}%</td>
                        <td className="py-1 px-1.5 text-center bg-amber-50/20 font-extrabold font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>{renderPointChange(compareTotals.aos_change)}</td>
                        <td className="py-1 px-1.5 text-center bg-amber-50 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{(compareTotals.adSpendShare_current * 100).toFixed(1)}%</td>
                        <td className="py-1 px-1.5 text-center bg-amber-50 font-mono text-[11px] font-extrabold" style={{ position: 'sticky', bottom: 0 }}>{(compareTotals.adSpendShare_next * 100).toFixed(1)}%</td>
                        <td className="py-1 px-1.5 text-center bg-amber-50/20 font-extrabold font-mono text-[11px]" style={{ position: 'sticky', bottom: 0 }}>{renderPointChange(compareTotals.adSpendShare_change)}</td>
                        <td className="py-1 px-2.5 bg-amber-50 font-semibold text-amber-955 text-[11px]" style={{ position: 'sticky', bottom: 0 }}>已贴底校验</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {processedCompareList.length > compareLimit && (
                <div className="text-center pt-2">
                  <button
                    onClick={() => setCompareLimit(prev => prev + 150)}
                    className="px-4 py-2 border border-slate-200 bg-white shadow-2xs hover:bg-slate-50 hover:border-slate-350 text-xs text-amber-600 font-semibold rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronDown className="w-4 h-4" /> 展开加载更多环比词数据 ({processedCompareList.length - compareLimit} 条未加载)
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </React.Fragment>
      )}
    </div>
  );
}
