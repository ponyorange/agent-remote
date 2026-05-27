import { defineConfig } from "tsup";

const browserNoExternal = [
  "react",
  "react-dom",
  "agent-remote-client",
  "agent-remote-react",
  "agent-remote-core",
  "agent-remote-transport-sse",
  "react-konva",
  "konva"
];

export default defineConfig([
  {
    entry: ["src/server.ts"],
    format: ["esm"],
    platform: "node",
    clean: true
  },
  {
    entry: ["src/App.tsx"],
    format: ["esm"],
    platform: "browser",
    splitting: false,
    clean: false,
    noExternal: browserNoExternal
  }
]);
