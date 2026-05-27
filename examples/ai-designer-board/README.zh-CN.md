# agent-remote-example-ai-designer-board

语言：[English](README.md) | 简体中文

这是一个 AI 设计师实时协作画板示例。后端 Agent 接入 DeepSeek，前端在浏览器注册白板工具，Agent 可以通过 SSE 让浏览器创建、排版、美化、撤销和导出 React Konva 画板元素。

它展示了 Agent Remote 的核心价值：

- 模型 API Key 留在服务端，不暴露给浏览器。
- 浏览器只暴露受控白板工具，而不是开放任意 DOM 操作。
- 工具调用通过 SSE 从服务端实时推送到浏览器。
- 导出、清空等高风险操作会触发客户端确认回调。
- L1 工具直接暴露给模型，L2 高级工具可通过 `search_tools` 动态发现。

## 运行

从仓库根目录执行：

```bash
rush install
rush build
cd examples/ai-designer-board
pnpm dev
```

打开 `http://localhost:3000`。

如果没有配置 `DEEPSEEK_API_KEY`，示例会自动使用本地 scripted LLM fallback，因此 clone 后也能体验完整工具链。

使用 DeepSeek：

```bash
DEEPSEEK_API_KEY=your_key pnpm dev
```

服务端默认使用 `https://api.deepseek.com` 和 `deepseek-chat`。

## 推荐试用 Prompt

- `帮我在画布中间放一个蓝色圆形，直径 200px，并在下方添加文字 Hello World，字号 24px，居中。`
- `把这几个元素水平均匀分布，并给背景加一个深蓝到天蓝的渐变。`
- `把整个画板变成极简风格，并添加一个小型进度图表。`
- `导出为 PNG 并下载。`
- `我不喜欢刚才的修改，回到上一步。`

## 手动验证

1. 不配置 `DEEPSEEK_API_KEY` 启动，确认 scripted prompt 会创建可见画布元素。
2. 配置 `DEEPSEEK_API_KEY` 启动，确认 DeepSeek 会调用浏览器工具。
3. 触发导出，确认浏览器出现高风险操作确认框。
4. 手动拖拽元素后，再让 Agent 继续编辑。
5. 请求撤销，确认画板回到上一步状态。

## 脚本

- `pnpm build`: 使用 tsup 构建服务端和 React 应用。
- `pnpm dev`: 使用 tsx 运行 Express 服务。
- `pnpm test`: 运行 Vitest。
- `pnpm lint`: 运行 `tsc --noEmit`。
