# ProjectLAOSIJI

一个由 AI 辅助的学习任务拆解平台。用户输入目标，系统按需递归拆解为子任务，并以树形结构展示。

## 功能

- 输入学习目标，生成一级任务列表
- 点击节点按需继续拆分
- 支持豆包与 DeepSeek 模型切换

## 本地运行

1. 启动后端
```
cd server
cp .env.example .env
# 填入你的 API Key 与模型配置
npm install
npm run dev
```

2. 启动前端
```
cd frontend
npm install
npm run dev
```

前端地址：`http://localhost:5173/`

