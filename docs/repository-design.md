# agent-remote 代码管理技术方案（Rush Monorepo）

## 1. 概述

本文档定义 `agent-remote` 项目采用 **Rush** 作为 monorepo 管理工具的完整代码工程方案。涵盖仓库结构、Rush 配置、依赖管理、构建策略、版本发布流程及 CI/CD 集成，确保多包协同开发的高效性与一致性。

## 2. 仓库结构

```
agent-remote/
├── rush.json                  # Rush 主配置
├── common/
│   ├── config/
│   │   ├── rush/
│   │   │   ├── pnpm-lock.yaml   # 公共 lockfile（由 Rush 维护）
│   │   │   ├── command-line.json
│   │   │   └── common-versions.json
│   │   └── pnpm/
│   ├── scripts/               # 公共脚本
│   └── git-hooks/             # Git 钩子
├── packages/
│   ├── core/                  # agent-remote-core
│   ├── transport-ws/          # agent-remote-transport-ws
│   ├── transport-sse/         # agent-remote-transport-sse
│   ├── client/                # agent-remote-client
│   ├── server-core/           # agent-remote-server-core
│   ├── server-express/        # agent-remote-server-express
│   ├── server-fastify/        # agent-remote-server-fastify
│   ├── server-node/           # agent-remote-server-node
│   ├── server-redis/          # agent-remote-server-redis
│   └── react/                 # agent-remote-react
├── docs/                      # 文档站点源码（可选）
├── .github/
│   └── workflows/             # CI 定义
├── .gitignore
└── README.md
```

## 3. Rush 基础配置

### 3.1 rush.json 核心字段

```json
{
  "pnpmVersion": "8.15.0",
  "rushVersion": "5.120.0",
  "projectFolderMinDepth": 2,
  "projectFolderMaxDepth": 2,
  "projects": [
    {
      "packageName": "agent-remote-core",
      "projectFolder": "packages/core",
      "reviewCategory": "core"
    },
    {
      "packageName": "agent-remote-transport-ws",
      "projectFolder": "packages/transport-ws",
      "reviewCategory": "transport"
    },
    {
      "packageName": "agent-remote-transport-sse",
      "projectFolder": "packages/transport-sse",
      "reviewCategory": "transport"
    },
    {
      "packageName": "agent-remote-client",
      "projectFolder": "packages/client",
      "reviewCategory": "client"
    },
    {
      "packageName": "agent-remote-server-core",
      "projectFolder": "packages/server-core",
      "reviewCategory": "server-core"
    },
    {
      "packageName": "agent-remote-server-express",
      "projectFolder": "packages/server-express",
      "reviewCategory": "server-adapter"
    },
    {
      "packageName": "agent-remote-server-fastify",
      "projectFolder": "packages/server-fastify",
      "reviewCategory": "server-adapter"
    },
    {
      "packageName": "agent-remote-server-node",
      "projectFolder": "packages/server-node",
      "reviewCategory": "server-adapter"
    },
    {
      "packageName": "agent-remote-server-redis",
      "projectFolder": "packages/server-redis",
      "reviewCategory": "server-adapter"
    },
    {
      "packageName": "agent-remote-react",
      "projectFolder": "packages/react",
      "reviewCategory": "client"
    }
  ]
}
```

- 使用 **pnpm** 作为包管理器，版本固定。
- 所有包统一管理，确保可重复构建。
- `reviewCategory` 用于分组审查和构建。

### 3.2 common-versions.json

统一控制公共依赖版本（如 TypeScript、Vitest）：

```json
{
  "preferredVersions": {
    "typescript": "~5.4.0",
    "vitest": "^1.6.0"
  }
}
```

### 3.3 command-line.json

自定义 Rush 命令（可选）：

```json
{
  "commands": [
    {
      "name": "build:all",
      "commandKind": "bulk",
      "summary": "Build all packages",
      "enableParallelism": true,
      "ignoreMissingScript": false
    },
    {
      "name": "test",
      "commandKind": "bulk",
      "summary": "Run tests in all packages",
      "enableParallelism": true
    },
    {
      "name": "lint",
      "commandKind": "bulk",
      "summary": "Typecheck all packages",
      "enableParallelism": true
    }
  ]
}
```

## 4. 包结构与构建配置

每个包遵循统一结构：

```
packages/<name>/
├── src/               # 源代码 (TypeScript)
│   └── index.ts
├── dist/              # 构建产物 (gitignore)
├── package.json
├── tsconfig.json
├── .npmignore         # 如有需要
└── README.md
```

### 4.1 package.json 示例（agent-remote-core）

```json
{
  "name": "agent-remote-core",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts --clean",
    "dev": "tsup src/index.ts --format cjs,esm --dts --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "peerDependencies": {},
  "devDependencies": {
    "typescript": "^5.4.0",
    "tsup": "^8.0.0",
    "vitest": "^1.6.0"
  }
}
```

- 使用 **tsup** 快速构建，输出 ESM 和 CJS。
- 测试框架 **Vitest**。
- TypeScript 引用项目的 `tsconfig.json` 使用 Rush 的统一配置或各自独立。

### 4.2 依赖关系配置

使用 Rush 的 `strictPeerDependencies` 确保依赖正确性。各包的 `package.json` 中声明内部依赖：

- `agent-remote-transport-ws` -> `agent-remote-core`
- `agent-remote-client` -> `agent-remote-core` + 可选传输包
- `agent-remote-server-core` -> `agent-remote-core`
- `agent-remote-server-express` -> `agent-remote-server-core` + `agent-remote-transport-sse`
- 其他类似。

### 4.3 循环依赖避免

设计上无环：core ← transport ← client/server-core ← adapters。Rush 会验证。

## 5. 开发工作流

### 5.1 初始安装

```bash
# 全局安装 Rush
npm install -g @microsoft/rush
# 克隆仓库后
rush install
```

### 5.2 构建

```bash
rush build          # 增量构建所有项目
rush build -t agent-remote-client   # 构建到指定包及其依赖
```

Rush 根据依赖图自动确定构建顺序。

### 5.3 测试和 Typecheck

```bash
rush test   # 运行每个包的 "test" 脚本
rush lint   # 运行每个包的 TypeScript no-emit 检查
```

### 5.4 添加新包

1. 在 `packages/` 创建目录和 `package.json`。
2. 执行 `rush add -p <packageName>`（若是内部包，则手动修改 `dependencies`，然后 `rush update`）。
3. 在 `rush.json` 中注册项目。

## 6. 版本管理与发布

### 6.1 版本策略

采用 **独立版本**（每个包独立发版），使用 Rush 的 `rush version` 配合 `@microsoft/rush-lib` 中的策略或 **Changesets** 集成。推荐集成 Changesets 实现自动化 changelog 和版本决策。

#### 集成 Changesets

1. 安装 Changesets 作为仓库 devDependency：
   ```bash
   rush add -p @changesets/cli --dev --all
   ```
2. 配置 `.changeset/config.json`，设置 `baseBranch: "master"`，`commit: false`。
3. Rush 可运行自定义命令 `changeset` 来添加变更记录。
4. 发布时，使用 `rush version-packages` 生成版本号和 CHANGELOG，再使用 `rush publish-packages` 发布。

### 6.2 发布流程（基于 Changesets + Rush）

1. 开发者执行 `rush changeset` 创建变更描述文件。
2. CI 或维护者执行：
   ```bash
   rush build
   rush test
   rush lint
   rush version-packages   # 内部调用 changeset version，更新 package.json 和 CHANGELOG
   rush publish-packages   # 内部调用 changeset publish，发布到 npm
   ```
3. 发布后提交版本标签。

### 6.3 版本策略原则

- **主版本**（x.0.0）：破坏性 API 变更。
- **次版本**（0.x.0）：新功能、非破坏性增强。
- **补丁版本**（0.0.x）：BUG 修复。
- 通过 Changesets 的语义化版本自动计算。

### 6.4 npm 包使用教程

公开包使用无 scope 的 `agent-remote-*` 命名。消费者按运行环境安装需要的包：

```bash
npm install agent-remote-client
npm install agent-remote-react agent-remote-client
npm install agent-remote-server-core agent-remote-server-express express
npm install agent-remote-server-core agent-remote-server-fastify fastify
npm install agent-remote-server-core agent-remote-server-node
npm install agent-remote-server-redis redis
```

常用导入入口：

```ts
import { createSSEClient } from "agent-remote-client/sse";
import { useAgentClient } from "agent-remote-react";
import { AgentEngine, SessionManager } from "agent-remote-server-core";
import { createExpressAgentRouter } from "agent-remote-server-express";
```

## 7. CI/CD 集成

使用 GitHub Actions，利用 Rush 的增量构建和缓存加速。

### 7.1 主要工作流（.github/workflows/ci.yml）

```yaml
name: CI
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x]

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - name: Install Rush
        run: npm install -g @microsoft/rush
      - name: Install dependencies
        run: rush install
      - name: Build
        run: rush build --verbose
      - name: Test
        run: rush test --verbose
      - name: Typecheck
        run: rush lint --verbose
```

### 7.2 Rush 的构建缓存

启用 Rush 的云构建缓存（可选，如使用 Azure Blob 或自建），在 CI 中设置环境变量 `RUSH_BUILD_CACHE_CREDENTIAL` 和 `RUSH_BUILD_CACHE_ENABLED=1`，大幅加速重复构建。

## 8. 代码规范与工具

- **TypeScript**：严格模式，统一 `tsconfig.base.json`。
- **Typecheck**：当前 `rush lint` 运行各包的 `tsc --noEmit`，后续可在需要时补充 ESLint。
- **Prettier**：统一格式化，在 `common/config/rush/.prettierrc.js` 中配置，可选结合 `lint-staged`。
- **Git Hooks**：使用 Rush 的自定义命令或 Husky 进行提交前检查（如 `rush lint-staged`）。

## 9. 文档与示例

在仓库根目录的 `docs/` 下使用 Docusaurus 或 VitePress 构建文档站点，并纳入 CI 部署。

## 10. 总结

通过 Rush Monorepo，`agent-remote` 项目能够实现：

- **统一依赖管理**，避免版本冲突，保证构建可重复。
- **增量构建与缓存**，显著提升 CI 效率和本地开发体验。
- **清晰的包边界与发布流程**，独立版本策略让各模块灵活演进。
- **团队协作规范**，通过一致的工具链和配置降低新成员上手成本。

该方案为 `agent-remote` 的长期维护和生态建设奠定了坚实的工程基础。