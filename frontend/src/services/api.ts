type PlanResponse = {
  tasks: string[];
  error?: string;
};

export async function fetchPlan(
  question: string,
  provider: "doubao" | "deepseek",
): Promise<string[]> {
  const response = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, provider }),
  });

  const data = (await response.json().catch(() => ({}))) as PlanResponse;
  if (!response.ok) {
    throw new Error(data.error || "服务端返回错误");
  }
  if (!data.tasks || !Array.isArray(data.tasks)) {
    throw new Error("未返回任务列表");
  }
  return data.tasks;
}
