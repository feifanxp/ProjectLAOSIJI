const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const {
  VOLC_API_KEY,
  VOLC_ENDPOINT,
  VOLC_MODEL,
  DEEPSEEK_API_KEY,
  DEEPSEEK_ENDPOINT,
  DEEPSEEK_MODEL,
  PORT = 3001,
} = process.env;

function coerceChildrenObjects(jsonStr) {
  let result = jsonStr;
  let changed = true;
  while (changed) {
    changed = false;
    result = result.replace(/"children"\s*:\s*\[\s*\{([^}]+)\}\s*\]/g, (match, inner) => {
      const titles = Array.from(inner.matchAll(/"title"\s*:\s*"([^"]*)"/g)).map((m) => m[1]);
      if (!titles.length) return match;
      const children = titles.map((title) => `{"title":"${title}"}`).join(",");
      changed = true;
      return `"children":[${children}]`;
    });
  }
  return result;
}

function extractJsonObject(text) {
  if (!text) return null;
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  const candidate = text.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(candidate);
  } catch (error) {
    const coerced = coerceChildrenObjects(candidate);
    try {
      return JSON.parse(coerced);
    } catch (innerError) {
      return null;
    }
  }
}

function extractJsonArray(text) {
  if (!text) return null;
  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) return null;
  const candidate = text.slice(firstBracket, lastBracket + 1);
  try {
    return JSON.parse(candidate);
  } catch (error) {
    return null;
  }
}

function normalizeNode(input) {
  if (typeof input === "string") {
    const title = input.trim();
    return title ? { title, children: [] } : null;
  }
  if (!input || typeof input !== "object") return null;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const rawChildren = Array.isArray(input.children) ? input.children : [];
  const children = rawChildren.map(normalizeNode).filter(Boolean);
  if (!title && children.length === 0) return null;
  return { title: title || "未命名任务", children };
}

function toTaskList(input) {
  if (Array.isArray(input)) {
    return input.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  }
  if (!input || typeof input !== "object") return [];
  const normalized = normalizeNode(input);
  if (!normalized || !normalized.children) return [];
  return normalized.children
    .map((child) => (child && typeof child.title === "string" ? child.title.trim() : ""))
    .filter(Boolean);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/plan", async (req, res) => {
  const question = String(req.body?.question || "").trim();
  const provider = String(req.body?.provider || "doubao").trim();
  if (!question) {
    return res.status(400).json({ error: "请提供问题内容" });
  }
  const config =
    provider === "deepseek"
      ? {
          apiKey: DEEPSEEK_API_KEY,
          endpoint: DEEPSEEK_ENDPOINT || "https://api.deepseek.com/v1/chat/completions",
          model: DEEPSEEK_MODEL,
          label: "DEEPSEEK",
        }
      : {
          apiKey: VOLC_API_KEY,
          endpoint: VOLC_ENDPOINT,
          model: VOLC_MODEL,
          label: "VOLC",
        };
  if (!config.apiKey || !config.endpoint || !config.model) {
    return res
      .status(500)
      .json({ error: `服务端未配置完整的 ${config.label}_API_KEY/${config.label}_ENDPOINT/${config.label}_MODEL` });
  }

  const systemPrompt =
    "你是学习任务拆解助手。请将用户目标拆成若干子任务，输出严格 JSON，不要多余文本。";
  const userPrompt = [
    "请将下面的问题拆解为一层子任务。",
    "要求：",
    "1) 输出 JSON 数组，结构为 [\"子任务1\",\"子任务2\",...]。",
    "2) 只拆一层子任务（不要再拆子任务的子任务）。",
    "3) 子任务数量 3-6 个。",
    "4) 任务标题简短明确，不要含序号。",
    "问题：",
    question,
  ].join("\n");

  const payload = {
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
  };

  try {
    const bodyString = JSON.stringify(payload);
    const response = await axios.request({
      method: "POST",
      url: config.endpoint,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      data: bodyString,
      timeout: 30000,
    });

    const content =
      response.data?.choices?.[0]?.message?.content ||
      response.data?.choices?.[0]?.text ||
      response.data?.data?.choices?.[0]?.message?.content ||
      "";

    const parsedArray = extractJsonArray(content);
    const parsedObject = parsedArray ? null : extractJsonObject(content);
    const tasks = toTaskList(parsedArray ?? parsedObject);
    if (!tasks.length) {
      return res.status(502).json({
        error: "模型返回无法解析为任务列表",
        raw: content || response.data,
      });
    }

    return res.json({ tasks });
  } catch (error) {
    const detail = error.response?.data || error.message || "未知错误";
    return res.status(502).json({ error: "模型调用失败", detail });
  }
});

app.listen(Number(PORT), () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
