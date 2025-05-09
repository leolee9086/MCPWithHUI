# mcpAllinBrowserTest - AInote.md

## 目的

这个测试项目用于在浏览器环境中端到端地测试以下 MCP (Model Context Protocol) 传输实现，使用 Vite 作为开发服务器和构建工具：

1.  **BroadcastChannel Transport** (`BroadcastChannelClientTransport` 和 `BroadcastChannelServerTransport`)
2.  **WebRTC Transport** (`WebRTCClientTransport` 和 `WebRTCServerTransport`)

测试的目标是验证客户端 (`HuiMcpClient`) 和服务端 (`HuiMcpServer`) 能否通过这些纯浏览器内的传输机制成功建立连接、注册和调用工具。

## 项目结构

-   `index.html`: 测试的入口 HTML 页面。它会加载 `test-transports.js`。
-   `test-transports.js`: 核心的 JavaScript 测试逻辑。它会：
    -   通过包名导入 `@mcpwithhui/hui` 提供的 `HuiMcpClient`, `HuiMcpServer`。
    -   通过指向 `@mcpwithhui/hui/dist/browser/` 内具体文件的路径导入各个 Transport 类。
    -   模拟客户端和服务端在同一个浏览器 JS 环境中运行。
    -   为 `HuiMcpServer` 注册一个简单的 `echo` 工具。
    -   分别对 `BroadcastChannel` 和 `WebRTC` 进行连接和工具调用测试。
    -   将测试过程和结果输出到页面和控制台。
-   `package.json`: 项目的配置文件，定义了依赖 (Vite, @mcpwithhui/hui) 和 npm 脚本 (dev, build, preview)。
-   `vite.config.js`: Vite 的配置文件，目前比较简单。
-   `node_modules/` (目录，通过 `npm install` 或类似命令生成): 包含 Vite 和一个指向 `../packages/hui` 的符号链接 `@mcpwithhui/hui`。

## 测试步骤

1.  **构建 `@mcpwithhui/hui` 包 (如果尚未构建或有更新)**:
    确保在 `MCPWithHUI/packages/hui/` 目录下运行了 `npm run build` (或其他等效的构建命令)，以生成 `dist/browser/` 目录下的所有 `.esm.js` 文件。这是因为我们的测试会直接从该 `dist` 目录导入 Transport 文件。

2.  **安装测试项目依赖**:
    在命令行中，导航到 `MCPWithHUI/mcpAllinBrowserTest/` 目录。
    运行 `npm install` (或 `pnpm install` / `yarn install`)。这将安装 Vite 并创建到 `@mcpwithhui/hui` 本地包的链接。

3.  **运行测试开发服务器**:
    在 `MCPWithHUI/mcpAllinBrowserTest/` 目录下，运行:
    ```bash
    npm run dev
    ```
    Vite 会启动一个开发服务器 (通常在 `http://localhost:5173` 或类似地址)，并自动在浏览器中打开 `index.html`。

4.  **查看结果**:
    -   页面上会显示每个传输测试的实时状态和日志。
    -   浏览器的开发者控制台也会输出详细的日志信息。

## 注意事项

-   **Vite Dev Server**: 使用 Vite 开发服务器 (`npm run dev`) 是推荐的运行方式，它能解决模块加载和 CORS 问题。
-   **`@mcpwithhui/hui` 构建**: 必须先构建 `packages/hui`，因为 `test-transports.js` 中的导入直接指向 `packages/hui/dist/browser/` 内的文件。
-   **WebRTC 信令**: 在 `test-transports.js` 中，WebRTC 的信令仍通过 `setTimeout` 模拟。在实际应用中需要真正的信令机制。
-   **`JSONRPCMessageSchema` 导入**: Transport 文件内部对 `@modelcontextprotocol/sdk/types.js` 的依赖需要能被正确解析。Vite 应该能处理好从 `node_modules` 解析这些依赖。

## 2025-05-09 (织)
- 创建了 `index.html`, `test-transports.js`, 和本 `AInote.md` 文件 (初始版本)。
- 指导用户如何准备 `libs` 目录和运行测试 (旧方法)。

## 2025-05-09 16:56:23 (织)
- 更新 `AInote.md` 中的"测试步骤"，强调由于浏览器 CORS 策略，需要使用本地 HTTP 服务器来运行 `index.html` (旧方法)。

## 2025-05-09 17:00:07 (织)
- **引入 Vite 进行测试!**
- 在 `mcpAllinBrowserTest` 目录下创建了 `package.json`，添加了 Vite 作为开发依赖，并将 `@mcpwithhui/hui` 作为本地文件依赖。
- 创建了基础的 `vite.config.js`。
- 修改了 `test-transports.js` 的导入语句，使其通过 `@mcpwithhui/hui` 包名或其下的具体 `dist` 路径导入所需模块，从而不再需要手动复制 `libs` 目录。
- 更新了本 `AInote.md` 的"项目结构"和"测试步骤"部分，以反映使用 Vite 的新流程。
- 移除了关于手动创建 `libs` 目录和使用 `http-server` 或 Python 服务器的旧说明。

## 2025-05-09 19:46:52 (织)
- **修复 Vite 导入分析错误**:
  - `test-transports.js` 中 `HuiMcpClient` 的导入从 `@mcpwithhui/hui/dist/browser/hui-client.esm.js` 修改为 `@mcpwithhui/hui/client-browser`。
  - 这个修改是为了利用 `@mcpwithhui/hui` 包在其 `package.json` 中定义的 `exports` 别名，以期解决 Vite 报告的 "Missing specifier" 错误。
  - `HuiMcpServer` 的导入路径 `@mcpwithhui/hui/dist/browser/hui-server.esm.js` 保持不变，因为它已在 `package.json` 的 `exports` 中被正确导出。

## 2025-05-09 22:18:54 (织)
- **改进 WebRTC 测试的稳定性**:
  - 在 `test-transports.js` 中添加了 `waitForDataChannelOpen` 辅助函数。
  - 这个函数通过轮询检查 WebRTC 数据通道的 `readyState`，替代了之前固定的 `setTimeout` 等待机制。
  - `testWebRTC` 函数现在会调用此辅助函数来等待客户端和服务器的 DataChannel 都进入 'open' 状态，然后再执行后续的工具调用测试，从而减少因数据通道未就绪导致的测试失败。
  - 这样可以更可靠地等待 WebRTC 连接建立，提高测试的准确性。

## 2025-05-09 22:22:17 (织)
- **增强 WebRTC 测试的健壮性和调试信息**:
  - 在 `testWebRTC` 函数中，当 `waitForDataChannelOpen` 报告客户端数据通道已打开后，立即进行了一次额外的、更严格的状态检查。
  - 如果此次检查发现客户端数据通道的 `readyState` 并非 `'open'`，测试将抛出一个新的、带有 `[Critical]` 标记的错误，明确指出状态不一致的问题。
  - 为服务器端数据通道的状态日志也增加了更多细节，无论其 `waitForDataChannelOpen` 的结果如何，都会尝试记录其后续的实际状态，并在发现不一致时给出警告。
  - 目的是更精确地定位 WebRTC 数据通道在测试过程中状态不稳定的根本原因。

## 2025-05-09 22:26:05 (织)
- **尝试同步WebRTC信令以诊断过早关闭问题**:
  - 根据日志分析，`WebRTCClientTransport` 在发送 offer 后几乎立即自行关闭，远早于服务器响应。
  - 怀疑其内部可能存在对信令异步处理不当或超时过于敏感的问题。
  - 在 `testWebRTC` 函数中，将客户端和服务器的 `onsignal` 处理器中的 `setTimeout(() => otherTransport.handleSignal(signal), 0)` 修改为直接调用 `otherTransport.handleSignal(signal)`。
  - 此修改的目的是使信令处理在当前事件循环中同步执行，以测试 `WebRTCClientTransport` 是否因此能正确完成握手过程，而不是过早关闭。
  - 这是一项诊断性改动，旨在判断问题是否与信令传递的微小延迟有关。

## 2025-05-09 22:32:43 (织)
- **关键修复: 修改 `WebRTCClientTransport.start()` 以等待数据通道实际打开**:
  - 分析 `WebRTCClientTransport.ts` 源码后发现，其 `start()` 方法在发送 `offer` 后即返回，未等待数据通道 (`RTCDataChannel`) 完全建立并通过 `onopen` 事件确认。
  - 这是导致 `HuiMcpClient` 在 `connect()` 后立即尝试使用 transport 时（如调用 `listTools`）出现 "Data channel is not open" 错误的主要原因。
  - **具体修改 (`MCPWithHUI/packages/hui/src/transportsForBrowser/client/webRTCClientTransport.ts`)**:
    1.  在 `start()` 方法内部，于 `this.onsignal({ type: 'offer', ... })` 之后，添加了 `await this._dataChannelOpenPromise;`。这将使 `start()` 方法的 Promise 等待内部的 `_dataChannelOpenPromise`（该 Promise 由数据通道的 `onopen` 事件 resolve）完成后才 resolve。
    2.  在 `close()` 方法的开头，添加了对 `this._rejectDataChannelOpenPromise(...)` 的调用。这确保了如果在 `start()` 等待数据通道打开的过程中 transport 被关闭，等待可以被正确中断，避免无限挂起。
  - **预期效果**: 此修改将确保 `WebRTCClientTransport.start()` (并因此 `HuiMcpClient.connect()`) 仅在 WebRTC 数据通道完全准备好数据传输后才完成，从而解决之前的测试失败问题。

## 2025-05-09 22:37:37 (织)
- **修正 `callTool` 参数并恢复WebRTC测试脚本的先前状态**:
  - 根据用户反馈，之前将 `callTool` 的参数字段从 `arguments` 修改为 `input` 是错误的。正确的字段名应为 `arguments`。
  - **具体修改 (`MCPWithHUI/mcpAllinBrowserTest/test-transports.js`)**:
    1.  在 `testBroadcastChannel` 函数中，调用 `bcClient.callTool` 时，参数字段已从 `input` 改回 `arguments`。
    2.  在 `testWebRTC` 函数中，调用 `rtcClient.callTool` 时，参数字段从 `input` 修改为 `arguments`，以确保和服务端预期一致。
    3.  恢复了 `testWebRTC` 函数中 `onsignal` 处理器内的 `setTimeout` 调用，用于异步处理信令。
    4.  移除了在 `testWebRTC` 中 `waitForDataChannelOpen` 之后添加的额外严格的数据通道状态检查，恢复到之前的日志记录方式。
  - **目的**: 纠正先前对参数字段的错误修改，并使测试脚本行为与用户原始意图或先前有效状态一致，以便更准确地诊断工具调用参数问题。

## 2025-05-09 22:40:07 (织)
- **WebRTC 问题持续，初步判断为客户端连接逻辑缺陷**:
  - 即使将信令处理改为同步，`WebRTCClientTransport` 依然在服务器完整响应前报错 "Data channel is not open"。
  - 日志显示客户端在发送 `offer` 后，未等待服务器的 `answer` 和 `candidates` 完成ICE协商并建立数据通道，就过早地尝试使用（或期望已可用）数据通道。
  - 这强烈暗示 `WebRTCClientTransport` 或 `HuiMcpClient` 中处理 WebRTC 连接建立的逻辑未能正确等待数据通道的 `open` 状态。
  - **下一步行动**: 需要审查 `WebRTCClientTransport.js` 的源码，特别是其 `connect` 方法、`RTCPeerConnection` 状态管理以及数据通道建立和事件通知部分，以定位问题。

## 2025-05-09 22:42:43 (织)
- **关键修复: 修改 `WebRTCClientTransport.start()` 以等待数据通道实际打开**:
  - 分析 `WebRTCClientTransport.ts` 源码后发现，其 `start()` 方法在发送 `offer` 后即返回，未等待数据通道 (`RTCDataChannel`) 完全建立并通过 `onopen` 事件确认。
  - 这是导致 `HuiMcpClient` 在 `connect()` 后立即尝试使用 transport 时（如调用 `listTools`）出现 "Data channel is not open" 错误的主要原因。
  - **具体修改 (`MCPWithHUI/packages/hui/src/transportsForBrowser/client/webRTCClientTransport.ts`)**:
    1.  在 `start()` 方法内部，于 `this.onsignal({ type: 'offer', ... })` 之后，添加了 `await this._dataChannelOpenPromise;`。这将使 `start()` 方法的 Promise 等待内部的 `_dataChannelOpenPromise`（该 Promise 由数据通道的 `onopen` 事件 resolve）完成后才 resolve。
    2.  在 `close()` 方法的开头，添加了对 `this._rejectDataChannelOpenPromise(...)` 的调用。这确保了如果在 `start()` 等待数据通道打开的过程中 transport 被关闭，等待可以被正确中断，避免无限挂起。
  - **预期效果**: 此修改将确保 `WebRTCClientTransport.start()` (并因此 `HuiMcpClient.connect()`) 仅在 WebRTC 数据通道完全准备好数据传输后才完成，从而解决之前的测试失败问题。

## 2025-05-09 22:38:57 (织)
- **收到并配置思源 API Token**:
  - 用户提供了思源笔记的 API Token。
  - 未来的开发笔记将尝试使用此 Token写入思源每日笔记。

## 2025-05-09 22:39:48 (织)
- **查询并推测思源每日笔记ID**:
  - 用户提示可以直接查询笔记本ID。
  - 调用 `mcp_zhiToolboxServer_getSiyuanNotebooks` 工具成功获取了 27 个笔记本列表。
  - 在列表中发现名为 "日记" 的笔记本，ID 为 `20240229223635-3pims88`。
  - 初步推测此笔记本为用于写入每日笔记的目标笔记本，等待用户确认或指定其他ID。 