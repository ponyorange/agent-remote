# AI Designer Board Demo Design

## Summary

Create a new official example project at `examples/ai-designer-board` that demonstrates the core value of `agent-remote`: a server-side AI agent can safely orchestrate browser-side tools in real time. The demo is an "AI designer" collaborative whiteboard where the user chats with an agent and watches it create, arrange, style, undo, and export canvas elements.

The demo will be complete and runnable. It will use Express, SSE, React, React Konva, the existing Agent Remote client and React packages, and the existing OpenAI-compatible server client configured for DeepSeek. When `DEEPSEEK_API_KEY` is not set, the example falls back to a scripted local LLM client so contributors can run the full tool chain without external credentials.

## Goals

- Showcase that Agent Remote gives a backend agent controlled "hands" inside the browser.
- Register at least ten whiteboard tools from the frontend, including L1 core tools and L2 discoverable tools.
- Demonstrate high-risk browser actions through the SDK confirmation callback.
- Demonstrate DeepSeek as the real model provider through an OpenAI-compatible API.
- Keep the example aligned with the repository's Express + SSE + React patterns and Rush workspace conventions.
- Keep the example testable in CI without requiring a live DeepSeek key.

## Non-Goals

- Do not build production authentication, multiplayer presence, Redis-backed state, or cloud persistence.
- Do not implement both SSE and WebSocket transports in this first version.
- Do not add a full end-to-end browser automation suite for canvas export.
- Do not change the public protocol or package APIs unless implementation exposes a blocking gap.

## Project Structure

The new package will live at `examples/ai-designer-board`.

Planned files:

- `package.json`: private Rush example package with build, dev, test, and lint scripts.
- `tsconfig.json`: extends the repo TypeScript base config.
- `README.md` and `README.zh-CN.md`: explain the demo, DeepSeek setup, fallback mode, and manual verification.
- `src/server.ts`: Express app, Agent Remote router, DeepSeek/fallback LLM selection, observer logging, and static frontend serving.
- `src/App.tsx`: page shell, chat input, connection status, sample prompts, and confirmation UI wiring.
- `src/DesignerBoard.tsx`: React Konva stage, layers, element rendering, selection, dragging, and export ref.
- `src/boardState.ts`: board element types, reducer, history stack, and pure helper functions.
- `src/tools.ts`: Agent Remote tool definitions and handlers bound to board actions.
- `src/samplePrompts.ts`: curated prompt buttons for demo flows.
- `test/boardState.test.ts`: reducer and helper coverage.
- `test/smoke.test.ts`: server health and Agent Remote smoke coverage with fallback LLM.

The package will be added to `rush.json` and picked up by `pnpm-workspace.yaml` through the existing `examples/*` pattern.

## Architecture

The demo keeps the same high-level shape as the repository's Express + SSE + React pattern:

1. The browser creates an SSE client with `createSSEClient`.
2. React manages the client lifecycle with `useAgentClient`.
3. The browser registers whiteboard tools through Agent Remote.
4. The user sends a natural language prompt.
5. Express routes the message to `AgentEngine`.
6. `AgentEngine` asks the LLM client to respond with text or tool calls.
7. Tool calls are streamed to the browser over SSE.
8. The browser executes Konva-backed tools and posts tool results.
9. The server continues the loop until the assistant returns a message.

The service uses `SessionManager`, `InMemoryStore`, and `LocalBroker`. This keeps the demo single-instance and easy to run while still showing the same session abstractions that can later be swapped for Redis.

## DeepSeek and Fallback LLM

`src/server.ts` will expose a small LLM factory:

- If `DEEPSEEK_API_KEY` is present, construct `OpenAILLMClient` with:
  - `baseUrl: "https://api.deepseek.com"`
  - `model: "deepseek-chat"`
  - `apiKey: process.env.DEEPSEEK_API_KEY`
- If the key is missing, construct `ScriptedDesignerLLMClient`.

The scripted client will return deterministic tool calls for common Chinese and English demo prompts:

- Create a blue circle and "Hello World" text.
- Arrange selected or known elements evenly.
- Set a gradient background.
- Apply a minimalist style preset.
- Export the canvas.
- Undo the last operation.

The example will avoid public API changes for system prompts. DeepSeek mode will use a small demo-local `DesignerLLMClient` wrapper around the OpenAI-compatible chat request shape. That wrapper will prepend a system message before forwarding messages to DeepSeek. The instruction will tell the model to prefer browser tools, call `get_canvas_state` before context-dependent edits, and use `search_tools` to discover advanced L2 tools. Fallback mode will follow the same behavior internally through deterministic scripted responses.

## Frontend State Model

The board state will be a plain React state object:

- `elements`: array of shape, text, and chart elements.
- `selectedIds`: selected element IDs.
- `background`: solid color or linear gradient.
- `history`: previous board snapshots for undo.

All mutations go through reducer-style actions in `boardState.ts`. Tool calls and manual drag operations use the same action path, so the agent can continue from user-edited state. `get_canvas_state` returns a compact JSON summary with dimensions, background, elements, and selected IDs.

Element IDs are generated in the browser and returned in tool results. Tool handlers validate required arguments and return structured data that the LLM can use in later calls.

## Frontend Components

`App.tsx` will own:

- Agent client creation and connection state.
- Chat prompt input and assistant messages.
- Sample prompt buttons.
- Tool confirmation state.
- Error display for connection errors, rejected tool calls, and handler failures.

`DesignerBoard.tsx` will own:

- Konva `Stage` and `Layer` rendering.
- Shape, text, and simple chart rendering.
- Selection and drag updates.
- Background rendering.
- PNG export through the Konva stage ref.

The UI should feel like a compact product demo: canvas on the left or center, conversation and tool activity on the side, status and sample prompts visible without clutter.

## Browser Tool Catalog

L1 core tools:

- `get_canvas_state`: return the current board summary.
- `create_shape`: create rectangle, circle, or rounded rectangle elements.
- `create_text`: create editable text-like canvas elements.
- `update_element`: update common properties such as color, text, font size, rotation, or opacity.
- `move_element`: move an element by ID or absolute position.
- `delete_element`: remove an element.
- `arrange_evenly`: distribute elements horizontally or vertically.
- `set_background_gradient`: set a linear gradient background.
- `undo`: restore the previous board snapshot.

L2 discoverable tools:

- `apply_style_preset`: apply visual presets such as minimalist, playful, or neon.
- `create_chart`: create a simple bar chart or progress-style visualization.
- `duplicate_element`: clone an existing element with an offset.
- `align_elements`: align selected elements by left, center, right, top, middle, or bottom.

High-risk or L3 tools:

- `export_canvas`: export PNG and trigger browser download.
- `clear_canvas`: clear the entire board.

`export_canvas` and `clear_canvas` will set `risk: "high"` or `level: "L3"` so `BrowserAgentClient` calls `confirmToolCall`. The confirmation dialog will show the tool name and arguments before execution.

## Tool Levels and Search

Core creation and editing tools will be L1 so the LLM sees them directly. Advanced styling and chart tools will be L2 so the server's built-in `search_tools` path can demonstrate dynamic discovery. The README will include a prompt that encourages the model to use advanced tools, such as "把整个画板变成极简风格，并添加一个小型进度图表".

This demonstrates how Agent Remote can keep the initial tool surface small while still allowing a larger browser capability set.

## Error Handling and Observability

Frontend:

- Show connection status from `useAgentClient`.
- Show the last assistant message.
- Show tool rejection and execution errors in a small activity panel.
- Keep the canvas interactive even if a single tool call fails.

Server:

- `/health` returns `{ ok: true }`.
- `AgentEngineObserver` logs LLM request summaries, LLM responses, and tool calls.
- DeepSeek failures return normal server errors for development visibility.
- Fallback mode logs that scripted LLM is active.

The observer logs are part of the safety story: browser operations go through the server loop and can be audited without exposing the model API key to the browser.

## Testing

Automated tests:

- `boardState` reducer tests for create, move, update, arrange, undo, and clear.
- Server smoke test for `/health`.
- Agent Remote smoke test using the fallback LLM to verify that a registered tool can be called after a user message.
- Build smoke test matching the existing example conventions.

Manual verification documented in README:

1. Start the example without `DEEPSEEK_API_KEY` and run the scripted prompt.
2. Start the example with `DEEPSEEK_API_KEY` and verify DeepSeek calls browser tools.
3. Create the blue circle and Hello World text prompt.
4. Apply gradient background and even distribution.
5. Trigger `export_canvas` and confirm the dialog.
6. Trigger `undo` and verify the previous board state returns.

## Success Criteria

- `rush build` includes the new example.
- `rush test -t agent-remote-example-ai-designer-board` passes without external credentials.
- `pnpm dev` inside the example starts a working Express server and frontend.
- The browser registers at least ten tools.
- Fallback mode performs visible canvas actions from natural language prompts.
- DeepSeek mode uses `DEEPSEEK_API_KEY` without exposing it to the browser.
- High-risk tools require user confirmation before execution.
- README files explain why this demo demonstrates Agent Remote better than a pure frontend agent or traditional backend-only agent.
