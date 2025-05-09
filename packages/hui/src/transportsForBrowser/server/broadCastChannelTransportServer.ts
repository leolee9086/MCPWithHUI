import { z } from "zod";

// 哥哥，这个 JSONRPCMessageSchema 的导入路径可能需要你再确认一下哦！
// SSEServerTransport 内部是从 '../types.js' 导入的。
// 对于外部包，如果 '@modelcontextprotocol/sdk/types' 不对，
// 也许是 '@modelcontextprotocol/sdk' 或者其他路径。
import { JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";

type JSONRPCMessage = z.infer<typeof JSONRPCMessageSchema>;

// 织：不再需要信封定义，因为现在是1:1的专属频道

/**
 * Error class for BroadcastChannelServerTransport specific errors.
 */
export class BroadcastChannelServerError extends Error {
    public code?: number | string;
    public originalEvent?: any;

    constructor(message: string, code?: number | string, originalEvent?: any) {
        super(`BroadcastChannelServerError: ${message}`);
        this.name = "BroadcastChannelServerError";
        this.code = code;
        this.originalEvent = originalEvent;
    }
}

/**
 * Server-like transport for BroadcastChannel. 
 * This transport INSTANCE represents a 1:1 session with a specific client on a dedicated channel.
 * It does not handle session discovery; that should be managed by a higher-level coordinator.
 */
export class BroadcastChannelServerTransport {
    private _sessionChannelName: string;
    private _sessionId: string;
    private _channel?: BroadcastChannel;
    // 织: _pendingRequests 已移除，因为 transport 实例现在是会话专用的

    public onmessage?: (message: JSONRPCMessage) => void; // 织: 恢复到HuiMcpServer期望的简单签名
    public onerror?: (error: Error) => void;
    public onclose?: () => void;

    /**
     * Creates an instance of BroadcastChannelServerTransport for an established session.
     * @param sessionChannelName The name of the dedicated broadcast channel for this session.
     * @param sessionId The unique ID for this session.
     * @throws {BroadcastChannelServerError} If BroadcastChannel API is not available, or if parameters are invalid.
     */
    constructor(sessionChannelName: string, sessionId: string) {
        if (typeof BroadcastChannel === "undefined") {
            throw new BroadcastChannelServerError("BroadcastChannel API is not available in this environment.");
        }
        if (!sessionChannelName || typeof sessionChannelName !== 'string' || sessionChannelName.trim() === '') {
            throw new BroadcastChannelServerError("Session channel name must be a non-empty string.");
        }
        if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
            throw new BroadcastChannelServerError("Session ID must be a non-empty string.");
        }

        this._sessionChannelName = sessionChannelName;
        this._sessionId = sessionId;
        console.log(`[BCServerTransport SID: ${this._sessionId}] Initialized for session channel: ${this._sessionChannelName}`);
    }

    /**
     * Gets the unique session ID for this transport instance.
     */
    public get sessionId(): string {
        return this._sessionId;
    }

    /**
     * Starts the transport. Initializes the session-specific BroadcastChannel and sets up message listeners.
     * @returns {Promise<void>} A promise that resolves when the channel is ready to listen.
     * @throws {Error} If the transport is already started.
     */
    public async start(): Promise<void> {
        if (this._channel) {
            throw new Error(`BroadcastChannelServerTransport (SID: ${this._sessionId}) already started!`);
        }
        console.log(`[BCServerTransport SID: ${this._sessionId}] Starting on channel: ${this._sessionChannelName}...`);

        return new Promise<void>((resolve, reject) => {
            try {
                this._channel = new BroadcastChannel(this._sessionChannelName); // This could throw

                this._channel.onmessage = (event: MessageEvent) => {
                    if (!this.onmessage) {
                        return;
                    }
                    try {
                        const jsonRpcPayload = JSON.parse(event.data as string) as JSONRPCMessage;
                        JSONRPCMessageSchema.parse(jsonRpcPayload); // Validate payload

                        console.log(`[BCServerTransport SID: ${this._sessionId}] Received message on ${this._sessionChannelName}:`, JSON.stringify(jsonRpcPayload, null, 2));
                        this.onmessage(jsonRpcPayload); // Directly pass to HuiMcpServer

                    } catch (error) {
                        const err = error instanceof Error ? error : new Error(String(error));
                        console.error(`[BCServerTransport SID: ${this._sessionId}] Error processing message on ${this._sessionChannelName}. Raw:`, event.data, err);
                        const wrappedError = new BroadcastChannelServerError(`Failed to parse/validate incoming message: ${err.message}`, undefined, err);
                        if (this.onerror) {
                            this.onerror(wrappedError);
                        } else {
                            console.error(wrappedError);
                        }
                    }
                };

                this._channel.onmessageerror = (event: MessageEvent) => { // 织: 捕获消息反序列化错误
                    const errText = event.data ? `Message data: ${JSON.stringify(event.data)}` : "Unknown message error";
                    const wrappedError = new BroadcastChannelServerError(`Message error on session channel ${this._sessionChannelName}: ${errText}`, undefined, event);
                    console.error(`[BCServerTransport SID: ${this._sessionId}] ${wrappedError.message}`, event);
                    if (this.onerror) {
                        this.onerror(wrappedError);
                    }
                };
                
                console.log(`[BCServerTransport SID: ${this._sessionId}] Started and listening on channel: ${this._sessionChannelName}`);
                resolve();
            } catch (error) { 
                const err = error instanceof Error ? error : new BroadcastChannelServerError(String(error));
                console.error(`[BCServerTransport SID: ${this._sessionId}] Failed to start on channel ${this._sessionChannelName}: ${err.message}`, err);
                 if (this.onerror) {
                    this.onerror(err);
                } else {
                    console.error(err);
                }
                reject(err);
            }
        });
    }

    /**
     * Sends a JSONRPCMessage over the session BroadcastChannel.
     * The message is stringified before sending.
     * @param {JSONRPCMessage} message The message to send.
     * @returns {Promise<void>} A promise that resolves when the message is posted.
     * @throws {BroadcastChannelServerError} If the transport is not started or if sending fails.
     */
    public async send(message: JSONRPCMessage): Promise<void> { // 织: 恢复简单签名
        if (!this._channel) {
            throw new BroadcastChannelServerError(`Transport not started or channel closed (SID: ${this._sessionId}). Cannot send message.`);
        }

        try {
            const messageString = JSON.stringify(message);
            console.log(`[BCServerTransport SID: ${this._sessionId}] Sending message on ${this._sessionChannelName}:`, messageString);
            this._channel.postMessage(messageString);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            const wrappedError = new BroadcastChannelServerError(`Failed to send message (SID: ${this._sessionId}): ${err.message}`, undefined, err);
            if (this.onerror) {
                this.onerror(wrappedError);
            }
            throw wrappedError; 
        }
        return Promise.resolve();
    }

    /**
     * Closes the transport. Closes the session BroadcastChannel and removes listeners.
     * @returns {Promise<void>} A promise that resolves when the channel is closed.
     */
    public async close(): Promise<void> {
        console.log(`[BCServerTransport SID: ${this._sessionId}] Closing channel ${this._sessionChannelName}...`);
        if (this._channel) {
            this._channel.onmessage = null; 
            this._channel.onmessageerror = null; // 织: 清理 onmessageerror
            this._channel.close();
            this._channel = undefined;
        }
        if (this.onclose) {
            this.onclose();
        }
        console.log(`[BCServerTransport SID: ${this._sessionId}] Closed channel ${this._sessionChannelName}.`);
        return Promise.resolve();
    }
}
