# 这个区段由开发者编写,未经允许禁止AI修改

# 修改记录
## 2025-05-09 16:35:20 (织)
- 创建 `webRTCClientTransport.ts` 文件。
- 该文件实现了一个 `WebRTCClientTransport` 类，用于在浏览器环境中作为 WebRTC 连接的"客户端"（发起方）。
- **核心依赖与 API**:
    - 使用 `RTCPeerConnection` 建立对等连接，并通过 `RTCDataChannel` (标签为 `mcp-datachannel`) 进行消息传输。
    - 提供了 `start()`, `send()`, `close()`, `handleSignal()` 方法。
    - 提供了 `onmessage`, `onerror`, `onclose`, `onsignal` 回调属性。
    - 依赖 `zod` 和 `JSONRPCMessageSchema` (当前导入路径为 `@modelcontextprotocol/sdk/types.js`) 进行消息的序列化、反序列化和校验。
    - 定义了 `WebRTCClientError` 错误类和 `WebRTCSignalMessage` 类型 (用于信令消息)。
- **信令处理**:
    - 本身不实现信令逻辑，通过 `onsignal` 回调函数将 Offer, Answer (虽然此客户端不创建Answer), ICE Candidate 等信令消息交由外部处理。
    - 通过 `handleSignal()` 方法接收外部传入的 Answer 和 ICE Candidate。
- **连接流程 (客户端视角)**:
    1. 构造时可传入 `RTCConfiguration` (默认配置为空，可后续添加 STUN/TURN 服务器)。
    2. 调用 `start()` 方法：
        - 初始化 `RTCPeerConnection` 并设置相关事件监听器 (icecandidate, iceconnectionstatechange, connectionstatechange, negotiationneeded)。
        - 主动创建 `RTCDataChannel` 并设置其事件监听器 (open, close, error, message)。
        - 调用 `createOffer()` 生成 SDP Offer，设置本地描述，并通过 `onsignal` 发送此 Offer。
    3. 等待远端通过 `handleSignal()` 传入 Answer，设置远端描述。
    4. 交换 ICE Candidate (通过 `onsignal` 发出，通过 `handleSignal()` 接收)。
    5. 数据通道 `onopen` 事件触发后，即可通过 `send()` 方法发送消息。
- **错误与状态处理**:
    - 监听 `RTCPeerConnection` 和 `RTCDataChannel` 的各种状态变化和错误事件，并通过 `onerror` 和 `onclose` 回调通知使用者。
    - 包含对 `onnegotiationneeded` 事件的简易防抖处理，以避免在某些情况下（如快速连续的状态变化）过于频繁地创建 Offer。
- **注意事项**:
    - `JSONRPCMessageSchema` 的导入路径问题待后续确认和修复。
    - 未内置 STUN/TURN 服务器配置，复杂网络环境下的连接穿透能力有限。
    - `close()` 方法会清理所有资源和事件监听器。 