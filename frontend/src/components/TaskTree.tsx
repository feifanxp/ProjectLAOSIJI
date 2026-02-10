import { useMemo, useState } from "react";
import type { KeywordInfo, TaskNode } from "../types";

type TaskTreeProps = {
  node: TaskNode;
  path: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onExpand: (path: string, title: string) => void;
  onStuck: (path: string, title: string) => void;
  onToggleComplete: (path: string) => void;
  loadingPaths: Set<string>;
  stuckLoadingPaths: Set<string>;
};

function TaskTree({
  node,
  path,
  selectedPath,
  onSelect,
  onExpand,
  onStuck,
  onToggleComplete,
  loadingPaths,
  stuckLoadingPaths,
}: TaskTreeProps) {
  if (!node.title) {
    return null;
  }
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const isSelected = selectedPath === path;
  const isLoading = loadingPaths.has(path);
  const isStuckLoading = stuckLoadingPaths.has(path);
  const showExpanded = hasChildren && !collapsed;
  const toggleLabel = showExpanded ? "折叠" : "展开";

  const keywords = useMemo(() => node.keywords || [], [node.keywords]);

  const renderTextWithKeywords = (text: string, list: KeywordInfo[]) => {
    if (!text || list.length === 0) return text;
    const terms = Array.from(new Set(list.map((item) => item.term))).filter(Boolean);
    if (!terms.length) return text;
    const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`(${escaped.join("|")})`, "g");
    return text.split(regex).map((part, index) => {
      const matched = list.find((item) => item.term === part);
      if (!matched) {
        return <span key={`${part}-${index}`}>{part}</span>;
      }
      return (
        <span key={`${part}-${index}`} className="keyword" data-tip={matched.explanation}>
          {part}
        </span>
      );
    });
  };

  return (
    <div className="tree-node">
      <div
        className={`tree-row ${isSelected ? "selected" : ""} ${node.completed ? "completed" : ""}`}
      >
        {hasChildren ? (
          <button
            type="button"
            className="toggle"
            aria-label={toggleLabel}
            onClick={() => setCollapsed((prev) => !prev)}
          >
            {showExpanded ? "-" : "+"}
          </button>
        ) : (
          <span className="toggle-placeholder" />
        )}
        <button type="button" className="title" onClick={() => onSelect(path)}>
          {node.title}
        </button>
        {node.questType ? <span className={`quest-tag quest-${node.questType}`}>{node.questType}</span> : null}
        {node.difficulty ? (
          <span className={`difficulty-tag difficulty-${node.difficulty}`}>
            {node.difficulty.toUpperCase()}
          </span>
        ) : null}
        <button
          type="button"
          className="complete-button"
          onClick={() => onToggleComplete(path)}
        >
          {node.completed ? "已完成" : "完成"}
        </button>
        <button
          type="button"
          className="split-button"
          onClick={() => {
            setCollapsed(false);
            onExpand(path, node.title);
          }}
          disabled={isLoading}
        >
          {isLoading ? "拆解中..." : "拆解"}
        </button>
        <button
          type="button"
          className="stuck-button"
          onClick={() => onStuck(path, node.title)}
          disabled={isStuckLoading}
        >
          {isStuckLoading ? "救援中..." : "我卡住了"}
        </button>
      </div>
      {node.hint ? (
        <div className="task-line">
          <span className="task-label">提示：</span>
          <span className="task-text">{node.hint}</span>
        </div>
      ) : null}
      {node.description ? (
        <div className="task-line">
          <span className="task-label">描述：</span>
          <span className="task-text">{renderTextWithKeywords(node.description, keywords)}</span>
        </div>
      ) : null}
      {node.how ? (
        <div className="task-line">
          <span className="task-label">做法：</span>
          <span className="task-text">{renderTextWithKeywords(node.how, keywords)}</span>
        </div>
      ) : null}
      {isLoading ? <div className="split-status">正在生成子任务...</div> : null}
      {hasChildren && !collapsed ? (
        <div className="tree-children">
          {node.children!.map((child, index) => (
            <TaskTree
              key={`${path}-${index}`}
              node={child}
              path={`${path}-${index}`}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onExpand={onExpand}
              onStuck={onStuck}
              onToggleComplete={onToggleComplete}
              loadingPaths={loadingPaths}
              stuckLoadingPaths={stuckLoadingPaths}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default TaskTree;
