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

function normalizeItem(input) {
  if (!input || typeof input !== "object") return null;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const how = typeof input.how === "string" ? input.how.trim() : "";
  const hint = typeof input.hint === "string" ? input.hint.trim() : "";
  const questTypeRaw = typeof input.questType === "string" ? input.questType.trim().toLowerCase() : "main";
  const questType = ["main", "side", "boss"].includes(questTypeRaw) ? questTypeRaw : "main";
  const rawKeywords = Array.isArray(input.keywords) ? input.keywords : [];
  const keywords = rawKeywords
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const term = typeof item.term === "string" ? item.term.trim() : "";
      const explanation = typeof item.explanation === "string" ? item.explanation.trim() : "";
      return term ? { term, explanation } : null;
    })
    .filter(Boolean);
  if (!title && !description && !how) return null;
  return { title: title || "未命名任务", description, how, hint, questType, keywords };
}

function normalizeItems(input) {
  if (!Array.isArray(input)) return [];
  return input.map(normalizeItem).filter(Boolean);
}

function parseDifficulty(text) {
  const normalized = String(text || "").toLowerCase();
  if (normalized.includes("简单") || normalized.includes("simple")) return "simple";
  if (normalized.includes("中等") || normalized.includes("medium")) return "medium";
  if (normalized.includes("较难") || normalized.includes("困难") || normalized.includes("hard")) return "hard";
  return "medium";
}

async function callModel(config, messages) {
  const payload = {
    model: config.model,
    messages,
    temperature: 0.2,
  };
  const response = await axios.request({
    method: "POST",
    url: config.endpoint,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    data: JSON.stringify(payload),
    timeout: 30000,
  });
  return (
    response.data?.choices?.[0]?.message?.content ||
    response.data?.choices?.[0]?.text ||
    response.data?.data?.choices?.[0]?.message?.content ||
    ""
  );
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/plan", async (req, res) => {
  const question = String(req.body?.question || "").trim();
  const provider = String(req.body?.provider || "doubao").trim();
  const scenarioRaw = String(req.body?.scenario || "initial").trim().toLowerCase();
  const scenario = ["initial", "expand", "stuck"].includes(scenarioRaw) ? scenarioRaw : "initial";
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

  try {
    const classifyMessages = [
      {
        role: "system",
        content:
          "你是任务难度评估助手。只输出难度枚举：simple/medium/hard，不要输出其它内容。",
      },
      {
        role: "user",
        content: [
          "请评估以下任务难度：",
          "定义：",
          "- simple：简单任务，只需少量步骤，不包含复杂概念",
          "- medium：中等难度，涉及部分复杂概念，步骤较多",
          "- hard：较难任务，多步骤且包含较多复杂概念",
          "任务：",
          question,
        ].join("\n"),
      },
    ];

    const difficultyContent = await callModel(config, classifyMessages);
    const difficulty = parseDifficulty(difficultyContent);

    const decomposePromptByDifficulty = {
      simple: [
        "请将下面的任务拆为 RPG 风格执行步骤清单。",
        "要求：",
        "1) 输出 JSON 数组，结构为 [{\"title\":\"...\",\"description\":\"...\",\"how\":\"...\",\"hint\":\"...\",\"questType\":\"main|side|boss\",\"keywords\":[{\"term\":\"...\",\"explanation\":\"...\"}]}]。",
        "2) 只拆一层，步骤数量 3-5 个。",
        "3) description 简要说明任务目的，how 给出具体做法。",
        "4) keywords 仅包含需要解释的复杂词汇，不多于 2 个。",
        "5) questType 只允许 main/side/boss。",
      ],
      medium: [
        "请将下面的任务拆为 RPG 风格清单子任务。",
        "要求：",
        "1) 输出 JSON 数组，结构为 [{\"title\":\"...\",\"description\":\"...\",\"how\":\"...\",\"hint\":\"...\",\"questType\":\"main|side|boss\",\"keywords\":[{\"term\":\"...\",\"explanation\":\"...\"}]}]。",
        "2) 只拆一层，子任务数量 4-7 个。",
        "3) description 说明任务目的，how 给出清晰可执行步骤。",
        "4) keywords 仅包含复杂概念词，每项提供简短解释。",
        "5) questType 只允许 main/side/boss。",
      ],
      hard: [
        "请将下面的任务拆为 RPG 风格清单子任务。",
        "要求：",
        "1) 输出 JSON 数组，结构为 [{\"title\":\"...\",\"description\":\"...\",\"how\":\"...\",\"hint\":\"...\",\"questType\":\"main|side|boss\",\"keywords\":[{\"term\":\"...\",\"explanation\":\"...\"}]}]。",
        "2) 只拆一层，子任务数量 6-9 个。",
        "3) description 解释任务核心点，how 给出细致步骤。",
        "4) keywords 提取复杂概念词并给出解释，每个子任务可有 1-3 个。",
        "5) questType 只允许 main/side/boss。",
      ],
    };

    const scenarioPromptByType = {
      initial: [
        "当前场景：initial（首次拆解）。",
        "目标：体现 RPG 机制，包含主线、支线与最终 BOSS。",
        "额外约束：",
        "- 至少包含 2 条 main。",
        "- 至少包含 1 条 side。",
        "- 至少包含 1 条 boss（最终验收关卡）。",
        "- 每条任务给出 hint，尽量短句。",
      ],
      expand: [
        "当前场景：expand（对子任务继续拆解）。",
        "目标：输出当前节点下一层任务。",
        "额外约束：",
        "- 优先输出 main 和 side。",
        "- 除非明确是终局任务，否则不要输出 boss。",
        "- 每条任务给出 hint（执行建议）。",
      ],
      stuck: [
        "当前场景：stuck（用户卡点，触发弹性教程）。",
        "目标：输出 2-4 条救援任务，强调最小可行动作与排障顺序。",
        "额外约束：",
        "- questType 优先为 side，可少量 main。",
        "- 每条 how 必须可立即执行，尽量控制在 15-30 分钟。",
        "- hint 使用鼓励式、低压力语气。",
      ],
    };

    const decomposeMessages = [
      {
        role: "system",
        content: "你是 RPG 学习任务拆解助手。只输出严格 JSON，不要任何多余文本。",
      },
      {
        role: "user",
        content: [
          ...decomposePromptByDifficulty[difficulty],
          ...scenarioPromptByType[scenario],
          "任务：",
          question,
        ].join("\n"),
      },
    ];

    const decomposeContent = await callModel(config, decomposeMessages);
    const parsedArray = extractJsonArray(decomposeContent);
    const items = normalizeItems(parsedArray);
    if (!items.length) {
      return res.status(502).json({
        error: "模型返回无法解析为清单任务",
        raw: decomposeContent,
      });
    }

    return res.json({ difficulty, scenario, items });
  } catch (error) {
    const detail = error.response?.data || error.message || "未知错误";
    return res.status(502).json({ error: "模型调用失败", detail });
  }
});

app.listen(Number(PORT), () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
