import { useState } from "react";
import type { TaskNode } from "../types";

type TaskTreeProps = {
  node: TaskNode;
  path: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onExpand: (path: string, title: string) => void;
  loadingPaths: Set<string>;
};

function TaskTree({
  node,
  path,
  selectedPath,
  onSelect,
  onExpand,
  loadingPaths,
}: TaskTreeProps) {
  if (!node.title) {
    return null;
  }
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const isSelected = selectedPath === path;
  const isLoading = loadingPaths.has(path);
  const showExpanded = hasChildren && !collapsed;
  const toggleLabel = showExpanded ? "折叠" : "展开";

  return (
    <div className="tree-node">
      <div className={`tree-row ${isSelected ? "selected" : ""}`}>
        <button
          type="button"
          className="toggle"
          aria-label={toggleLabel}
          onClick={() => {
            if (hasChildren) {
              setCollapsed((prev) => !prev);
            } else {
              setCollapsed(false);
              onExpand(path, node.title);
            }
          }}
          disabled={isLoading}
        >
          {showExpanded ? "-" : "+"}
        </button>
        <button type="button" className="title" onClick={() => onSelect(path)}>
          {node.title}
        </button>
      </div>
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
              loadingPaths={loadingPaths}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default TaskTree;
