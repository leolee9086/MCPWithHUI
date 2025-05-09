import { z } from "zod";

// 哥哥，这里的 JSONRPCMessageSchema 导入路径还是需要确认哦！
// 我们暂时先用之前讨论过的路径，如果不对后续再调整。
import { JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";

type JSONRPCMessage = z.infer<typeof JSONRPCMessageSchema>;

export type WebRTCSignalMessage = 
    | { type: 'offer', sdp: string }
    | { type: 'answer', sdp: string }
    | { type: 'candidate', candidate: RTCIceCandidateInit | RTCIceCandidate | null };

/**
 * Error class for WebRTCClientTransport specific errors.
 */
export class WebRTCClientError extends Error {
    public code?: string;
    public originalError?: any;

    constructor(message: string, code?: string, originalError?: any) {
        super(`WebRTCClientError: ${message}`);
        this.name = "WebRTCClientError";
        this.code = code;
        this.originalError = originalError;
    }
}

const DEFAULT_RTC_CONFIGURATION: RTCConfiguration = {
    // iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] // 这是一个公共STUN服务器的例子，可以帮助NAT穿透
    // 哥哥可以根据需要在这里配置 STUN/TURN 服务器
};

const DATA_CHANNEL_LABEL = 'mcp-datachannel';

/**
 * Client transport for WebRTC: this will establish a peer-to-peer connection
 * and use RTCDataChannel for sending/receiving JSONRPC messages.
 * It requires an external signaling mechanism.
 */
export class WebRTCClientTransport {
    private _peerConnection?: RTCPeerConnection;
    private _dataChannel?: RTCDataChannel;
    private _rtcConfiguration: RTCConfiguration;
    private _negotiationNeededTimeout: any = null;
    private _pendingSignalQueue: WebRTCSignalMessage[] = [];
    private _isStarted: boolean = false;

    // 织：添加用于等待数据通道打开的 Promise
    private _dataChannelOpenPromise: Promise<void>;
    private _resolveDataChannelOpenPromise!: () => void;
    private _rejectDataChannelOpenPromise!: (reason?: any) => void;

    public onmessage?: (message: JSONRPCMessage) => void;
    public onerror?: (error: Error) => void;
    public onclose?: () => void;
    public onsignal?: (signal: WebRTCSignalMessage) => void; // Callback to send signaling messages

    /**
     * Creates an instance of WebRTCClientTransport.
     * @param rtcConfiguration Optional RTCConfiguration for the RTCPeerConnection.
     * @throws {WebRTCClientError} If RTCPeerConnection API is not available.
     */
    constructor(rtcConfiguration?: RTCConfiguration) {
        if (typeof RTCPeerConnection === "undefined") {
            throw new WebRTCClientError("RTCPeerConnection API is not available in this environment.", "API_UNAVAILABLE");
        }
        this._rtcConfiguration = rtcConfiguration || DEFAULT_RTC_CONFIGURATION;
        // 织：初始化 Promise
        this._dataChannelOpenPromise = new Promise<void>((resolve, reject) => {
            this._resolveDataChannelOpenPromise = resolve;
            this._rejectDataChannelOpenPromise = reject; // 用于在出错或关闭时 reject
        });
    }

    // 织：提供一个公共方法来等待数据通道打开
    public async awaitDataChannelOpen(): Promise<void> {
        return this._dataChannelOpenPromise;
    }

    /**
     * Starts the transport. Initializes the RTCPeerConnection, creates a data channel,
     * and initiates the SDP offer process.
     * @returns {Promise<void>} A promise that resolves when the initial setup is done (offer created).
     * @throws {Error} If the transport is already started.
     */
    public async start(): Promise<void> {
        if (this._peerConnection) {
            console.warn("WebRTCClientTransport already started or start attempt in progress.");
            return;
        }

        // 织：在 start 开始时重置 dataChannelOpenPromise，以允许重新连接（如果支持）
        // 对于当前实现，我们假设 transport 是一次性的，但这样做更健壮
        this._dataChannelOpenPromise = new Promise<void>((resolve, reject) => {
            this._resolveDataChannelOpenPromise = resolve;
            this._rejectDataChannelOpenPromise = reject;
        });

        try {
            this._peerConnection = new RTCPeerConnection(this._rtcConfiguration);
            this._setupPeerConnectionListeners();

            // Create data channel - initiator side
            this._dataChannel = this._peerConnection.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
            this._setupDataChannelListeners();

            this._isStarted = true;
            this._processPendingSignals();

            console.log("WebRTCClient: PeerConnection initialized, attempting to create offer.");
            const offer = await this._peerConnection.createOffer();
            await this._peerConnection.setLocalDescription(offer);
            if (this.onsignal && this._peerConnection.localDescription) {
                this.onsignal({ type: 'offer', sdp: this._peerConnection.localDescription.sdp });
            }
            // 织：Offer 已发送，现在等待数据通道真正打开
            console.log("WebRTCClient: Offer sent. Waiting for data channel to open...");
            await this._dataChannelOpenPromise; // 关键改动：等待数据通道打开
            console.log("WebRTCClient: Data channel reported open. start() method will now resolve.");

        } catch (error) {
            this._isStarted = false;
            const err = error instanceof Error ? error : new Error(String(error));
            const wrappedError = new WebRTCClientError(`Failed to start WebRTC client: ${err.message}`, "START_FAILED", err);
            this._rejectDataChannelOpenPromise(wrappedError); // 织：在启动失败时 reject
            if (this.onerror) {
                this.onerror(wrappedError);
            } else {
                console.error(wrappedError);
            }
            await this.close(); // Cleanup on failure
            throw wrappedError;
        }
    }

    private async _processPendingSignals(): Promise<void> {
        if (!this._peerConnection) return;
        console.log(`WebRTCClient: Processing ${this._pendingSignalQueue.length} pending signals.`);
        while (this._pendingSignalQueue.length > 0) {
            const signal = this._pendingSignalQueue.shift();
            if (signal) {
                console.log(`[WebRTC Client] Processing queued signal from _pendingSignalQueue: ${signal.type}`);
                await this.handleSignal(signal, true);
            }
        }
    }

    private _setupPeerConnectionListeners(): void {
        if (!this._peerConnection) return;

        this._peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.onsignal) {
                this.onsignal({ type: 'candidate', candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate });
            }
        };

        this._peerConnection.oniceconnectionstatechange = () => {
            if (!this._peerConnection) return;
            const state = this._peerConnection.iceConnectionState;
            console.log(`WebRTCClient: ICE connection state change: ${state}`);
            if (state === 'failed' || state === 'disconnected' || state === 'closed') {
                const error = new WebRTCClientError(`ICE connection state is ${state}`, `ICE_${state.toUpperCase()}`);
                if (this.onerror) this.onerror(error);
                // Consider auto-closing or signaling an error for the user to handle.
                // For now, we mostly rely on data channel's onclose.
                if (state === 'closed' && this.onclose) {
                    // This might be redundant if data channel onclose also fires, but covers PC close.
                    // this.onclose(); 
                }
            }
        };

        this._peerConnection.onconnectionstatechange = () => {
            if (!this._peerConnection) return;
            const state = this._peerConnection.connectionState;
            console.log(`WebRTCClient: Connection state change: ${state}`);
            if (state === 'failed') {
                const error = new WebRTCClientError('PeerConnection failed.', 'CONNECTION_FAILED');
                if (this.onerror) this.onerror(error);
                // this.close(); // Potentially close on failure
            } else if (state === 'connected') {
                // Connection established! Data channel should be open or opening soon.
                console.log('WebRTCClient: PeerConnection connected.');
            }
        };

        // This event is crucial for re-negotiation, e.g., if tracks are added/removed.
        // For our data-channel only use case, it's key for the initial offer if not manually created.
        this._peerConnection.onnegotiationneeded = async () => {
            if (!this._peerConnection || this._peerConnection.signalingState !== 'stable' || !this._isStarted) {
                console.log('WebRTCClient: onnegotiationneeded skipped, pc state:', this._peerConnection?.signalingState, '_isStarted:', this._isStarted);
                return;
            }
            if (this._negotiationNeededTimeout) {
                clearTimeout(this._negotiationNeededTimeout);
            }
            this._negotiationNeededTimeout = setTimeout(async () => {
                try {
                    if (!this._peerConnection || this._peerConnection.signalingState !== 'stable' || !this._isStarted) {
                        console.log('WebRTCClient: onnegotiationneeded aborted after timeout, pc state:', this._peerConnection?.signalingState, '_isStarted:', this._isStarted);
                        return;
                    }
                    console.log('WebRTCClient: onnegotiationneeded triggered, creating offer.');
                    const offer = await this._peerConnection.createOffer();
                    await this._peerConnection.setLocalDescription(offer);
                    if (this.onsignal && this._peerConnection.localDescription) {
                        this.onsignal({ type: 'offer', sdp: this._peerConnection.localDescription.sdp });
                    }
                } catch (err) {
                    const error = err instanceof Error ? err : new Error(String(err));
                    const wrappedError = new WebRTCClientError(`Failed to handle negotiationneeded: ${error.message}`, "NEGOTIATION_FAILED", error);
                    if (this.onerror) this.onerror(wrappedError);
                    else console.error(wrappedError);
                }
            }, 100); 
        };
    }

    private _setupDataChannelListeners(): void {
        if (!this._dataChannel) return;

        this._dataChannel.onopen = () => {
            console.log('WebRTCClient: Data channel opened.');
            this._resolveDataChannelOpenPromise(); // 织：当数据通道打开时，resolve Promise
        };

        this._dataChannel.onclose = () => {
            console.log('WebRTCClient: Data channel closed.');
            if (this.onclose) {
                this.onclose();
            }
            // We might want to fully close the peer connection here as well, if not already handled.
            // this.close();
        };

        this._dataChannel.onerror = (event) => {
            const errorEvent = event as RTCErrorEvent; // Cast to access error details if needed
            const message = errorEvent.error ? errorEvent.error.message : 'Data channel error';
            const wrappedError = new WebRTCClientError(message, "DATA_CHANNEL_ERROR", errorEvent.error);
            this._rejectDataChannelOpenPromise(wrappedError); // 织：在数据通道出错时 reject Promise
            if (this.onerror) {
                this.onerror(wrappedError);
            } else {
                console.error('WebRTCClient: Data channel error:', wrappedError);
            }
        };

        this._dataChannel.onmessage = (event: MessageEvent) => {
            if (!this.onmessage) return;

            const messageData = event.data;
            let parsedMessage: JSONRPCMessage;
            try {
                if (typeof messageData !== 'string') {
                    throw new WebRTCClientError("Received non-string message data. Expected JSON string.", "INVALID_MESSAGE_FORMAT");
                }
                const rawMessage = JSON.parse(messageData);
                parsedMessage = JSONRPCMessageSchema.parse(rawMessage);
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                const wrappedError = new WebRTCClientError(`Failed to parse message: ${err.message}`, "PARSE_ERROR", err);
                if (this.onerror) this.onerror(wrappedError);
                else console.error(wrappedError);
                return;
            }
            this.onmessage(parsedMessage);
        };
    }

    /**
     * Handles an incoming signaling message (answer or ICE candidate) from the remote peer.
     * @param {WebRTCSignalMessage} signal The signaling message.
     * @returns {Promise<void>}
     * @throws {WebRTCClientError} If transport not started or signal is invalid.
     */
    public async handleSignal(signal: WebRTCSignalMessage, fromQueue: boolean = false): Promise<void> {
        if (!this._isStarted && !fromQueue) {
            console.log(`WebRTCClient: PeerConnection not fully started. Queuing signal: ${signal.type}`);
            this._pendingSignalQueue.push(signal);
            return;
        }
        if (!this._peerConnection) {
            const errMsg = "PeerConnection not initialized despite _isStarted or called from queue. This is unexpected.";
            console.error(`WebRTCClientError: ${errMsg}`);
            const wrappedError = new WebRTCClientError(errMsg, "UNEXPECTED_STATE");
            if (this.onerror) this.onerror(wrappedError);
            throw wrappedError;
        }

        try {
            if (signal.type === 'answer') {
                if (!signal.sdp) {
                    throw new WebRTCClientError("Received answer signal without SDP.", "INVALID_SIGNAL");
                }
                const answerDesc = new RTCSessionDescription({ type: 'answer', sdp: signal.sdp });
                await this._peerConnection.setRemoteDescription(answerDesc);
            } else if (signal.type === 'candidate') {
                if (signal.candidate) {
                    await this._peerConnection.addIceCandidate(signal.candidate);
                }
            } else {
                // Client should not receive 'offer' signals if it's the initiator
                console.warn('WebRTCClient: Received unexpected signal type:', signal.type);
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            const wrappedError = new WebRTCClientError(`Failed to handle signal (${signal.type}): ${err.message}`, "SIGNAL_ERROR", err);
             if (this.onerror) this.onerror(wrappedError);
             else console.error(wrappedError);
            throw wrappedError;
        }
    }

    /**
     * Sends a JSONRPCMessage over the RTCDataChannel.
     * @param {JSONRPCMessage} message The message to send.
     * @returns {Promise<void>}
     * @throws {WebRTCClientError} If data channel is not open or sending fails.
     */
    public async send(message: JSONRPCMessage): Promise<void> {
        if (!this._dataChannel || this._dataChannel.readyState !== 'open') {
            throw new WebRTCClientError("Data channel is not open. Cannot send message.", "CHANNEL_NOT_OPEN");
        }
        try {
            const messageString = JSON.stringify(message);
            this._dataChannel.send(messageString);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            const wrappedError = new WebRTCClientError(`Failed to send message: ${err.message}`, "SEND_FAILED", err);
            if (this.onerror) this.onerror(wrappedError);
            else console.error(wrappedError);
            throw wrappedError;
        }
    }

    /**
     * Closes the transport, data channel, and peer connection.
     * @returns {Promise<void>}
     */
    public async close(): Promise<void> {
        console.log('WebRTCClient: Closing...');
        // 织：如果 start() 正在等待 _dataChannelOpenPromise，则拒绝它以解除等待状态
        if (this._rejectDataChannelOpenPromise) {
            // 使用一个特定的错误或状态，表明是由于关闭操作导致的
            this._rejectDataChannelOpenPromise(new WebRTCClientError("Transport closed while data channel was pending open.", "CLOSED_PENDING_OPEN"));
        }
        this._isStarted = false;
        this._pendingSignalQueue = [];
        if (this._negotiationNeededTimeout) {
            clearTimeout(this._negotiationNeededTimeout);
            this._negotiationNeededTimeout = null;
        }
        if (this._dataChannel) {
            if (this._dataChannel.readyState === 'open' || this._dataChannel.readyState === 'connecting') {
                this._dataChannel.close();
            }
            this._dataChannel.onopen = null;
            this._dataChannel.onclose = null;
            this._dataChannel.onerror = null;
            this._dataChannel.onmessage = null;
            this._dataChannel = undefined;
        }
        if (this._peerConnection) {
            if (this._peerConnection.signalingState !== 'closed') {
                this._peerConnection.close();
            }
            this._peerConnection.onicecandidate = null;
            this._peerConnection.oniceconnectionstatechange = null;
            this._peerConnection.onconnectionstatechange = null;
            this._peerConnection.onnegotiationneeded = null;
            this._peerConnection.ondatachannel = null; // Client doesn't expect incoming datachannels by default
            this._peerConnection = undefined;
        }
        if (this.onclose) {
            // Ensure onclose is called, even if DataChannel's onclose didn't fire or was already cleaned up.
            // this.onclose(); // Be careful about double-calling if DC onclose also triggers this.
        }
        console.log('WebRTCClient: Closed.');
        // No promise needed as RTCPeerConnection.close() is synchronous in effect for JS.
    }
}

// 辅助函数 appendLog，如果在此文件作用域内需要，但测试脚本通常在外部定义
// function appendLog(logElId: string, message: string) { console.log(message); } 