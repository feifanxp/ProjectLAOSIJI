type Difficulty = "simple" | "medium" | "hard";
type Scenario = "initial" | "expand" | "stuck";
type QuestType = "main" | "side" | "boss";

type Env = {
  VOLC_API_KEY?: string;
  VOLC_ENDPOINT?: string;
  VOLC_MODEL?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_ENDPOINT?: string;
  DEEPSEEK_MODEL?: string;
};

type PlanItem = {
  title: string;
  description?: string;
  how?: string;
  hint?: string;
  questType?: QuestType;
  keywords?: { term: string; explanation: string }[];
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function parseDifficulty(text: string): Difficulty {
  const normalized = String(text || "").toLowerCase();
  if (normalized.includes("简单") || normalized.includes("simple")) return "simple";
  if (normalized.includes("中等") || normalized.includes("medium")) return "medium";
  if (normalized.includes("较难") || normalized.includes("困难") || normalized.includes("hard")) return "hard";
  return "medium";
}

function extractJsonArray(text: string): unknown[] | null {
  if (!text) return null;
  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) return null;
  const candidate = text.slice(firstBracket, lastBracket + 1);
  try {
    return JSON.parse(candidate) as unknown[];
  } catch {
    return null;
  }
}

function normalizeItem(input: unknown): PlanItem | null {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  const title = typeof source.title === "string" ? source.title.trim() : "";
  const description = typeof source.description === "string" ? source.description.trim() : "";
  const how = typeof source.how === "string" ? source.how.trim() : "";
  const hint = typeof source.hint === "string" ? source.hint.trim() : "";
  const questTypeRaw = typeof source.questType === "string" ? source.questType.trim().toLowerCase() : "main";
  const questType: QuestType = (["main", "side", "boss"].includes(questTypeRaw) ? questTypeRaw : "main") as QuestType;
  const rawKeywords = Array.isArray(source.keywords) ? source.keywords : [];
  const keywords = rawKeywords
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const term = typeof row.term === "string" ? row.term.trim() : "";
      const explanation = typeof row.explanation === "string" ? row.explanation.trim() : "";
      return term ? { term, explanation } : null;
    })
    .filter(Boolean) as { term: string; explanation: string }[];

  if (!title && !description && !how && !hint) return null;
  return {
    title: title || "未命名任务",
    description,
    how,
    hint,
    questType,
    keywords,
  };
}

function normalizeItems(input: unknown): PlanItem[] {
  if (!Array.isArray(input)) return [];
  return input.map(normalizeItem).filter(Boolean) as PlanItem[];
}

async function callModel(
  config: { apiKey: string; endpoint: string; model: string },
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<string> {
  const payload = {
    model: config.model,
    messages,
    temperature: 0.2,
  };

  const resp = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`模型调用失败(${resp.status}): ${errText}`);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  const choices = (data.choices as Array<Record<string, unknown>> | undefined) || [];
  const first = choices[0] || {};
  const message = (first.message as Record<string, unknown> | undefined) || {};
  return (message.content as string) || (first.text as string) || "";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/api/plan") {
      try {
        const body = (await request.json()) as Record<string, unknown>;
        const question = String(body?.question || "").trim();
        const provider = String(body?.provider || "doubao").trim();
        const scenarioRaw = String(body?.scenario || "initial").trim().toLowerCase();
        const scenario: Scenario = (["initial", "expand", "stuck"].includes(scenarioRaw)
          ? scenarioRaw
          : "initial") as Scenario;

        if (!question) {
          return json({ error: "请提供问题内容" }, 400);
        }

        const config =
          provider === "deepseek"
            ? {
                apiKey: env.DEEPSEEK_API_KEY || "",
                endpoint: env.DEEPSEEK_ENDPOINT || "https://api.deepseek.com/v1/chat/completions",
                model: env.DEEPSEEK_MODEL || "",
                label: "DEEPSEEK",
              }
            : {
                apiKey: env.VOLC_API_KEY || "",
                endpoint: env.VOLC_ENDPOINT || "",
                model: env.VOLC_MODEL || "",
                label: "VOLC",
              };

        if (!config.apiKey || !config.endpoint || !config.model) {
          return json(
            { error: `服务端未配置完整的 ${config.label}_API_KEY/${config.label}_ENDPOINT/${config.label}_MODEL` },
            500,
          );
        }

        const classifyMessages = [
          {
            role: "system" as const,
            content: "你是任务难度评估助手。只输出难度枚举：simple/medium/hard，不要输出其它内容。",
          },
          {
            role: "user" as const,
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

        const decomposePromptByDifficulty: Record<Difficulty, string[]> = {
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

        const scenarioPromptByType: Record<Scenario, string[]> = {
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
            role: "system" as const,
            content: "你是 RPG 学习任务拆解助手。只输出严格 JSON，不要任何多余文本。",
          },
          {
            role: "user" as const,
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
          return json({ error: "模型返回无法解析为清单任务", raw: decomposeContent }, 502);
        }

        return json({ difficulty, scenario, items });
      } catch (error) {
        const detail = error instanceof Error ? error.message : "未知错误";
        return json({ error: "模型调用失败", detail }, 502);
      }
    }

    return json({ error: "Not Found" }, 404);
  },
};
