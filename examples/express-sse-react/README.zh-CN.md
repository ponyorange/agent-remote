# agent-remote-example-express-sse-react

语言：[English](README.md) | 简体中文

这是一个私有示例项目，演示如何把 Express 服务端、SSE transport、React 客户端和 Agent Remote 工具调用串起来。

## 示例内容

- Express 服务端创建 `AgentEngine` 和 `SessionManager`。
- 服务端通过 `createExpressAgentRouter` 暴露 `/sse`、`/api/register_tools`、`/api/chat` 和 `/api/tool_result`。
- React 客户端通过 `createSSEClient` 建立 SSE 连接。
- React 组件通过 `useAgentClient` 注册 `change_background` 浏览器工具。
- demo LLM 会请求调用 `change_background`，浏览器执行后返回工具结果。

## 运行

从仓库根目录安装依赖并构建：

```bash
npm install -g @microsoft/rush@5.120.0
rush install
rush build
```

运行示例测试：

```bash
rush test -t agent-remote-example-express-sse-react
```

在示例包目录中启动开发服务：

```bash
cd examples/express-sse-react
pnpm dev
```

默认端口是 `3000`，可通过 `PORT` 环境变量覆盖：

```bash
PORT=4000 pnpm dev
```

## 服务端结构

`src/server.ts` 创建 demo 服务：

- `DemoLLMClient`: 一个测试用 LLM client。第一次收到用户消息时返回 `change_background` 工具调用；收到工具结果后返回 `Background color updated.`。
- `SessionManager`: 使用 `InMemoryStore` 和 `LocalBroker`，适合单实例 demo。
- `AgentEngine`: 连接 demo LLM 和 session manager。
- `createExpressAgentRouter`: 注册 Agent Remote SSE 和 POST 路由。
- `/health`: 简单健康检查端点。

## React 客户端结构

`src/App.tsx` 创建浏览器端 demo：

- 使用 `createSSEClient` 连接 `/sse`。
- 生成随机 `sessionId`，保证每个页面实例有独立会话。
- 使用 `useAgentClient` 管理连接状态、最后消息和清理。
- 注册 `change_background` 工具，参数为 `{ color: string }`。
- 点击按钮后调用 `agent.sendMessage("Change the background to blue")`。

## 端到端流程

1. React 组件创建 SSE client。
2. 浏览器连接 `GET /sse?session_id=<id>`。
3. 客户端注册 `change_background` 工具到 `POST /api/register_tools`。
4. 用户点击按钮，客户端发送消息到 `POST /api/chat`。
5. `DemoLLMClient` 返回 `agent_remote:tool_call`。
6. 服务端通过 SSE 把工具调用推送到浏览器。
7. 浏览器执行工具，修改页面背景色。
8. 客户端把结果发送到 `POST /api/tool_result`。
9. `DemoLLMClient` 收到工具结果后返回 assistant 文本。
10. React 页面显示最后一条 assistant 消息。

## 真实应用中需要替换的部分

- 用真实 LLM client 替换 `DemoLLMClient`，例如 `OpenAILLMClient`。
- 根据业务定义真实工具，并为高风险工具设置 `risk: "high"` 或 `level: "L3"`。
- 增加 `sessionAuth`，避免未授权 session 连接和调用工具。
- 多实例部署时，把 `InMemoryStore` 和 `LocalBroker` 替换为 `agent-remote-server-redis`。

## 脚本

- `pnpm build`: 使用 tsup 构建服务端和 React 入口。
- `pnpm dev`: 使用 tsx 运行 `src/server.ts`。
- `pnpm test`: 运行 Vitest。
- `pnpm lint`: 运行 `tsc --noEmit`。

## 注意事项

- 该包是私有包，不发布到 npm。
- demo 主要用于 smoke test 和开发参考，不包含生产级认证、持久化或真实 LLM 配置。
