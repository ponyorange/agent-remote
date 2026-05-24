# @agent-remote/react

React helpers for managing a `BrowserAgentClient` lifecycle.

## Usage

```tsx
import { createSSEClient } from "@agent-remote/client/sse";
import { useAgentClient } from "@agent-remote/react";

const agent = useAgentClient(() => createSSEClient(config), {
  disconnectOnUnmount: true
});
```

The hook exposes status, last assistant message, errors, registration helpers, and cleanup through `dispose`.
