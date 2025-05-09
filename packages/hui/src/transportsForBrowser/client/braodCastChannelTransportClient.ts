import { z } from "zod";

// 假设 JSONRPCMessageSchema 从 SDK 的 types 模块导出
// 如果实际的导出路径不同，这里可能需要调整
import { JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";
// 从 Zod schema 推断 JSONRPCMessage 类型
type JSONRPCMessage = z.infer<typeof JSONRPCMessageSchema>;

// 织：为会话握手定义消息类型
const MCP_DISCOVERY_PROTOCOL = 'mcp-discovery-v1';

type SessionRequestMessage = {
    protocol: typeof MCP_DISCOVERY_PROTOCOL;
    type: 'request-session';
    clientIdHint: string; // 用于帮助服务器日志追踪，非强制唯一
};

type SessionResponseMessage = {
    protocol: typeof MCP_DISCOVERY_PROTOCOL;
    type: 'session-granted';
    clientIdHint?: string; // 从请求中回显
    sessionId: string;
    sessionChannelName: string;
};

/**
 * Error class for BroadcastChannelTransport specific errors.
 */
export class BroadcastChannelError extends Error {
    public code?: number | string;
    public originalEvent?: any;

    constructor(message: string, code?: number | string, originalEvent?: any) {
        super(`BroadcastChannel error: ${message}`);
        this.name = "BroadcastChannelError";
        this.code = code;
        this.originalEvent = originalEvent;
    }
}

/**
 * Client transport for BroadcastChannel: this will use the BroadcastChannel API
 * for sending and receiving messages between browser contexts of the same origin.
 * It now establishes a 1:1 session via a discovery channel.
 */
export class BroadcastChannelClientTransport {
    private _discoveryChannelName: string;
    private _sessionChannelName?: string; // 织: 会话建立后设置
    private _sessionId?: string; // 织: 会话建立后设置
    private _channel?: BroadcastChannel; // 织: 用于会话的专属频道
    private _sessionRequestTimeoutMs: number;

    public onmessage?: (message: JSONRPCMessage) => void;
    public onerror?: (error: Error) => void;
    public onclose?: () => void;

    /**
     * Creates an instance of BroadcastChannelClientTransport.
     * @param discoveryChannelName The name of the discovery broadcast channel to request a session.
     * @param sessionRequestTimeoutMs Timeout in milliseconds for waiting for a session response. Defaults to 10000ms.
     * @throws {BroadcastChannelError} If BroadcastChannel API is not available or discoveryChannelName is invalid.
     */
    constructor(discoveryChannelName: string, sessionRequestTimeoutMs: number = 10000) {
        if (typeof BroadcastChannel === "undefined") {
            throw new BroadcastChannelError("BroadcastChannel API is not available in this environment.");
        }
        if (!discoveryChannelName || typeof discoveryChannelName !== 'string' || discoveryChannelName.trim() === '') {
            throw new BroadcastChannelError("Discovery channel name must be a non-empty string.");
        }
        if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
            throw new BroadcastChannelError("crypto.randomUUID() is not available for clientIdHint generation.");
        }
        this._discoveryChannelName = discoveryChannelName;
        this._sessionRequestTimeoutMs = sessionRequestTimeoutMs;
        console.log(`[BCClientTransport] Initialized for discovery channel: ${this._discoveryChannelName}`);
    }

    /**
     * Establishes a unique session with the server via the discovery channel.
     * @returns {Promise<{ sessionId: string, sessionChannelName: string }>}
     * @throws {BroadcastChannelError} If session establishment fails or times out.
     */
    private async establishSession(): Promise<{ sessionId: string, sessionChannelName: string }> {
        return new Promise((resolve, reject) => {
            console.log(`[BCClientTransport] Attempting to establish session on discovery channel: ${this._discoveryChannelName}`);
            const discoveryCommChannel = new BroadcastChannel(this._discoveryChannelName);
            const clientIdHint = crypto.randomUUID();

            const timeoutId = setTimeout(() => {
                discoveryCommChannel.close();
                console.error(`[BCClientTransport] Session request timed out after ${this._sessionRequestTimeoutMs}ms on ${this._discoveryChannelName}.`);
                reject(new BroadcastChannelError("Session request timed out.", 'TIMEOUT'));
            }, this._sessionRequestTimeoutMs);

            discoveryCommChannel.onmessage = (event: MessageEvent) => {
                try {
                    const response = JSON.parse(event.data as string);
                    if (response.protocol === MCP_DISCOVERY_PROTOCOL && 
                        response.type === 'session-granted' && 
                        response.sessionId && 
                        response.sessionChannelName &&
                        response.clientIdHint === clientIdHint) { // Match our request
                        
                        clearTimeout(timeoutId);
                        discoveryCommChannel.onmessage = null; // Stop listening
                        discoveryCommChannel.close();
                        
                        const sessionInfo = { sessionId: response.sessionId, sessionChannelName: response.sessionChannelName };
                        console.log(`[BCClientTransport] Session granted:`, sessionInfo);
                        resolve(sessionInfo);
                    } else {
                        // console.debug(`[BCClientTransport] Ignored irrelevant message on discovery channel:`, response);
                    }
                } catch (parseError) {
                    // console.warn(`[BCClientTransport] Failed to parse message on discovery channel:`, event.data, parseError);
                }
            };

            // 织: 监听 discoveryCommChannel 的 onmessageerror
            discoveryCommChannel.onmessageerror = (event: MessageEvent) => {
                clearTimeout(timeoutId);
                // discoveryCommChannel.close(); //  don't close here, onerror might be followed by more attempts or specific close logic
                const errText = event.data ? `Message data: ${JSON.stringify(event.data)}` : "Unknown message error on discovery channel";
                console.error(`[BCClientTransport] onmessageerror on discovery channel ${this._discoveryChannelName}: ${errText}`, event);
                // Not rejecting the promise here, as timeout or other errors will handle it.
                // This is more of a logging / potential debug hook.
                // If this error is critical for session establishment, the timeout will likely catch it.
                if (this.onerror) {
                     this.onerror(new BroadcastChannelError(`Message error on discovery channel: ${errText}`, undefined, event));
                }
            };
            
            const requestMessage: SessionRequestMessage = {
                protocol: MCP_DISCOVERY_PROTOCOL,
                type: 'request-session',
                clientIdHint: clientIdHint
            };
            console.log(`[BCClientTransport] Sending session request on ${this._discoveryChannelName}:`, requestMessage);
            discoveryCommChannel.postMessage(JSON.stringify(requestMessage));
        });
    }

    /**
     * Starts the transport. Establishes a session and then initializes the session BroadcastChannel.
     * @returns {Promise<void>} A promise that resolves when the session channel is ready.
     * @throws {Error} If the transport is already started or session establishment fails.
     */
    public async start(): Promise<void> {
        if (this._channel) {
            throw new Error("BroadcastChannelClientTransport already started (session channel exists)!");
        }
        if (this._sessionChannelName || this._sessionId) {
             throw new Error("BroadcastChannelClientTransport already has session info but no channel. This indicates an inconsistent state.");
        }
        console.log(`[BCClientTransport] Starting session establishment...`);

        try {
            const sessionInfo = await this.establishSession();
            this._sessionId = sessionInfo.sessionId;
            this._sessionChannelName = sessionInfo.sessionChannelName;

            console.log(`[BCClientTransport] Session established (ID: ${this._sessionId}). Starting session channel: ${this._sessionChannelName}`);
            
            this._channel = new BroadcastChannel(this._sessionChannelName);

            this._channel.onmessage = (event: MessageEvent) => {
                if (!this.onmessage) {
                    return;
                }
                try {
                    // 织: 直接解析JSONRPCMessage，因为这是专属频道
                    const jsonRpcPayload = JSON.parse(event.data as string) as JSONRPCMessage;
                    JSONRPCMessageSchema.parse(jsonRpcPayload); // Validate 
                    console.log(`[BCClientTransport SID: ${this._sessionId}] Received message on ${this._sessionChannelName}:`, JSON.stringify(jsonRpcPayload, null, 2));
                    this.onmessage(jsonRpcPayload);
                } catch (error) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    console.error(`[BCClientTransport SID: ${this._sessionId}] Error processing received message on ${this._sessionChannelName}. Raw:`, event.data, err);
                    const wrappedError = new BroadcastChannelError(`Failed to parse or validate message on session channel: ${err.message}`, undefined, err);
                    if (this.onerror) {
                        this.onerror(wrappedError);
                    } else {
                        console.error(wrappedError);
                    }
                }
            };
            
            // 织: 为会话频道添加 onmessageerror
            this._channel.onmessageerror = (event: MessageEvent) => {
                const errText = event.data ? `Message data: ${JSON.stringify(event.data)}` : "Unknown message error on session channel";
                const err = new BroadcastChannelError(`Message error on session channel ${this._sessionChannelName}: ${errText}`, undefined, event);
                console.error(`[BCClientTransport SID: ${this._sessionId}] ${err.message}`, event);
                if (this.onerror) {
                    this.onerror(err);
                }
                // Depending on severity, might also call this.close() or trigger a specific error state.
            };

            console.log(`[BCClientTransport SID: ${this._sessionId}] Started on session channel: ${this._sessionChannelName}`);
        } catch (error) {
            const err = error instanceof Error ? error : new BroadcastChannelError(String(error));
            console.error(`[BCClientTransport] Failed to start: ${err.message}`, err);
            if (this.onerror) {
                this.onerror(err);
            }
            // Ensure cleanup if establishSession failed or channel creation failed
            if (this._channel) {
                this._channel.close();
                this._channel = undefined;
            }
            this._sessionChannelName = undefined;
            this._sessionId = undefined;
            throw err; // Re-throw to signal failure to start
        }
    }

    /**
     * Closes the transport. Closes the session BroadcastChannel.
     * @returns {Promise<void>} A promise that resolves when the channel is closed.
     */
    public async close(): Promise<void> {
        const sid = this._sessionId || 'N/A';
        console.log(`[BCClientTransport SID: ${sid}] Closing session channel ${this._sessionChannelName || 'N/A'}...`);
        if (this._channel) {
            this._channel.onmessage = null; 
            this._channel.onmessageerror = null; // 织: 清理 onmessageerror
            this._channel.close();
            this._channel = undefined;
        }
        this._sessionChannelName = undefined;
        this._sessionId = undefined;
        if (this.onclose) {
            this.onclose();
        }
        console.log(`[BCClientTransport SID: ${sid}] Closed.`);
        return Promise.resolve();
    }

    /**
     * Sends a JSONRPCMessage over the session BroadcastChannel.
     * The message is stringified before sending.
     * @param {JSONRPCMessage} message The message to send.
     * @returns {Promise<void>} A promise that resolves when the message is posted.
     * @throws {BroadcastChannelError} If the transport is not connected or if sending fails.
     */
    public async send(message: JSONRPCMessage): Promise<void> {
        if (!this._channel || !this._sessionChannelName || !this._sessionId) {
            throw new BroadcastChannelError("Not connected or session not established. Call start() first or channel is closed.");
        }

        try {
            // 织: 直接发送 JSONRPCMessage，无需信封
            const messageString = JSON.stringify(message);
            console.log(`[BCClientTransport SID: ${this._sessionId}] Sending message on ${this._sessionChannelName}:`, messageString);
            this._channel.postMessage(messageString);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            const wrappedError = new BroadcastChannelError(`Failed to send message: ${err.message}`, undefined, err);
            if (this.onerror) {
                this.onerror(wrappedError);
            }
            throw wrappedError;
        }
        return Promise.resolve();
    }

    // 织: 提供获取 sessionId 的方法，方便测试或上层使用
    public getSessionId(): string | undefined {
        return this._sessionId;
    }
}
