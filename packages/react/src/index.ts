import { useMemo } from "react";
import type { BrowserAgentClient } from "@agent-remote/client";

export interface UseAgentClientOptions {
  enabled?: boolean;
}

export function createAgentClientState<TClient>(
  client: TClient,
  options: UseAgentClientOptions = {}
): TClient | null {
  return options.enabled === false ? null : client;
}

export function useAgentClient<TClient extends BrowserAgentClient>(
  createClient: () => TClient,
  options: UseAgentClientOptions = {}
): TClient | null {
  return useMemo(() => createAgentClientState(createClient(), options), [createClient, options.enabled]);
}
