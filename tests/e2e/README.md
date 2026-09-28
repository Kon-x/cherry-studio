# E2E Testing Guide

This directory contains end-to-end (E2E) tests for the Cherry Studio Electron application using Playwright.

## Critical-path regression

Cross-platform validation of development branches and release installers uses a separate
[regression workflow](regression/README.md), which reuses a controller-owned application
process through CDP. `pnpm test:e2e` runs the existing smoke suite described below;
`pnpm test:e2e:regression` runs the regression scenarios.

## Directory structure

```text
tests/e2e/
├── README.md                 # 本文档
├── global-setup.ts           # 全局测试初始化
├── global-teardown.ts        # 全局测试清理
├── fixtures/
│   ├── electron.fixture.ts   # 隔离配置、窗口定位、日志和 trace
│   ├── chat.fixture.ts       # 通过真实 DataApi 配置本地模型
│   ├── local-server.ts       # 本地聊天、嵌入和登录服务
│   └── mcp-server.mjs        # 需要审批的本地 MCP 工具
├── utils/
│   ├── wait-helpers.ts       # 等待辅助函数
│   ├── ui-locator.ts         # data-ui contract locator
│   ├── ipc.ts                # 真实 preload / IPC 测试入口
│   └── index.ts              # 工具导出
└── specs/                    # 测试用例
    ├── app-launch.spec.ts    # 启动台和帮助链接
    ├── cache-cleanup.spec.ts # 受限内存下统计大体积旧数据并反复打开弹窗
    ├── chat.spec.ts          # 流式聊天、MCP 审批和 HTML 预览
    ├── knowledge.spec.ts     # 索引与召回
    └── provider-login.spec.ts # 登录窗口的代理、语言与 UA
```

---

## Running tests

### Smoke suite

1. 安装依赖：`pnpm install`
2. 构建应用：`pnpm build`
3. 若此前运行过 Node 单元测试，执行 `pnpm rebuild:electron` 恢复 Electron 的 SQLite 原生模块。

`Build Windows x64` 在原生打包完成后运行这些测试。每个测试使用独立临时用户目录和
`CS_DEV_USER_DATA_SUFFIX`，关闭自己创建的 Electron 实例后清理该目录。模型、嵌入与 MCP 使用本地
测试服务；登录页面重定向到本地测试服务，帮助链接只记录系统浏览器交接，不使用真实账号。
CI 上传主进程日志、失败截图和 Playwright trace，报告位于 `electron-verification-<run-id>` 产物。

缓存统计回归通过夹具的 `extraElectronArgs` 将该用例的 V8 堆限制为 512 MiB，启动后写入含
32 MiB 二进制记录的 v1 测试库，再反复打开清理弹窗，检查页面、进程和保留数据。其他用例使用默认启动参数。

#### Prerequisites

1. Install dependencies: `pnpm install`
2. Build the application: `pnpm build`

#### Commands

```bash
# Run the smoke suite
pnpm test:e2e

# Run with visible windows
pnpm test:e2e --headed

# Run a specific test file
pnpm playwright test tests/e2e/smoke/appLaunch.test.ts

# 运行匹配名称的测试
pnpm playwright test -g "fresh profiles"

# Run in debug mode (pauses execution and opens the debugger)
pnpm playwright test --debug

# Use Playwright UI mode
pnpm playwright test --ui

# View the test report
pnpm playwright show-report
```

### Critical-path regression suite

Use the [regression workflow](../../.github/workflows/e2e-regression-test.yml) for hosted macOS and Windows runs.
It prepares the application, isolated run directory, and provider configuration before running the scenarios.
`pnpm test:e2e:regression` selects the regression config, but does not perform that preparation itself:
execution requires `CHERRY_TEST_RUN_DIR` to point to an initialized controller run.
See the [scenario guide](regression/README.md) and [controller guide](../../scripts/e2e/regression/README.md)
for phase execution and configuration. Do not use the smoke suite's launch fixture for regression scenarios.

## Writing E2E tests

Test design and review follow the [Frontend Testing Guidelines](../../docs/references/testing/frontend-testing.md).

### Smoke suite

The smoke suite uses the following Electron E2E infrastructure:

- Import fixtures and assertions from `smoke/fixtures/electron.fixture.ts`: `test`, `expect`, `electronApp`, and `mainWindow`.
- Use `smoke/utils/uiLocator.ts` to locate stable application boundaries defined in the
  [UI Semantic Contract](../../docs/references/components/ui-semantic-contract.md).
- Refer to `playwright.config.ts` in the repository root for runtime settings.

### Critical-path regression suite

- Place numbered phase tests and domain helpers in `regression/`.
- Import `test` and `expect` from `regression/fixture.ts` in scenarios; use its `app` and `mainWindow` fixtures.
- Register cases in `scripts/e2e/regression/cases.ts` and follow the [scenario guide](regression/README.md).
- Use `playwright.regression.config.ts`, not the smoke suite's `playwright.config.ts`.

New E2E tests should verify complete user outcomes across processes using stable semantic locators and observable conditions.

---

## Configuration

The smoke suite is configured in `playwright.config.ts` in the repository root:

- `testDir`: 测试目录 (`./tests/e2e/specs`)
- `timeout`: 测试超时 (120秒)
- `workers`: 并发数 (1，Electron 需要串行)
- `retries`: 重试次数 (CI 环境下为 2)

---

## Related documentation

- [Playwright documentation](https://playwright.dev/docs/intro)
- [Playwright Electron testing](https://playwright.dev/docs/api/class-electron)
