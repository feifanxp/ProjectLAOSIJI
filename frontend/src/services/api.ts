import type { QuestType } from "../types";

export type PlanItem = {
  title: string;
  description?: string;
  how?: string;
  hint?: string;
  questType?: QuestType;
  keywords?: { term: string; explanation: string }[];
};

export type PlanScenario = "initial" | "expand" | "stuck";

export type PlanResponse = {
  difficulty: "simple" | "medium" | "hard";
  items: PlanItem[];
  scenario?: PlanScenario;
  error?: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export async function fetchPlan(
  question: string,
  provider: "doubao" | "deepseek",
  scenario: PlanScenario = "initial",
): Promise<PlanResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, provider, scenario }),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as PlanResponse;
      throw new Error(errorData.error || `HTTP错误: ${response.status}`);
    }

    const data = (await response.json()) as PlanResponse;
    
    if (!data.items || !Array.isArray(data.items)) {
      throw new Error("未返回清单任务");
    }
    
    return data;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("网络请求失败，请检查后端服务是否运行");
  }
}
