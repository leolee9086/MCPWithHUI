import { z } from "zod";

// 哥哥，这个 JSONRPCMessageSchema 的导入路径可能需要你再确认一下哦！
// SSEServerTransport 内部是从 '../types.js' 导入的。
// 对于外部包，如果 '@modelcontextprotocol/sdk/types' 不对，
// 也许是 '@modelcontextprotocol/sdk' 或者其他路径。
import { JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";

type JSONRPCMessage = z.infer<typeof JSONRPCMessageSchema>;

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
 * Server-like transport for BroadcastChannel. It doesn't act as a traditional server
 * with network listeners, but rather as a designated peer in a BroadcastChannel communication,
 * mimicking the API style of SSEServerTransport where applicable.
 *
 * This transport is intended for browser environments.
 */
export class BroadcastChannelServerTransport {
    private _channelName: string;
    private _channel?: BroadcastChannel;
    private _instanceId: string; // Mimics SSEServerTransport's sessionId

    public onmessage?: (message: JSONRPCMessage) => void;
    public onerror?: (error: Error) => void;
    public onclose?: () => void;

    /**
     * Creates an instance of BroadcastChannelServerTransport.
     * @param channelName The name of the broadcast channel.
     * @throws {BroadcastChannelServerError} If BroadcastChannel API or crypto.randomUUID is not available, or if channelName is invalid.
     */
    constructor(channelName: string) {
        if (typeof BroadcastChannel === "undefined") {
            throw new BroadcastChannelServerError("BroadcastChannel API is not available in this environment.");
        }
        if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
            throw new BroadcastChannelServerError("crypto.randomUUID() is not available in this environment for instanceId generation.");
        }
        if (!channelName || typeof channelName !== 'string' || channelName.trim() === '') {
            throw new BroadcastChannelServerError("Channel name must be a non-empty string.");
        }

        this._channelName = channelName;
        this._instanceId = crypto.randomUUID();
    }

    /**
     * Gets the unique instance ID for this transport instance.
     * Mimics the `sessionId` getter in SSEServerTransport.
     */
    public get instanceId(): string {
        return this._instanceId;
    }

    /**
     * Starts the transport. Initializes the BroadcastChannel and sets up message listeners.
     * @returns {Promise<void>} A promise that resolves when the channel is ready to listen.
     * @throws {Error} If the transport is already started.
     */
    public async start(): Promise<void> {
        if (this._channel) {
            throw new Error("BroadcastChannelServerTransport already started!");
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
                            throw new BroadcastChannelServerError("Received non-string message data. Expected JSON string.", undefined, messageData);
                        }
                        const rawMessage = JSON.parse(messageData);
                        console.log(`[BCServerTransport] Received raw message:`, JSON.stringify(rawMessage, null, 2));
                        parsedMessage = JSONRPCMessageSchema.parse(rawMessage);
                        console.log(`[BCServerTransport] Received message:`, JSON.stringify(parsedMessage, null, 2));
                    } catch (error) {
                        const err = error instanceof Error ? error : new Error(String(error));
                        const wrappedError = new BroadcastChannelServerError(`Failed to parse incoming message: ${err.message}`, undefined, err);
                        if (this.onerror) {
                            this.onerror(wrappedError);
                        } else {
                            console.error(wrappedError); // Fallback
                        }
                        return;
                    }
                    this.onmessage(parsedMessage);
                };
                
                // Unlike SSEServerTransport, there's no equivalent of sending an "endpoint" event to the client.
                // The channel is simply open for messages.
                resolve();
            } catch (error) { 
                const err = error instanceof Error ? error : new BroadcastChannelServerError(String(error));
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
     * Sends a JSONRPCMessage over the BroadcastChannel.
     * The message is stringified before sending.
     * @param {JSONRPCMessage} message The message to send.
     * @returns {Promise<void>} A promise that resolves when the message is posted.
     * @throws {BroadcastChannelServerError} If the transport is not started or if sending fails.
     */
    public async send(message: JSONRPCMessage): Promise<void> {
        if (!this._channel) {
            throw new BroadcastChannelServerError("Transport not started or channel is closed. Cannot send message.");
        }

        try {
            // Validate message before sending (optional, but good practice)
            // JSONRPCMessageSchema.parse(message); 
            const messageString = JSON.stringify(message);
            this._channel.postMessage(messageString);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            const wrappedError = new BroadcastChannelServerError(`Failed to send message: ${err.message}`, undefined, err);
            if (this.onerror) {
                this.onerror(wrappedError);
            }
            // Re-throw, consistent with how SSEServerTransport might handle send errors if they occurred post-connection.
            throw wrappedError; 
        }
        return Promise.resolve();
    }

    /**
     * Closes the transport. Closes the BroadcastChannel and removes listeners.
     * @returns {Promise<void>} A promise that resolves when the channel is closed.
     */
    public async close(): Promise<void> {
        if (this._channel) {
            this._channel.onmessage = null; 
            this._channel.close();
            this._channel = undefined;
        }
        if (this.onclose) {
            this.onclose();
        }
        return Promise.resolve();
    }
}
