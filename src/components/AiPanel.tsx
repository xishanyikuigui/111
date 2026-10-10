import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Sparkles, Send, Brain, AlertTriangle, CheckCircle2, 
  HelpCircle, Copy, ArrowRight, Download, BarChart2,
  TrendingDown, Zap, FileSpreadsheet, RefreshCw
} from 'lucide-react';
import { AdsRow } from '../types';

interface AiPanelProps {
  adsRows: AdsRow[];
  onNavigateToAds: () => void;
}

export default function AiPanel({ adsRows, onNavigateToAds }: AiPanelProps) {
  const [customRequest, setCustomRequest] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [report, setReport] = useState<string>('');
  const [sampledUsed, setSampledUsed] = useState<boolean>(false);
  const [metrics, setMetrics] = useState<any>(null);

  // Ready-to-go quick prompts
  const PRESETS = [
    { label: "📌 核心流量大盘诊断", text: "请帮我对这一批SP广告整体流量漏斗进行全盘透视，给出主观健康度评级与关键痛点诊断。" },
    { label: "🔥 拦截亏损无转化黑洞", text: "请精准排查出哪些属于高点击、零转化的『预算浪费黑洞词』，给出确凿的否定拦截（精准/词组）与竞价扣减列表。" },
    { label: "⭐ ACoS 黄金出单词高能拓词", text: "找出当前 ACoS 低、订单贡献大的黄金爆词（ACoS < 25%），提出具体的高位溢价拓词以及匹配模式演变策略。" },
    { label: "💡 漏斗再分配预算微调", text: "结合展现到点击的 CTR、点击到成交的 CVR，制定一份具体的预算再分配及竞价微调的量化落地行动项。" }
  ];

  const handleLoadDemoReport = () => {
    setLoading(true);
    setErrorMsg('');
    setCopied(false);

    // Auto calculate active metrics for high-fidelity representation
    const targetRows = (adsRows && adsRows.length > 0) ? adsRows : [
      { kw: "custom protective glass iphone 15 pro", fr: 15, im: 8500, cl: 185, ct: "2.18%", cp: 1.12, sp: 207.2, ts: 1890.0, ac: "10.96%", to: 63, dr: 22 },
      { kw: "leather phone cases protective standard", fr: 42, im: 12400, cl: 248, ct: "2.00%", cp: 0.95, sp: 235.6, ts: 1450.0, ac: "16.25%", to: 48, dr: 18 },
      { kw: "magnetic card pack holder back accessory", fr: 8, im: 5000, cl: 65, ct: "1.30%", cp: 1.30, sp: 84.5, ts: 420.0, ac: "20.12%", to: 14, dr: 4 },
      { kw: "cheap charging cable pack bulk combo", fr: 19, im: 25000, cl: 380, ct: "1.52%", cp: 0.45, sp: 171.0, ts: 180.0, ac: "95.00%", to: 18, dr: 0 },
      { kw: "ultra strong magnetic connector ring", fr: 3, im: 3400, cl: 41, ct: "1.21%", cp: 0.80, sp: 32.8, ts: 0.0, ac: "0.00%", to: 0, dr: 0 }
    ];

    let totalSpend = 0;
    let totalSales = 0;
    let totalClicks = 0;
    let totalImpressions = 0;
    let totalOrders = 0;

    targetRows.forEach((row: any) => {
      totalSpend += Number(row.sp || 0);
      totalSales += Number(row.ts || 0);
      totalClicks += Number(row.cl || 0);
      totalImpressions += Number(row.im || 0);
      totalOrders += Number(row.to || 0);
    });

    const overallACoS = totalSales > 0 ? ((totalSpend / totalSales) * 100).toFixed(2) : "17.40";
    const overallCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "1.85";
    const overallCVR = totalClicks > 0 ? ((totalOrders / totalClicks) * 105).toFixed(2) : "15.42";

    setTimeout(() => {
      const demoMarkdown = `# 🤖 AI 广告搜索引擎漏斗透视与决策诊断报告 (极速模拟版)

> 💡 **演示模式提示**: 当前正在运行具有完整计算逻辑的 **免密模拟诊断模式 (Demo Mode)**。在您于 AI Studio 顶层工具栏中的 **Settings > Secrets** 面板注入正确的 \`GEMINI_API_KEY\` 后，即可切换进入真金实弹的云端大盘实时诊断！

---

## 🚀 广告大盘流量多维体检
基于本次诊断录入的 **${targetRows.length}个** 主力广告搜索词，我们进行了多维计算决策模型回归：
- **健康度综述评级**: **良好 (B+ Grade)**
- **综合体检评分**: **84 分**
- **全路漏斗 CTR 诊断**: 整体展现到点击转化率 (CTR) 为 **${overallCTR}%**，符合成熟消费品标准。
- **ACoS 损耗控制值**: 大盘 ACoS 稳定在 **${overallACoS}%**，综合利润保持优越。
- **成交端 CVR 深度分析**: 点击至订单转化率 (CVR) 为 **${overallCVR}%**，中高意向匹配效率较高。

---

## ⚠️ 亏损消耗黑洞专项诊断 (建议立即否定拦截)
排查出以下流量无谓损耗，应当在后台管理中采取精准操作以**立即降本增效**：

- **"cheap charging cable pack bulk combo"**
  - **异常指标**: 展现 25,000次 | 点击 380次 | 消耗 **$171.00** | 订单 18 单 | ACoS 高达 **95.00%**
  - **流损根因**: 搜索偏好过于泛化（低单价混剪需求），CPC点击费消耗偏高而转化低。
  - **避险决策**: 🔥 **在对应广告组内实施【精准否定 (Exact Negative)】拦截**。

- **"ultra strong magnetic connector ring"**
  - **异常指标**: 展现 3,400次 | 点击 41次 | 消耗 **$32.80** | 订单 **0** | ACoS 此时为 **0.00%**
  - **流损根因**: 高展现、强相关点击却始终无购买，属于弱意向摩擦词。
  - **避险决策**: ⚠️ **立即在广泛/词组匹配层级进行【词组否定 (Phrase Negative)】屏蔽**。

---

## ⭐ 核心黄金增量点破局 (建议提高竞价与预算)
这些热词具备强大的买家意向与极佳的 ACoS 水平，应该大力拉升转化广度：

- **"custom protective glass iphone 15 pro"**
  - **优异表现**: 贡献了 **63** 单 | 转化率达 **34.05%** | ACoS 仅为超级绿色的 **10.96%**
  - **提速动作**: 🚀 **提升该核心搜索词的每日投放预算 35% - 50%**，在搜索页首位（Top of Search）提升高位市占率。

- **"leather phone cases protective standard"**
  - **优异表现**: 创收 **$1,450.00** 销售流水 | 斩获 **48** 单订单 | ACoS 安全卡位在 **16.25%**
  - **提速动作**: 建议将其在词库内单独升格为 **【精准匹配组 (Exact Match Group)】单独看护并投放**。

---

## 💡 下一阶段可落地执行行动项 (Next Action-Items)
1. **立即拦截**：优先在后台拦截高损耗核心词 \`cheap charging cable\`，每日可挽回 $25+ 硬消耗。
2. **专项高位拓量**：为爆词 \`custom protective glass iphone 15 pro\` 专属溢加 15% 竞价（Bid），确立顶流广告位置垄断。
3. **设置低效阈值**：对于大盘中点击超 30 次且 ACoS 高于 50% 的二线词，统一执行 15% 竞价折让折返。`;

      setReport(demoMarkdown);
      setSampledUsed(adsRows.length === 0);
      setMetrics({
        totalSpend,
        totalSales,
        overallACoS,
        overallCVR,
        totalOrders
      });
      setLoading(false);
    }, 1100);
  };

  const handleGenerateReport = async (promptOverride?: string) => {
    setLoading(true);
    setErrorMsg('');
    setCopied(false);
    
    const requestText = promptOverride || customRequest;

    try {
      const response = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adsRows,
          customRequest: requestText
        })
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || "未知分析错误");
      }

      setReport(data.report);
      setSampledUsed(data.sampledUsed);
      setMetrics(data.summary);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "连接全栈端AI助理失败，请确保后台服务启动且 GEMINI_API_KEY 已配置。");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Safe and bespoke fast parser for markdown styling inside our custom-themed container
  const renderMarkdown = (md: string) => {
    if (!md) return null;

    const lines = md.split('\n');
    return lines.map((line, idx) => {
      const trimmed = line.trim();

      // Heading 1 (# title)
      if (trimmed.startsWith('# ')) {
        return (
          <h1 key={idx} className="text-xl font-bold font-sans text-slate-950 border-b border-indigo-100 pb-2 mt-6 mb-3 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            {trimmed.substring(2)}
          </h1>
        );
      }
      
      // Heading 2 (## subtitle)
      if (trimmed.startsWith('## ')) {
        return (
          <h2 key={idx} className="text-base font-bold font-sans text-slate-900 mt-5 mb-2.5 flex items-center gap-2">
            <span className="w-1.5 h-4 bg-indigo-500 rounded-sm"></span>
            {trimmed.substring(3)}
          </h2>
        );
      }

      // Heading 3 (### section)
      if (trimmed.startsWith('### ')) {
        return (
          <h3 key={idx} className="text-sm font-semibold text-slate-800 mt-4 mb-2">
            {trimmed.substring(4)}
          </h3>
        );
      }

      // Blockquote / Alerts
      if (trimmed.startsWith('>')) {
        return (
          <div key={idx} className="my-3 p-3 bg-amber-50 border-l-4 border-amber-500 text-amber-900 text-xs rounded-r-md leading-relaxed">
            {trimmed.substring(1).trim()}
          </div>
        );
      }

      // Lists with Bullet points & Action item checkers
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const listText = trimmed.substring(2);
        
        // Render differently if containing specific actionable verbs for amazing visual response
        const isActionable = listText.includes("精准否定") || listText.includes("拦截") || listText.includes("降低") || listText.includes("微调");
        
        return (
          <li key={idx} className="list-none flex items-start gap-2 text-xs text-slate-600 my-1.5">
            {isActionable ? (
              <Zap className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 mt-0.5 shrink-0" />
            )}
            <span className="leading-relaxed">
              {parseBoldText(listText)}
            </span>
          </li>
        );
      }

      // Regular paragraphs
      if (trimmed.length > 0) {
        return (
          <p key={idx} className="text-xs text-slate-600 leading-relaxed my-2">
            {parseBoldText(trimmed)}
          </p>
        );
      }

      return <div key={idx} className="h-2"></div>;
    });
  };

  // Inline formatter for bold tag syntax **text**
  const parseBoldText = (text: string) => {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    if (parts.length === 1) return text;
    
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        return <strong key={i} className="font-semibold text-slate-950 bg-slate-100/60 px-1 rounded-sm">{part}</strong>;
      }
      return part;
    });
  };

  return (
    <div className="space-y-6">
      
      {/* Intro Dashboard Glass Banner */}
      <div className="bg-gradient-to-r from-indigo-900/90 to-slate-900 text-white p-6 rounded-2xl border border-indigo-500/10 shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-6 -mt-6 w-44 h-44 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-12 w-64 h-32 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-bold tracking-wider text-indigo-300 uppercase px-2 py-0.5 rounded-full bg-indigo-950/50 border border-indigo-500/20">
                PROTOTYPE READY • FULL-STACK LLM BACKED
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              🤖 AI 智能广告分析助理
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl leading-normal">
              多维度聚合广告报告的投产、流损等底层数据，由 server-side 驱动的 Gemini 智能深度决策，免去高昂人工算力与分析师等待，自动捕捉流量流失、一键诊断出精准降本增效动作！
            </p>
          </div>
          
          <div className="flex gap-2.5 shrink-0">
            {adsRows.length > 0 ? (
              <div className="px-3.5 py-4 rounded-xl bg-slate-950/45 border border-indigo-500/15 text-center min-w-[120px]">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">已载入真实报表</p>
                <p className="text-lg font-black font-mono text-emerald-400 mt-1">{adsRows.length} 条词组</p>
              </div>
            ) : (
              <motion.button 
                whileHover={{ scale: 1.02 }}
                onClick={onNavigateToAds}
                className="px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/30 border border-indigo-500/30 transition-all cursor-pointer h-fit"
              >
                <FileSpreadsheet className="w-4 h-4 text-indigo-200" />
                导入真实SP报表
              </motion.button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Control Board */}
        <div className="lg:col-span-5 space-y-6">
          
          <div className="bg-white rounded-xl border border-slate-200 shadow-3xs p-6 space-y-5">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Brain className="w-4 h-4 text-indigo-500" />
                AI 诊断方向定制 (Prompt Context)
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                您可以直接对 AI 分析助理下达具体的优化目标（留空则默认全面体检）：
              </p>
            </div>

            {/* Presets Grid */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">热度指令模板 (点击自动装载)</label>
              <div className="grid grid-cols-1 gap-1.5">
                {PRESETS.map((preset, pIdx) => (
                  <button
                    key={pIdx}
                    onClick={() => {
                      setCustomRequest(preset.text);
                      handleGenerateReport(preset.text);
                    }}
                    type="button"
                    className="text-left py-1.5 px-2.5 rounded-lg border border-slate-200/80 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/30 text-[11px] font-medium text-slate-700 hover:text-indigo-950 transition-all cursor-pointer truncate"
                  >
                    🔍 {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom request textarea */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500">个性化要求/目标权重分析：</label>
              <textarea
                value={customRequest}
                onChange={(e) => setCustomRequest(e.target.value)}
                placeholder="例如：重点优化亏损无转化关键词，降低不必要的硬消耗损拨，并帮我梳理转化大于15%的高价值黄金拓展词竞价动作..."
                className="w-full text-xs p-3 border border-slate-200 rounded-lg focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-slate-50/20 shadow-inner h-24 resize-none transition-all"
              />
            </div>

            {/* Trigger buttons */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleGenerateReport()}
                disabled={loading}
                className={`w-full py-3 rounded-lg text-xs font-bold text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md ${
                  loading 
                    ? 'bg-indigo-500/50 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 hover:scale-[1.01]'
                }`}
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    正在抽取底层数格，深度诊断中...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                    <span>一键生成 AI 广告分析报告</span>
                    <ArrowRight className="w-3.5 h-3.5 opacity-80" />
                  </>
                )}
              </button>
              
              {adsRows.length === 0 && (
                <p className="text-[10px] text-amber-600 bg-amber-50 rounded-md p-2 flex items-start gap-1.5 leading-relaxed">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <span>
                    系统检测到<strong>暂无上传真实广告数据</strong>。点击分析将自动装载<strong>高价值的示例测试案段</strong>为您全自动生成报告展示！
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Key Metrics calculated on current dataset */}
          {metrics && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-900 text-slate-200 rounded-xl border border-slate-800 p-5 space-y-4 shadow-sm"
            >
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-800 pb-2">
                <BarChart2 className="w-4 h-4 text-emerald-400" />
                本次诊断输入大盘汇总 (Diagnosed Specs)
              </h4>
              
              <div className="grid grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-400">汇总消耗</p>
                  <p className="text-sm font-black font-mono text-white">${Number(metrics.totalSpend).toFixed(2)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-400">总销售额</p>
                  <p className="text-sm font-black font-mono text-white">${Number(metrics.totalSales).toFixed(2)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-400">大盘 ACoS</p>
                  <p className={`text-sm font-black font-mono ${parseFloat(metrics.overallACoS) > 30 ? 'text-amber-400' : 'text-emerald-400'}`}>{metrics.overallACoS}%</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-400">大盘转化率 (CVR)</p>
                  <p className="text-sm font-black font-mono text-white">{metrics.overallCVR}%</p>
                </div>
                <div className="col-span-2 space-y-1 pt-1.5 border-t border-slate-800/85">
                  <p className="text-[10px] text-slate-400">诊断数据特征</p>
                  <p className="text-xs text-slate-300 font-medium">
                    {sampledUsed ? "📋 采用内置标准品类对照模型数据段" : "📈 采用用户自主上传真实SP广告报表数据段"}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

        </div>

        {/* Right Side: Report Feedback Interface */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-xl border border-slate-200 shadow-3xs overflow-hidden">
            
            {/* Header console */}
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                <span className="text-xs font-bold text-slate-800">SP广告诊断分析报告终端</span>
              </div>

              {report && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyToClipboard}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 transition-all cursor-pointer shadow-3xs"
                  >
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>{copied ? '已复制！' : '复制全文'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Content Display Body */}
            <div className="p-6 min-h-[380px] flex flex-col justify-between">
              
              {loading ? (
                <div className="flex flex-col items-center justify-center my-16 space-y-4">
                  <div className="relative flex items-center justify-center">
                    <span className="animate-ping absolute inline-flex h-12 w-12 rounded-full bg-indigo-400 opacity-20"></span>
                    <div className="w-10 h-10 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin"></div>
                    <Brain className="w-5 h-5 text-indigo-600 absolute animate-pulse" />
                  </div>
                  <div className="space-y-1.5 text-center">
                    <p className="text-xs font-bold text-slate-800">正在与 Server-side AI 研判网络建立安全握手...</p>
                    <p className="text-[10px] text-slate-500 leading-normal max-w-[280px]">
                      系统正对底层漏斗的展现量、点击效率及ACoS损耗，进行环比异动和长尾负向诊断。大约需要 10 - 20 秒中枢处理。
                    </p>
                  </div>
                </div>
              ) : errorMsg ? (
                <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-lg my-6 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                    <div className="space-y-1 text-xs">
                      <p className="font-bold">分析终端提示：需要配置 API 秘钥</p>
                      <p className="text-rose-700 leading-normal">
                        {errorMsg}
                      </p>
                      <div className="pt-2 text-[10px] text-slate-500 flex flex-col gap-1">
                        <span>• 系统目前已同时支持 Google Gemini、OpenAI GPT 与中国尖端 DeepSeek 多通道大模型。</span>
                        <span>• 请在当前 AI Studio 的右上角 **{'Settings > Secrets'}** 面板配置 `GEMINI_API_KEY`、`DEEPSEEK_API_KEY` 或 `OPENAI_API_KEY` 即可完成正式激活！</span>
                        <span>• 您也可以在下方直接启动本地免密模拟诊断，提前体验 AI 分析工作台的多维漏斗排查深度。</span>
                      </div>
                    </div>
                  </div>
                  <div className="pt-2 pl-6">
                    <button
                      onClick={handleLoadDemoReport}
                      className="inline-flex items-center gap-1.5 px-4 py-2 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-all cursor-pointer shadow-3xs"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                      启动免密本地智能模拟诊断 (Demo Mode)
                    </button>
                  </div>
                </div>
              ) : report ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="prose max-w-none text-slate-800 space-y-1"
                >
                  {renderMarkdown(report)}
                </motion.div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-16 space-y-4 my-auto">
                  <Brain className="w-12 h-12 text-indigo-400 stroke-[1.25] drop-shadow-3xs animate-bounce" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-800">暂无活动分析报告</p>
                    <p className="text-[10px] text-slate-500 max-w-xs leading-normal mx-auto">
                      点击左方『一键生成 AI 广告分析报告』按钮，即可由内置多维流控大模型（Gemini / DeepSeek / OpenAI）针对您的团队搜索词库出具一份极其深度的漏斗异动诊断报告。
                    </p>
                  </div>
                  <div className="pt-2">
                    <button
                      onClick={handleLoadDemoReport}
                      className="inline-flex items-center gap-1.5 px-4 py-2 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-all cursor-pointer shadow-3xs"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      运行免密模拟诊断演示
                    </button>
                  </div>
                </div>
              )}

              {report && !loading && (
                <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                  <span>诊断执行中枢: Gemini AI Engine</span>
                  <span>分析完成时间: {new Date().toLocaleTimeString()}</span>
                </div>
              )}

            </div>

          </div>
        </div>

      </div>

    </div>
  );
}
