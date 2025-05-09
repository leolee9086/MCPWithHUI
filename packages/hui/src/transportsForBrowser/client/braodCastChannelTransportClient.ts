import { z } from "zod";

// 假设 JSONRPCMessageSchema 从 SDK 的 types 模块导出
// 如果实际的导出路径不同，这里可能需要调整
import { JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";
// 从 Zod schema 推断 JSONRPCMessage 类型
type JSONRPCMessage = z.infer<typeof JSONRPCMessageSchema>;

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
 */
export class BroadcastChannelClientTransport {
    private _channelName: string;
    private _channel?: BroadcastChannel;

    public onmessage?: (message: JSONRPCMessage) => void;
    public onerror?: (error: Error) => void;
    public onclose?: () => void;

    /**
     * Creates an instance of BroadcastChannelClientTransport.
     * @param channelName The name of the broadcast channel to connect to.
     * @throws {BroadcastChannelError} If BroadcastChannel API is not available or channelName is invalid.
     */
    constructor(channelName: string) {
        if (typeof BroadcastChannel === "undefined") {
            throw new BroadcastChannelError("BroadcastChannel API is not available in this environment.");
        }
        if (!channelName || typeof channelName !== 'string' || channelName.trim() === '') {
            throw new BroadcastChannelError("Channel name must be a non-empty string.");
        }
        this._channelName = channelName;
    }

    /**
     * Starts the transport. Initializes the BroadcastChannel and sets up message listeners.
     * @returns {Promise<void>} A promise that resolves when the channel is ready.
     * @throws {Error} If the transport is already started.
     */
    public async start(): Promise<void> {
        if (this._channel) {
            throw new Error("BroadcastChannelClientTransport already started!");
        }

        return new Promise<void>((resolve, reject) => {
            try {
                this._channel = new BroadcastChannel(this._channelName);

                this._channel.onmessage = (event: MessageEvent) => {
                    if (!this.onmessage) {
                        return;
                    }

                    const messageData = event.data;
                    let parsedMessage: JSONRPCMessage;

                    try {
                        if (typeof messageData !== 'string') {
                            throw new BroadcastChannelError("Received non-string message data. Expected JSON string.");
                        }
                        const rawMessage = JSON.parse(messageData);
                        parsedMessage = JSONRPCMessageSchema.parse(rawMessage);
                    } catch (error) {
                        const err = error instanceof Error ? error : new Error(String(error));
                        const wrappedError = new BroadcastChannelError(`Failed to parse message: ${err.message}`, undefined, err);
                        if (this.onerror) {
                            this.onerror(wrappedError);
                        } else {
                            // Fallback error logging if no handler is attached
                            console.error(wrappedError);
                        }
                        return;
                    }
                    this.onmessage(parsedMessage);
                };
                
                // BroadcastChannel does not have a specific error event for the channel itself like EventSource.
                // Errors are typically related to message parsing (handled above) or sending.

                resolve(); // Channel is ready immediately upon creation.
            } catch (error) { // Catch errors from `new BroadcastChannel()` itself, though rare.
                const err = error instanceof Error ? error : new BroadcastChannelError(String(error));
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
     * Closes the transport. Closes the BroadcastChannel.
     * @returns {Promise<void>} A promise that resolves when the channel is closed.
     */
    public async close(): Promise<void> {
        if (this._channel) {
            this._channel.onmessage = null; // Remove listener
            this._channel.close();
            this._channel = undefined;
        }
        if (this.onclose) {
            this.onclose();
        }
        return Promise.resolve();
    }

    /**
     * Sends a JSONRPCMessage over the BroadcastChannel.
     * The message is stringified before sending.
     * @param {JSONRPCMessage} message The message to send.
     * @returns {Promise<void>} A promise that resolves when the message is posted.
     * @throws {BroadcastChannelError} If the transport is not connected or if sending fails.
     */
    public async send(message: JSONRPCMessage): Promise<void> {
        if (!this._channel) {
            throw new BroadcastChannelError("Not connected. Call start() first or channel is closed.");
        }

        try {
            // 织：添加日志，查看将要发送的消息
            console.log(`[BCClientTransport] Sending message:`, JSON.stringify(message, null, 2));
            const messageString = JSON.stringify(message);
            this._channel.postMessage(messageString);
        } catch (error) {
            // Errors could be from JSON.stringify or if postMessage fails (e.g. channel closed concurrently by another context)
            const err = error instanceof Error ? error : new Error(String(error));
            const wrappedError = new BroadcastChannelError(`Failed to send message: ${err.message}`, undefined, err);
            if (this.onerror) {
                this.onerror(wrappedError);
            }
            throw wrappedError; // Re-throw, consistent with SSEClientTransport behavior
        }
        return Promise.resolve();
    }
}
