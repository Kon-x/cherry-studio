# E2E Testing Guide

本目录包含 Cherry Studio 的端到端 (E2E) 测试，使用 Playwright 测试 Electron 应用。

## 目录结构

```
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

## 运行测试

### 前置条件

1. 安装依赖：`pnpm install`
2. 构建应用：`pnpm build`
3. 若此前运行过 Node 单元测试，执行 `pnpm rebuild:electron` 恢复 Electron 的 SQLite 原生模块。

`Build Windows x64` 在原生打包完成后运行这些测试。每个测试使用独立临时用户目录和
`CS_DEV_USER_DATA_SUFFIX`，关闭自己创建的 Electron 实例后清理该目录。模型、嵌入与 MCP 使用本地
测试服务；登录页面重定向到本地测试服务，帮助链接只记录系统浏览器交接，不使用真实账号。
CI 上传主进程日志、失败截图和 Playwright trace，报告位于 `electron-verification-<run-id>` 产物。

缓存统计回归通过夹具的 `extraElectronArgs` 将该用例的 V8 堆限制为 512 MiB，启动后写入含
32 MiB 二进制记录的 v1 测试库，再反复打开清理弹窗，检查页面、进程和保留数据。其他用例使用默认启动参数。

### 运行命令

```bash
# 运行所有 e2e 测试
pnpm test:e2e

# 带可视化窗口运行（可以看到测试过程）
pnpm test:e2e --headed

# 运行特定测试文件
pnpm playwright test tests/e2e/specs/app-launch.spec.ts

# 运行匹配名称的测试
pnpm playwright test -g "fresh profiles"

# 调试模式（会暂停并打开调试器）
pnpm playwright test --debug

# 使用 Playwright UI 模式
pnpm playwright test --ui

# 查看测试报告
pnpm playwright show-report
```

## 编写 E2E 测试

测试设计和审查统一遵守[前端测试规范](../../docs/references/testing/frontend-testing.md)。本目录只提供
Electron E2E 基础设施：

- 从 `fixtures/electron.fixture.ts` 导入 `test`、`expect`、`electronApp` 和 `mainWindow`。
- 使用 `utils/ui-locator.ts` 定位
  [UI Semantic Contract](../../docs/references/components/ui-semantic-contract.md)中的稳定应用边界。
- 运行参数以根目录 `playwright.config.ts` 为准。

新增 E2E 应围绕跨进程的完整用户结果，直接使用稳定的语义定位器和可观察条件。

---

## 配置文件

主要配置在项目根目录的 `playwright.config.ts`：

- `testDir`: 测试目录 (`./tests/e2e/specs`)
- `timeout`: 测试超时 (120秒)
- `workers`: 并发数 (1，Electron 需要串行)
- `retries`: 重试次数 (CI 环境下为 2)

---

## 相关文档

- [Playwright 官方文档](https://playwright.dev/docs/intro)
- [Playwright Electron 测试](https://playwright.dev/docs/api/class-electron)
