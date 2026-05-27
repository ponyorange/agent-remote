# agent-remote-example-ai-designer-board

Language: English | [简体中文](README.zh-CN.md)

This example is an AI designer whiteboard. A server-side agent powered by DeepSeek can call browser-registered tools to create, arrange, style, undo, and export React Konva canvas elements.

It demonstrates why Agent Remote is useful:

- The model API key stays on the server.
- The browser exposes controlled whiteboard tools instead of raw DOM access.
- Tool calls stream from the server to the browser over SSE.
- High-risk browser actions use the client confirmation callback.
- L1 tools are visible immediately, while L2 tools can be discovered through `search_tools`.

## Run

From the repository root:

```bash
rush install
rush build
cd examples/ai-designer-board
pnpm dev
```

Open `http://localhost:3000`.

Without `DEEPSEEK_API_KEY`, the demo uses a scripted local LLM fallback. This keeps the example runnable in CI and for first-time contributors.

To use DeepSeek:

```bash
DEEPSEEK_API_KEY=your_key pnpm dev
```

The server uses `https://api.deepseek.com` and `deepseek-chat` by default.

## Try These Prompts

- `帮我在画布中间放一个蓝色圆形，直径 200px，并在下方添加文字 Hello World，字号 24px，居中。`
- `把这几个元素水平均匀分布，并给背景加一个深蓝到天蓝的渐变。`
- `把整个画板变成极简风格，并添加一个小型进度图表。`
- `导出为 PNG 并下载。`
- `我不喜欢刚才的修改，回到上一步。`

## Manual Verification

1. Run without `DEEPSEEK_API_KEY` and verify the scripted prompt creates visible canvas elements.
2. Run with `DEEPSEEK_API_KEY` and verify DeepSeek calls browser tools.
3. Trigger export and confirm the browser confirmation dialog.
4. Drag an element manually, then ask the agent to continue editing.
5. Ask for undo and verify the previous board state returns.

## Scripts

- `pnpm build`: bundle the server and React app with tsup.
- `pnpm dev`: run the Express server with tsx.
- `pnpm test`: run Vitest.
- `pnpm lint`: run `tsc --noEmit`.
