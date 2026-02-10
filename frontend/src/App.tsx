import { useMemo, useState, type FormEvent } from "react";
import "./App.css";
import { fetchPlan, type PlanItem } from "./services/api";
import type { TaskNode } from "./types";
import TaskTree from "./components/TaskTree";

const DEFAULT_QUESTIONS = [
  "我想学会格式化U盘",
  "我想学会清理C盘垃圾文件",
  "我想学会搭建个人博客",
  "我想学会制作一份简历",
  "我想学会给电脑做一次系统体检",
  "我想学会用表格做月度预算",
  "我想学会整理手机相册",
];

function pickRandomQuestion() {
  return DEFAULT_QUESTIONS[Math.floor(Math.random() * DEFAULT_QUESTIONS.length)];
}

function dedupeByTitle(nodes: TaskNode[]) {
  const seen = new Set<string>();
  return nodes.filter((node) => {
    const key = node.title.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function flattenTree(root: TaskNode | null): TaskNode[] {
  if (!root) return [];
  const result: TaskNode[] = [];
  const stack: TaskNode[] = [root];
  while (stack.length) {
    const current = stack.pop()!;
    result.push(current);
    const children = current.children ?? [];
    for (let i = children.length - 1; i >= 0; i -= 1) {
      stack.push(children[i]);
    }
  }
  return result;
}

function App() {
  const [question, setQuestion] = useState(() => pickRandomQuestion());
  const [provider, setProvider] = useState<"doubao" | "deepseek">("deepseek");
  const [tree, setTree] = useState<TaskNode | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [stuckLoadingPaths, setStuckLoadingPaths] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const toChildren = (items: PlanItem[]): TaskNode[] =>
    items
      .map((item) => ({
        title: item.title,
        description: item.description || "",
        how: item.how || "",
        hint: item.hint || "",
        questType: item.questType || "main",
        keywords: item.keywords || [],
        completed: false,
        children: [],
      }))
      .filter((item) => item.title);

  const updateTreeAtIndices = (
    node: TaskNode,
    indices: number[],
    updater: (target: TaskNode) => TaskNode,
  ): TaskNode => {
    if (indices.length === 0) {
      return updater(node);
    }
    const [index, ...rest] = indices;
    if (!node.children || !node.children[index]) {
      return node;
    }
    const updatedChild = updateTreeAtIndices(node.children[index], rest, updater);
    const nextChildren = node.children.map((child, idx) => (idx === index ? updatedChild : child));
    return { ...node, children: nextChildren };
  };

  const updateTreeAtPath = (
    root: TaskNode,
    path: string,
    updater: (target: TaskNode) => TaskNode,
  ): TaskNode => {
    if (path === "root") {
      return updater(root);
    }
    const indices = path.split("-").slice(1).map((value) => Number(value));
    return updateTreeAtIndices(root, indices, updater);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) {
      setError("请输入你的学习目标或问题");
      return;
    }
    setLoading(true);
    setError(null);
    setTree(null);
    setSelectedPath(null);
    setLoadingPaths(new Set());
    setStuckLoadingPaths(new Set());
    try {
      const result = await fetchPlan(trimmed, provider, "initial");
      setTree({
        title: trimmed,
        description: "",
        how: "",
        hint: "目标已接取：先推进主线，按需补充支线，最终挑战 BOSS。",
        questType: "main",
        keywords: [],
        difficulty: result.difficulty,
        completed: false,
        children: toChildren(result.items),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败");
    } finally {
      setLoading(false);
    }
  };

  const handleExpand = async (path: string, title: string) => {
    if (loadingPaths.has(path)) return;
    setSelectedPath(path);
    setError(null);
    setLoadingPaths((prev) => new Set(prev).add(path));
    try {
      const result = await fetchPlan(title, provider, "expand");
      const children = toChildren(result.items);
      setTree((prev) =>
        prev
          ? updateTreeAtPath(prev, path, (node) => ({
              ...node,
              difficulty: result.difficulty,
              children,
            }))
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "拆分失败");
    } finally {
      setLoadingPaths((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
  };

  const handleStuck = async (path: string, title: string) => {
    if (stuckLoadingPaths.has(path)) return;
    setSelectedPath(path);
    setError(null);
    setStuckLoadingPaths((prev) => new Set(prev).add(path));
    try {
      const result = await fetchPlan(title, provider, "stuck");
      const rescueChildren = toChildren(result.items);
      setTree((prev) =>
        prev
          ? updateTreeAtPath(prev, path, (node) => ({
              ...node,
              hint: "已触发弹性教程：优先执行最小可行动作。",
              children: dedupeByTitle([...(node.children || []), ...rescueChildren]),
            }))
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "卡点救援失败");
    } finally {
      setStuckLoadingPaths((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
  };

  const handleToggleComplete = (path: string) => {
    setTree((prev) =>
      prev
        ? updateTreeAtPath(prev, path, (node) => ({
            ...node,
            completed: !node.completed,
          }))
        : prev,
    );
  };

  const allNodes = useMemo(() => flattenTree(tree), [tree]);
  const mainNodes = allNodes.filter((node) => node.questType === "main");
  const sideNodes = allNodes.filter((node) => node.questType === "side");
  const bossNodes = allNodes.filter((node) => node.questType === "boss");
  const mainCompleted = mainNodes.filter((node) => node.completed).length;
  const mainTotal = mainNodes.length;
  const bossUnlocked = mainTotal > 0 && mainCompleted / mainTotal >= 0.8;

  return (
    <div className="app">
      <header className="app-header">
        <h1>QuestCraft · RPG 任务引导</h1>
        <p>主线推进、支线补给、BOSS 收官、弹性教程</p>
      </header>

      <main className="app-main">
        <section className="panel input-panel">
          <h2 className="panel-title">任务目标输入</h2>
          <form onSubmit={handleSubmit} className="question-form">
            <div className="question-input">
              <label htmlFor="question">你的问题</label>
              <textarea
                id="question"
                placeholder="例如：学会搭建个人博客"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={5}
              />
            </div>
            <div className="action-row">
              <div className="provider-row">
                <span className="provider-label">选择模型</span>
                <select
                  className="provider-select"
                  value={provider}
                  onChange={(event) => setProvider(event.target.value as "doubao" | "deepseek")}
                >
                  <option value="doubao">豆包</option>
                  <option value="deepseek">DeepSeek</option>
                </select>
              </div>
              <button type="submit" className="submit-button" disabled={loading}>
                {loading ? "正在拆解..." : "开始拆解"}
              </button>
            </div>
          </form>
          {error ? <div className="error">{error}</div> : null}
        </section>

        <section className="panel tree-panel">
          <h2 className="panel-title">任务树</h2>
          <div className="overview-cards">
            <div className="overview-card">
              <span className="overview-label">主线进度</span>
              <strong className="overview-value">
                {mainCompleted} / {mainTotal || 0} 已完成
              </strong>
            </div>
            <div className="overview-card">
              <span className="overview-label">支线可选</span>
              <strong className="overview-value success">{sideNodes.length} 条待补给</strong>
            </div>
            <div className="overview-card">
              <span className="overview-label">BOSS 解锁</span>
              <strong className={`overview-value ${bossUnlocked ? "success" : "danger"}`}>
                {bossUnlocked ? "已解锁" : "主线完成 80% 后开启"}
              </strong>
            </div>
          </div>
          {tree ? (
            <TaskTree
              node={tree}
              path="root"
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
              onExpand={handleExpand}
              onStuck={handleStuck}
              onToggleComplete={handleToggleComplete}
              loadingPaths={loadingPaths}
              stuckLoadingPaths={stuckLoadingPaths}
            />
          ) : (
            <div className="placeholder">
              {loading ? "等待模型返回结果..." : "提交问题后，这里会显示任务树。"}
            </div>
          )}
          {tree && bossNodes.length === 0 ? (
            <div className="placeholder">提示：你可以继续拆解主线，系统会在后续阶段生成 BOSS 验收任务。</div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

export default App;
