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

## 2025-05-09 22:43:22 (织)
- **调查 Transport 间潜在的"串台" (Crosstalk) 问题**:
  - 用户反馈尽管测试通过，但怀疑 BroadcastChannel 和 WebRTC transport 之间可能存在消息串扰。
  - **初步分析**: 最可能的原因是前一个测试 (BroadcastChannel) 的资源未被完全清理，特别是 `BroadcastChannel` 对象本身可能未被正确关闭，导致其监听器仍在接收消息，或者影响后续测试的环境。
  - **调查重点**: `BroadcastChannelClientTransport.ts` 和 `BroadcastChannelServerTransport.ts` 的 `close()` 方法实现，需要确认它们是否：
    1.  正确移除了 `BroadcastChannel` 实例上的 `onmessage` 监听器。
    2.  调用了 `BroadcastChannel` 实例自身的 `close()` 方法。
  - **下一步**: 请求用户提供上述两个 transport 的源码，以便进行详细检查。

## 2025-05-09 22:45:20 (织)
- **深入探讨 Transport "串台"问题与 1:1 连接的必要性**:
  - 用户进一步指出，串台问题可能源于 Transport 未实现严格的 1:1 连接，例如缺少类似会话ID的机制。
  - **针对 BroadcastChannel 的分析**:
    - `BroadcastChannel` API 基于共享的频道名称通信，本身并非严格 1:1。
    - MCP/JSON-RPC的 `id` 字段能确保请求和响应的配对，客户端可以忽略不属于自己的响应。
    - 但如果多个服务端实例监听同一频道，它们都可能收到同一个请求。如果多个客户端实例监听，也可能都收到同一个回复（尽管只有发起请求的客户端会处理它）。
    - 要实现严格的 1:1，可能需要在 Transport 层面为每个连接对生成唯一的频道名，或在消息信封中加入会话标识，并在接收端校验。
  - **针对 WebRTC 的分析**:
    - `RTCPeerConnection` 设计上是 1:1 的，信令交换成功后建立的是点对点连接。
    - 只要实例管理和信令正确配对，WebRTC 本身不太可能因缺少会话ID而串台。
  - **当前测试脚本的串台疑虑**:
    - **疑虑1 (资源未释放)**: 前一个测试（BroadcastChannel）的 Transport 未完全关闭，其监听器仍在活动，可能接收或干扰后续测试（WebRTC）的消息。这是目前的主要怀疑方向。
    - **疑虑2 (BroadcastChannel 的非独占性)**: 如果测试脚本（或被测库的更深层）意外地创建了多个 BroadcastChannel 实例监听同一个频道，即使 MCP 的 `id` 能区分响应，也可能导致不必要的重复消息处理或日志干扰。
  - **行动计划调整**: 
    1.  **首要**: 仍然需要检查 `BroadcastChannelClientTransport.ts` 和 `BroadcastChannelServerTransport.ts` 的 `close()` 方法，确保资源（特别是 `BroadcastChannel` 实例和其消息监听器）被彻底清理。
    2.  如果资源清理无误，再审视 BroadcastChannel Transport 是否需要更强的会话隔离机制来满足测试或应用场景的需求。
    3.  同时，再次确认 WebRTC 部分的实例创建和信令传递逻辑，确保没有意外的交叉。 

## 2025-05-09 22:47:17 (织)
- **BroadcastChannel Transport 源码审查结论与串台问题再分析**:
  - **审查结果**: `BroadcastChannelClientTransport.ts` 和 `BroadcastChannelServerTransport.ts` 的 `close()` 方法实现正确，均包含了移除 `onmessage` 监听器和调用 `BroadcastChannel` 实例的 `close()` 方法。
  - **初步结论**: 从代码上看，BroadcastChannel Transport 的资源释放是到位的，理论上第一个测试结束后不应干扰第二个测试。
  - **对"串台"现象的进一步思考**:
    1.  **需要具体现象**: 请求用户提供更详细的串台日志或描述，以便准确定位。
    2.  **BroadcastChannel 的 inherent N:M 特性**: 如果在同一频道名下意外地同时存在多个活跃的 transport 实例，即使JSON-RPC的 `id` 能区分响应，也可能在日志中观察到消息被多个实例接收，造成串台错觉。
    3.  `BroadcastChannelServerTransport` 中的 `_instanceId` 目前仅为属性，未用于消息过滤。如果需要严格的1:1模拟，可以考虑将其用于消息信封或动态生成唯一频道名。
    4.  WebRTC 本身为1:1，串台可能性较低，除非实例管理有误。
  - **下一步**: 
    1.  等待用户提供具体的串台现象描述。
    2.  再次审视 `test-transports.js` 中 transport 实例的创建和销毁逻辑，确保独立性。 

## 2025-05-09 22:48:44 (织)
- **澄清"串台"疑虑：原理上同类型 Transport 的会话隔离问题**:
  - 用户明确"串台"并非指当前测试中的实际错误，而是对同类型 Transport 在同一环境下并发使用时，因缺少会话隔离机制可能导致消息串扰的原理性担忧。
  - **BroadcastChannel Transport 分析**:
    - **原理**: 基于共享频道名，是 N:M 通信，确有串台风险。多个同名频道的客户端/服务器实例会接收到彼此的消息。
    - **JSON-RPC `id`**: 能帮助客户端匹配响应，但不能阻止服务器接收重复请求或多个客户端接收同一响应（尽管只有正确的会处理）。
    - **隔离方案**: 
      1.  **唯一频道名**: 为每个1:1会话生成独特频道名 (最彻底，管理复杂)。
      2.  **消息内嵌会话/实例ID**: Transport 层在消息中嵌入唯一标识（如 `_instanceId`），并在接收时过滤。客户端和服务端均需实现。
  - **WebRTC Transport 分析**:
    - **原理**: `RTCPeerConnection` 是1:1的。只要信令正确配对且实例不被错误重用，其隔离性较好，不太需要额外的 transport 层会话ID。
    - **潜在风险**: 信令服务器的错误广播（非 transport 问题）或应用层对 transport 实例的错误管理。
  - **结论与建议**:
    1.  **BroadcastChannel**: 需要认真考虑会话隔离。是依赖上层（如唯一频道名约定）还是在 Transport 层实现（如基于 `_instanceId` 的消息过滤）取决于应用需求。
    2.  **WebRTC**: 隔离性较好，当前实现基本满足1:1通信。
    3.  **当前测试脚本**: 因顺序执行和新实例创建，跨类型的串台主要风险在于资源释放（目前看 `BroadcastChannelTransport.close()` 是合格的）。同类型并发测试时，BroadcastChannel 的 N:M 特性需要注意。 

## 2025-05-09 22:52:39 (织)
- **为 BroadcastChannel Transport 实现会话隔离 (消息信封与实例ID)**:
  - **目标**: 解决原理上多个同名 BroadcastChannel Transport 实例可能发生消息串扰的问题。
  - **核心机制**: 引入消息信封，内含协议标识、源实例ID和目标实例ID (用于S2C)，确保消息的定向传递和接收。
  - **`braodCastChannelTransportClient.ts` (客户端) 修改**:
    1.  添加 `_instanceId` (使用 `crypto.randomUUID()`)。
    2.  `send()`: 将 JSON-RPC 消息包装在 `ClientToServerEnvelope { protocol, sourceId, payload }` 中发送。
    3.  `onmessage` (内部): 接收消息时，校验是否为 `ServerToClientEnvelope`，且 `targetId` 是否匹配自身 `_instanceId`。匹配则处理 `payload`，否则忽略。
  - **`broadCastChannelTransportServer.ts` (服务器端) 修改**:
    1.  `_instanceId` 已存在 (使用 `crypto.randomUUID()`)。
    2.  `onmessage` (内部消息处理回调): 
        -   接收消息时，校验是否为 `ClientToServerEnvelope`。匹配则提取 `payload` 和 `sourceId` (即 `clientId`)。
        -   **重要**: 修改了向上层 `HuiMcpServer` 传递消息的回调 `this.onmessage` 的签名，使其能够传递 `clientId`，如 `onmessage(payload, { clientId })`。
    3.  `send()`: 
        -   **重要**: 修改了 `send` 方法签名，增加 `targetClientId: string` 参数。
        -   将 JSON-RPC 消息包装在 `ServerToClientEnvelope { protocol, sourceId (server's), targetId (client's), payload }` 中发送。
  - **对上层代码 (HuiMcpServer, test-transports.js) 的影响 (待处理)**:
    -   `HuiMcpServer` (或其 `ProtocolProcessor`) 需适配新的 `transport.onmessage` 签名，以接收并存储 `clientId`。
    -   `HuiMcpServer` 在发送响应时，需将存储的 `clientId` 传递给新的 `transport.send(message, targetClientId)` 签名。
    -   测试脚本中设置服务器如何发送数据部分也需相应调整。
  - **状态**: Transport 层已具备会话隔离能力，等待上层适配后进行完整测试。 