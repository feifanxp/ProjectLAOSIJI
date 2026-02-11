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

function getNodeByPath(root: TaskNode | null, path: string | null): TaskNode | null {
  if (!root) return null;
  if (!path || path === "root") return root;
  const indices = path.split("-").slice(1).map((value) => Number(value));
  let current: TaskNode | undefined = root;
  for (const index of indices) {
    if (!current?.children || Number.isNaN(index) || !current.children[index]) return null;
    current = current.children[index];
  }
  return current ?? null;
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
  const mainCompleted = mainNodes.filter((node) => node.completed).length;
  const mainTotal = mainNodes.length;
  const bossUnlocked = mainTotal > 0 && mainCompleted / mainTotal >= 0.8;
  const activePath = selectedPath ?? "root";
  const activeNode = useMemo(() => getNodeByPath(tree, activePath), [tree, activePath]);
  const activeLoading = loadingPaths.has(activePath);
  const activeStuckLoading = stuckLoadingPaths.has(activePath);
  const activeStateText = activeLoading
    ? "拆解中"
    : activeStuckLoading
      ? "救援中"
      : activeNode?.completed
        ? "已完成"
        : "进行中";
  const keywordList = activeNode?.keywords ?? [];

  return (
    <div className="app">
      <header className="app-header">
        <h1>QuestCraft · RPG 任务引导</h1>
        <p>主线推进、支线补给、BOSS 收官、弹性教程</p>
      </header>

      <main className="app-shell">
        <aside className="panel sidebar-panel">
          <div className="panel-head">
            <h2 className="panel-title">任务列表</h2>
            <span className="small-muted">{allNodes.length} 条</span>
          </div>
          {tree ? (
            <TaskTree
              node={tree}
              path="root"
              selectedPath={activePath}
              onSelect={setSelectedPath}
              loadingPaths={loadingPaths}
              stuckLoadingPaths={stuckLoadingPaths}
            />
          ) : (
            <div className="placeholder">提交问题后，这里显示树形任务列表。</div>
          )}
        </aside>

        <section className="panel detail-panel">
          <div className="task-status-header">
            <div className="task-status-title-wrap">
              <h2 className="panel-title">{activeNode ? `当前任务：${activeNode.title}` : "当前任务：未选择"}</h2>
              <div className="status-chip-row">
                {activeNode?.questType ? (
                  <span className={`task-quest-tag ${activeNode.questType}`}>{activeNode.questType}</span>
                ) : null}
                <span className={`detail-state ${activeNode?.completed ? "done" : "active"}`}>{activeStateText}</span>
                <span className="detail-progress">主线 {mainCompleted}/{mainTotal || 0}</span>
              </div>
            </div>
            <div className="status-actions">
              <button
                type="button"
                className="complete-button"
                disabled={!activeNode}
                onClick={() => activeNode && handleToggleComplete(activePath)}
              >
                {activeNode?.completed ? "已完成" : "完成"}
              </button>
              <button
                type="button"
                className="split-button"
                disabled={!activeNode || activeLoading}
                onClick={() => activeNode && handleExpand(activePath, activeNode.title)}
              >
                {activeLoading ? "拆解中..." : "拆解"}
              </button>
              <button
                type="button"
                className="stuck-button"
                disabled={!activeNode || activeStuckLoading}
                onClick={() => activeNode && handleStuck(activePath, activeNode.title)}
              >
                {activeStuckLoading ? "救援中..." : "我卡住了"}
              </button>
            </div>
          </div>

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

          {activeNode ? (
            <div className="task-detail-card">
              <div className="detail-group">
                <h3>任务描述</h3>
                <p>{activeNode.description || "暂无描述。你可以点击“拆解”生成更细步骤。"}</p>
              </div>

              <div className="detail-group">
                <h3>执行步骤</h3>
                <p>{activeNode.how || "暂无步骤。建议先点击“拆解”生成下一层行动项。"}</p>
              </div>

              <div className="detail-group hint">
                <h3>弹性教程提示</h3>
                <p>
                  {activeNode.hint ||
                    "你已掌握的内容会简述跳过；如果卡住，请点击“我卡住了”触发救援任务。"}
                </p>
              </div>

              {keywordList.length ? (
                <div className="detail-group">
                  <h3>关键词解释</h3>
                  <ul className="keyword-list">
                    {keywordList.map((keyword) => (
                      <li key={`${keyword.term}-${keyword.explanation}`}>
                        <strong>{keyword.term}</strong>
                        <span>{keyword.explanation || "暂无解释"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="placeholder">先在底部输入问题并开始拆解。</div>
          )}
        </section>
      </main>

      <footer className="composer-wrap">
        <form onSubmit={handleSubmit} className="composer-form">
          <textarea
            id="question"
            placeholder="继续输入问题，或补充你的卡点…"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={2}
            className="composer-input"
          />
          <div className="composer-controls">
            <div className="provider-row">
              <span className="provider-label">模型</span>
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
      </footer>
    </div>
  );
}

export default App;
