import { useState } from "react";
import type { TaskNode } from "../types";

type TaskTreeProps = {
  node: TaskNode;
  path: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  loadingPaths: Set<string>;
  stuckLoadingPaths: Set<string>;
};

function TaskTree({
  node,
  path,
  selectedPath,
  onSelect,
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
  const stateText = isLoading ? "拆解中" : isStuckLoading ? "救援中" : node.completed ? "已完成" : "进行中";
  const stateClass = isLoading || isStuckLoading ? "busy" : node.completed ? "done" : "active";

  return (
    <div className="task-list-node">
      <div
        className={`task-list-row ${isSelected ? "selected" : ""}`}
      >
        {hasChildren ? (
          <button
            type="button"
            className="task-toggle"
            aria-label={toggleLabel}
            onClick={() => setCollapsed((prev) => !prev)}
          >
            {showExpanded ? "-" : "+"}
          </button>
        ) : (
          <span className="task-toggle-placeholder" />
        )}
        <button type="button" className="task-title" onClick={() => onSelect(path)}>
          {node.title}
        </button>
        {node.questType ? <span className={`task-quest-tag ${node.questType}`}>{node.questType}</span> : null}
        <span className={`task-state ${stateClass}`}>{stateText}</span>
      </div>
      {hasChildren && !collapsed ? (
        <div className="task-list-children">
          {node.children!.map((child, index) => (
            <TaskTree
              key={`${path}-${index}`}
              node={child}
              path={`${path}-${index}`}
              selectedPath={selectedPath}
              onSelect={onSelect}
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
