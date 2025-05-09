# 这个区段由开发者编写,未经允许禁止AI修改

# 修改记录
## 2025-05-09 16:30:07 (织)
- 创建 `broadCastChannelTransportServer.ts` 文件。
- 该文件实现了一个 `BroadcastChannelServerTransport` 类，用于在浏览器同源上下文中作为 "服务端" 角色参与 BroadcastChannel 通信。
- 其 API 设计模仿了 `@modelcontextprotocol/sdk` 中 `SSEServerTransport` 的结构，例如包含 `start`, `send`, `close` 方法，`onmessage`, `onerror`, `onclose` 回调属性，以及一个 `instanceId` 属性（类似 `sessionId`）。
- 主要差异和适配浏览器的改动点：
    - 完全运行于浏览器环境，依赖 `BroadcastChannel` Web API。
    - 不涉及 HTTP 请求处理、端口监听等网络服务器概念。
    - `start()` 方法仅用于初始化 `BroadcastChannel` 实例并开始监听消息，不会像 `SSEServerTransport` 那样发送 "endpoint" 事件给客户端。
    - 消息的收发直接通过 `BroadcastChannel` 的 `postMessage` 和 `onmessage` 事件，未使用 SSE 的特定消息格式 (如 `event: message`)。
- `instanceId` 通过浏览器标准的 `crypto.randomUUID()` 方法生成。
- 代码中依赖 `JSONRPCMessageSchema` 进行消息校验，当前导入路径设置为 `"@modelcontextprotocol/sdk/types"`，但此路径存在模块解析问题，后续需要修正。
- 同样依赖 `zod` 进行从 Schema 到 TypeScript 类型 (`JSONRPCMessage`) 的推断。
- 定义了专用的 `BroadcastChannelServerError` 错误类来封装与此 transport 相关的错误信息。

## 2025-05-09 16:45:25 (织)
- 接续 `webRTCClientTransport.ts` 的工作，开始创建 `webRTCServerTransport.ts`。

## 2025-05-09 16:47:00 (织)
- 完成 `webRTCServerTransport.ts` 的主体代码编写。
- 该文件实现了一个 `WebRTCServerTransport` 类，用于在浏览器环境中作为 WebRTC 连接的"服务端"（接收方）。
- **核心依赖与 API**:
    - 与 `WebRTCClientTransport` 类似，使用 `RTCPeerConnection` 和 `RTCDataChannel` (标签为 `mcp-datachannel`)。
    - 提供了 `start()`, `send()`, `close()`, `handleSignal()` 方法。
    - 提供了 `onmessage`, `onerror`, `onclose`, `onsignal` 回调属性。
    - 依赖 `zod` 和 `JSONRPCMessageSchema` (当前导入路径为 `@modelcontextprotocol/sdk/types.js`)。
    - 定义了 `WebRTCServerError` 错误类。
    - 从 `../client/webRTCClientTransport.js` 导入 `WebRTCSignalMessage` 类型。
- **信令处理**:
    - 通过 `onsignal` 回调函数将 Answer 和 ICE Candidate 等信令消息交由外部处理。
    - 通过 `handleSignal()` 方法接收外部传入的 Offer 和 ICE Candidate。
- **连接流程 (服务端视角)**:
    1. 构造时可传入 `RTCConfiguration`。
    2. 调用 `start()` 方法：
        - 初始化 `RTCPeerConnection` 并设置相关事件监听器 (icecandidate, iceconnectionstatechange, connectionstatechange, **ondatachannel**)。
        - **不主动创建 Offer 或 DataChannel**。
    3. 等待通过 `handleSignal()` 传入 Offer：
        - 设置远端描述 (Offer)。
        - 调用 `createAnswer()` 生成 SDP Answer，设置本地描述。
        - 通过 `onsignal` 发送此 Answer。
    4. 交换 ICE Candidate。
    5. 当客户端创建的 `RTCDataChannel` 通过 `ondatachannel` 事件到达时，接收该 DataChannel 并设置其事件监听器 (open, close, error, message)。
    6. 数据通道 `onopen` 事件触发后，即可通过 `send()` 方法发送消息。
- **错误与状态处理**:
    - 监听 `RTCPeerConnection` 和 `RTCDataChannel` 的各种状态变化和错误事件。
- **注意事项**:
    - `JSONRPCMessageSchema` 的导入路径问题仍待后续确认和修复。
    - `ondatachannel` 事件回调中增加了对 `event.channel.label` 的检查，确保只处理期望的 `mcp-datachannel`。
    - 导入 `WebRTCSignalMessage` 时，修正了相对路径为 `../client/webRTCClientTransport.js` 以解决模块解析问题。 