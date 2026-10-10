import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '20mb' }));

// Lazy initializer for Gemini SDK as per guidelines (ensures stability when key is omitted dynamically)
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("API_KEY environment variable is missing. Please set GEMINI_API_KEY, DEEPSEEK_API_KEY, or OPENAI_API_KEY in Settings > Secrets on the top-right.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Full-stack AI Analysis Router
app.post("/api/ai/analyze", async (req, res) => {
  try {
    const { adsRows, customRequest } = req.body;
    
    // Fallback sample data if no data uploaded yet (prototype friendly!)
    const targetRows = (adsRows && adsRows.length > 0) ? adsRows : [
      { kw: "custom protective glass iphone 15 pro", fr: 15, im: 8500, cl: 185, ct: "2.18%", cp: 1.12, sp: 207.20, ts: 1890.00, ac: "10.96%", to: 63, dr: 22 },
      { kw: "leather phone cases protective standard", fr: 42, im: 12400, cl: 248, ct: "2.00%", cp: 0.95, sp: 235.60, ts: 1450.00, ac: "16.25%", to: 48, dr: 18 },
      { kw: "magnetic card pack holder back accessory", fr: 8, im: 5000, cl: 65, ct: "1.30%", cp: 1.30, sp: 84.50, ts: 420.00, ac: "20.12%", to: 14, dr: 4 },
      { kw: "cheap charging cable pack bulk combo", fr: 19, im: 25000, cl: 380, ct: "1.52%", cp: 0.45, sp: 171.00, ts: 180.00, ac: "95.00%", to: 18, dr: 0 },
      { kw: "ultra strong magnetic connector ring", fr: 3, im: 3400, cl: 41, ct: "1.21%", cp: 0.80, sp: 32.80, ts: 0.00, ac: "0.00%", to: 0, dr: 0 }
    ];

    // Compute basic statistics automatically to guide LLM with high-fidelity summaries
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

    const overallACoS = totalSales > 0 ? ((totalSpend / totalSales) * 100).toFixed(2) : "0.00";
    const overallCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0.00";
    const overallCVR = totalClicks > 0 ? ((totalOrders / totalClicks) * 100).toFixed(2) : "0.00";

    // Detect high wasting keywords and top performers
    const wasteKeywords = targetRows
      .filter((row: any) => Number(row.sp || 0) > 30 && Number(row.to || 0) === 0)
      .map((row: any) => `关键词: "${row.kw}", 点击: ${row.cl}, 展现: ${row.im}, 消耗: $${Number(row.sp).toFixed(2)}`);

    const performKeywords = targetRows
      .filter((row: any) => Number(row.to || 0) > 5 && parseFloat(row.ac || "0") < 25)
      .map((row: any) => `关键词: "${row.kw}", 订单: ${row.to}, ACoS: ${row.ac}, 销售额: $${Number(row.ts).toFixed(2)}`);

    const prompt = `
你是一位资深的亚马逊跨境电商广告专家和精益运营大师。现在我为你提供了一份广告投放搜索词（Search Terms）的实时概览数据集，请为我生成一份极其专业、可落地的【AI 广告搜索引擎漏斗透视与决策诊断报告】。

【输入数据集概览】
- 广告词条目数: ${targetRows.length}个词
- 汇总总消耗: $${totalSpend.toFixed(2)}
- 汇总总销售额(Overall Sales): $${totalSales.toFixed(2)}
- 整体预估 ACoS: ${overallACoS}%
- 整体 CTR: ${overallCTR}%
- 整体 CVR (转化率): ${overallCVR}%
- 汇总总订单数: ${totalOrders}单
- 汇总总点击数: ${totalClicks}次
- 汇总总展现量: ${totalImpressions}次

【异常高损耗无转化/亏损广告词 (需要及时否定/拦截)】:
${wasteKeywords.length > 0 ? wasteKeywords.join("\n") : "暂无低效重损词或数据量较少"}

【高投产/黄金爆单词 (建议提高竞价与预算)】:
${performKeywords.length > 0 ? performKeywords.join("\n") : "暂无高转化爆词或数据量较少"}

【用户自定义的诊断深度/特殊要求限制】:
"${customRequest || "请进行全面的亚马逊SP广告健康度体检，给出拓词、否词与预算调度的科学建议"}"

请遵循以下专业逻辑和产出格式：
1. **🚀 广告大盘流量多维体检**: 剖析整体 CVR、CTR 和 ACoS，基于标准亚马逊健康水位线（如 CTR 2%、ACoS 20-30%）给出健康分级与总体打分。
2. **⚠️ 亏损消耗黑洞专项诊断**: 指出哪些词严重浪费预算（即点击多但零转化，或者 ACoS 飙升至 50% 以上），给出具体的否定拦截动作（精确否定 vs 词组否定）和竞价调整（下调 %）。
3. **⭐ 核心黄金增量点破局**: 明确指出高转化词怎么最大化拓量，溢价卡位策略建议。
4. **💡 下一阶段可落地执行行动项(Next Action-Items)**: 至少列举3条明确、量化的调整方案（例如：“将 '关键词A' 竞价降低 15% ；将 '关键词B' 移入精准匹配并增加 20% 预算；拦截亏损无转化关键词 '关键词C'”）。
5. **📊 数据洞察可视总结**: 额外提供一个精简的数据见解表格，体现专业深度。

请采用结构清晰、排版专业优雅、可读性极强的 Markdown 中文输出。文字要精干利落，直奔核心痛点，符合跨境卖家对高效率降本增效的迫切需求。
`;

    let finalReportText = "";
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    const openAiKey = process.env.OPENAI_API_KEY;

    if (deepseekKey) {
      console.log("Leveraging DeepSeek Chat API endpoint for dynamic analysis...");
      const deepseekResp = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${deepseekKey}`
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: "You are an elite Amazon PPC Advertising optimization expert." },
            { role: "user", content: prompt }
          ],
          temperature: 0.7
        })
      });

      if (!deepseekResp.ok) {
        const errorText = await deepseekResp.text();
        throw new Error(`DeepSeek API Returned Status ${deepseekResp.status}: ${errorText}`);
      }

      const deepseekData: any = await deepseekResp.json();
      finalReportText = deepseekData.choices?.[0]?.message?.content || "未能获取 DeepSeek API 返回内容。";
    } else if (openAiKey) {
      console.log("Leveraging OpenAI GPT API endpoint for dynamic analysis...");
      const openAiResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openAiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are an elite Amazon PPC Advertising optimization expert." },
            { role: "user", content: prompt }
          ],
          temperature: 0.7
        })
      });

      if (!openAiResp.ok) {
        const errorText = await openAiResp.text();
        throw new Error(`OpenAI API Returned Status ${openAiResp.status}: ${errorText}`);
      }

      const openaiData: any = await openAiResp.json();
      finalReportText = openaiData.choices?.[0]?.message?.content || "未能获取 GPT API 返回内容。";
    } else {
      console.log("Leveraging Google Gemini API endpoint for dynamic analysis...");
      const client = getAiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });
      finalReportText = response.text || "";
    }

    res.json({
      success: true,
      report: finalReportText,
      sampledUsed: !adsRows || adsRows.length === 0,
      summary: {
        totalSpend,
        totalSales,
        overallACoS,
        overallCVR,
        totalOrders
      }
    });
  } catch (error: any) {
    console.error("AI analysis route error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "AI 智能诊断服务暂时不可用，请检查 GEMINI_API_KEY 环境变量配置。"
    });
  }
});

// Vite Middleware & Static fallback config
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server successfully started at http://localhost:${PORT}`);
  });
}

startServer();
