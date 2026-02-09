import { useState, type FormEvent } from "react";
import "./App.css";
import { fetchPlan } from "./services/api";
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

function App() {
  const [question, setQuestion] = useState(() => pickRandomQuestion());
  const [provider, setProvider] = useState<"doubao" | "deepseek">("deepseek");
  const [tree, setTree] = useState<TaskNode | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const toChildren = (tasks: string[]): TaskNode[] =>
    tasks.map((title) => ({ title, children: [] })).filter((item) => item.title);

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
    try {
      const tasks = await fetchPlan(trimmed, provider);
      setTree({ title: trimmed, children: toChildren(tasks) });
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
      const tasks = await fetchPlan(title, provider);
      const children = toChildren(tasks);
      setTree((prev) =>
        prev ? updateTreeAtPath(prev, path, (node) => ({ ...node, children })) : prev,
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

  return (
    <div className="app">
      <header className="app-header">
        <h1>AI 学习任务拆解</h1>
        <p>输入一个目标，获取分层任务树，逐步推进学习。</p>
      </header>

      <main className="app-main">
        <section className="panel input-panel">
          <form onSubmit={handleSubmit} className="question-form">
            <label htmlFor="question">你的问题</label>
            <div className="provider-row">
              <span>选择模型</span>
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value as "doubao" | "deepseek")}
              >
                <option value="doubao">豆包</option>
                <option value="deepseek">DeepSeek</option>
              </select>
            </div>
            <textarea
              id="question"
              placeholder="例如：学会搭建个人博客"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={5}
            />
            <button type="submit" disabled={loading}>
              {loading ? "正在拆解..." : "开始拆解"}
            </button>
          </form>
          {error ? <div className="error">{error}</div> : null}
        </section>

        <section className="panel tree-panel">
          <h2>任务树</h2>
          {tree ? (
            <TaskTree
              node={tree}
              path="root"
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
              onExpand={handleExpand}
              loadingPaths={loadingPaths}
            />
          ) : (
            <div className="placeholder">
              {loading ? "等待模型返回结果..." : "提交问题后，这里会显示任务树。"}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
