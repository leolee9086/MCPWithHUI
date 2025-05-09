import { z } from "zod";

// 哥哥，这里的 JSONRPCMessageSchema 导入路径还是需要确认哦！
import { JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";
import type { WebRTCSignalMessage } from "../client/webRTCClientTransport.js"; // Import the signal type

type JSONRPCMessage = z.infer<typeof JSONRPCMessageSchema>;

/**
 * Error class for WebRTCServerTransport specific errors.
 */
export class WebRTCServerError extends Error {
    public code?: string;
    public originalError?: any;

    constructor(message: string, code?: string, originalError?: any) {
        super(`WebRTCServerError: ${message}`);
        this.name = "WebRTCServerError";
        this.code = code;
        this.originalError = originalError;
    }
}

const DEFAULT_RTC_CONFIGURATION: RTCConfiguration = {
    // iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    // 哥哥可以根据需要在这里配置 STUN/TURN 服务器
};

const DATA_CHANNEL_LABEL = 'mcp-datachannel'; // Must match the client's label

/**
 * Server-like transport for WebRTC: this will establish a peer-to-peer connection
 * by accepting an offer and responding with an answer. It uses RTCDataChannel 
 * for sending/receiving JSONRPC messages. Requires an external signaling mechanism.
 */
export class WebRTCServerTransport {
    private _peerConnection?: RTCPeerConnection;
    private _dataChannel?: RTCDataChannel;
    private _rtcConfiguration: RTCConfiguration;

    public onmessage?: (message: JSONRPCMessage) => void;
    public onerror?: (error: Error) => void;
    public onclose?: () => void;
    public onsignal?: (signal: WebRTCSignalMessage) => void; // Callback to send signaling messages (answer, candidate)

    /**
     * Creates an instance of WebRTCServerTransport.
     * @param rtcConfiguration Optional RTCConfiguration for the RTCPeerConnection.
     * @throws {WebRTCServerError} If RTCPeerConnection API is not available.
     */
    constructor(rtcConfiguration?: RTCConfiguration) {
        if (typeof RTCPeerConnection === "undefined") {
            throw new WebRTCServerError("RTCPeerConnection API is not available in this environment.", "API_UNAVAILABLE");
        }
        this._rtcConfiguration = rtcConfiguration || DEFAULT_RTC_CONFIGURATION;
    }

    /**
     * Starts the transport. Initializes the RTCPeerConnection and sets it up to listen for data channels.
     * Unlike the client, it does not create an offer here. It waits for an offer via `handleSignal`.
     * @returns {Promise<void>} A promise that resolves when the transport is ready to receive an offer.
     * @throws {Error} If the transport is already started.
     */
    public async start(): Promise<void> {
        if (this._peerConnection) {
            throw new Error("WebRTCServerTransport already started!");
        }

        try {
            this._peerConnection = new RTCPeerConnection(this._rtcConfiguration);
            this._setupPeerConnectionListeners();
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            const wrappedError = new WebRTCServerError(`Failed to start WebRTC server transport: ${err.message}`, "START_FAILED", err);
            if (this.onerror) {
                this.onerror(wrappedError);
            } else {
                console.error(wrappedError);
            }
            await this.close(); // Cleanup on failure
            throw wrappedError;
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
            console.log(`WebRTCServer: ICE connection state change: ${state}`);
            if (state === 'failed' || state === 'disconnected' || state === 'closed') {
                const error = new WebRTCServerError(`ICE connection state is ${state}`, `ICE_${state.toUpperCase()}`);
                if (this.onerror) this.onerror(error);
                 if (state === 'closed' && this.onclose) {
                    // this.onclose(); 
                }
            }
        };

        this._peerConnection.onconnectionstatechange = () => {
            if (!this._peerConnection) return;
            const state = this._peerConnection.connectionState;
            console.log(`WebRTCServer: Connection state change: ${state}`);
            if (state === 'failed') {
                const error = new WebRTCServerError('PeerConnection failed.', 'CONNECTION_FAILED');
                if (this.onerror) this.onerror(error);
            } else if (state === 'connected') {
                console.log('WebRTCServer: PeerConnection connected.');
            }
        };

        // Server side waits for the client to initiate a data channel
        this._peerConnection.ondatachannel = (event: RTCDataChannelEvent) => {
            console.log('WebRTCServer: Data channel received.');
            if (event.channel.label !== DATA_CHANNEL_LABEL) {
                console.warn(`WebRTCServer: Received data channel with unexpected label: ${event.channel.label}. Expected: ${DATA_CHANNEL_LABEL}`);
                // Optionally, close the unexpected channel or ignore it.
                // event.channel.close(); 
                return;
            }
            this._dataChannel = event.channel;
            this._setupDataChannelListeners();
        };
    }

    private _setupDataChannelListeners(): void {
        if (!this._dataChannel) return;

        this._dataChannel.onopen = () => {
            console.log('WebRTCServer: Data channel opened.');
        };

        this._dataChannel.onclose = () => {
            console.log('WebRTCServer: Data channel closed.');
            if (this.onclose) {
                this.onclose();
            }
        };

        this._dataChannel.onerror = (event) => {
            const errorEvent = event as RTCErrorEvent;
            const message = errorEvent.error ? errorEvent.error.message : 'Data channel error on server';
            const wrappedError = new WebRTCServerError(message, "DATA_CHANNEL_ERROR", errorEvent.error);
            if (this.onerror) {
                this.onerror(wrappedError);
            } else {
                console.error('WebRTCServer: Data channel error:', wrappedError);
            }
        };

        this._dataChannel.onmessage = (event: MessageEvent) => {
            if (!this.onmessage) return;

            const messageData = event.data;
            let parsedMessage: JSONRPCMessage;
            try {
                if (typeof messageData !== 'string') {
                    throw new WebRTCServerError("Received non-string message data. Expected JSON string.", "INVALID_MESSAGE_FORMAT");
                }
                const rawMessage = JSON.parse(messageData);
                parsedMessage = JSONRPCMessageSchema.parse(rawMessage);
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                const wrappedError = new WebRTCServerError(`Failed to parse message: ${err.message}`, "PARSE_ERROR", err);
                if (this.onerror) this.onerror(wrappedError);
                else console.error(wrappedError);
                return;
            }
            this.onmessage(parsedMessage);
        };
    }

    /**
     * Handles an incoming signaling message (offer or ICE candidate) from the remote peer.
     * If an offer is received, it creates an answer.
     * @param {WebRTCSignalMessage} signal The signaling message.
     * @returns {Promise<void>}
     * @throws {WebRTCServerError} If transport not started, signal is invalid, or processing fails.
     */
    public async handleSignal(signal: WebRTCSignalMessage): Promise<void> {
        if (!this._peerConnection) {
            throw new WebRTCServerError("PeerConnection not initialized. Call start() first.", "NOT_STARTED");
        }

        try {
            if (signal.type === 'offer') {
                if (!signal.sdp) {
                    throw new WebRTCServerError("Received offer signal without SDP.", "INVALID_SIGNAL");
                }
                const offerDesc = new RTCSessionDescription({ type: 'offer', sdp: signal.sdp });
                await this._peerConnection.setRemoteDescription(offerDesc);
                
                const answer = await this._peerConnection.createAnswer();
                await this._peerConnection.setLocalDescription(answer);
                
                if (this.onsignal && this._peerConnection.localDescription) {
                    this.onsignal({ type: 'answer', sdp: this._peerConnection.localDescription.sdp });
                }
            } else if (signal.type === 'candidate') {
                if (signal.candidate) {
                    await this._peerConnection.addIceCandidate(signal.candidate);
                }
            } else {
                // Server should not receive 'answer' signals unless it also sent an offer (not typical for this model)
                console.warn('WebRTCServer: Received unexpected signal type:', signal.type);
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            const wrappedError = new WebRTCServerError(`Failed to handle signal: ${err.message}`, "SIGNAL_ERROR", err);
            if (this.onerror) this.onerror(wrappedError);
            else console.error(wrappedError);
            throw wrappedError;
        }
    }

    /**
     * Sends a JSONRPCMessage over the RTCDataChannel.
     * @param {JSONRPCMessage} message The message to send.
     * @returns {Promise<void>}
     * @throws {WebRTCServerError} If data channel is not open or sending fails.
     */
    public async send(message: JSONRPCMessage): Promise<void> {
        if (!this._dataChannel || this._dataChannel.readyState !== 'open') {
            throw new WebRTCServerError("Data channel is not open. Cannot send message.", "CHANNEL_NOT_OPEN");
        }
        try {
            const messageString = JSON.stringify(message);
            this._dataChannel.send(messageString);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            const wrappedError = new WebRTCServerError(`Failed to send message: ${err.message}`, "SEND_FAILED", err);
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
        console.log('WebRTCServer: Closing...');
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
            this._peerConnection.ondatachannel = null;
            this._peerConnection = undefined;
        }
        if (this.onclose) {
            // Ensure onclose is called
            // this.onclose(); // Careful about double-calling
        }
        console.log('WebRTCServer: Closed.');
    }
} 