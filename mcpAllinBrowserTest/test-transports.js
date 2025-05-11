import { HuiMcpClient } from '@mcpwithhui/hui/dist/browser/hui-client.esm.js';
import { HuiMcpServer } from '@mcpwithhui/hui/dist/browser/hui-server.esm.js';
import { z } from 'zod';
// Assuming the new transport files are also exported by @mcpwithhui/hui package
// We need to make sure the package.json of @mcpwithhui/hui exports these paths.
// For now, let's assume they might be under a subpath like '@mcpwithhui/hui/transports/...' 
// or that the main package exports them directly.
// Given our current build scripts, they are NOT automatically part of the main hui/client or hui/server exports.
// The build scripts output them as separate files.

// THEREFORE, we need to define how these are exported from the @mcpwithhui/hui package
// OR, for Vite to resolve them correctly, they need to be importable via the linked package.

// OPTION 1: If @mcpwithhui/hui's package.json exports these specifically:
// Example (hypothetical - requires hui's package.json to define these exports):
// import { BroadcastChannelClientTransport } from '@mcpwithhui/hui/broadcastchannel-client';
// import { BroadcastChannelServerTransport } from '@mcpwithhui/hui/broadcastchannel-server';
// import { WebRTCClientTransport } from '@mcpwithhui/hui/webrtc-client';
// import { WebRTCServerTransport } from '@mcpwithhui/hui/webrtc-server';

// OPTION 2: If the built files are accessible via their full path within the linked package's dist:
// This is more robust if the package.json doesn't explicitly export every single built file.
// Vite should resolve '@mcpwithhui/hui' to the symlinked 'packages/hui' directory.
import { BroadcastChannelClientTransport } from '@mcpwithhui/hui/dist/browser/mcp-hui-broadcastchannel-client.esm.js';
import { BroadcastChannelServerTransport } from '@mcpwithhui/hui/dist/browser/mcp-hui-broadcastchannel-server.esm.js';
import { WebRTCClientTransport } from '@mcpwithhui/hui/dist/browser/mcp-hui-webrtc-client.esm.js';
import { WebRTCServerTransport } from '@mcpwithhui/hui/dist/browser/mcp-hui-webrtc-server.esm.js';

console.log('Test script loaded.');

// Helper to update status and log on the HTML page
function updateStatus(elementId, success, message) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.className = 'status ' + (success ? 'success' : (success === false ? 'error' : 'running'));
    }
    console.log(`${elementId}: ${message}`);
}

function appendLog(logElementId, message) {
    const el = document.getElementById(logElementId);
    if (el) {
        el.textContent += message + '\n';
    }
    console.log(message);
}

// --- Shared Client/Server Info ---
const clientInfo = { name: 'TestClient', version: '1.0.0' };
const serverInfo = { name: 'TestServer', version: '1.0.0' };

// --- Echo Tool Definition ---
const echoTool = {
    name: 'echo',
    description: 'Echoes back the input message.',
    inputSchema:{ message: z.string() },
    outputSchema: { echoedMessage: z.string() },
    execute: async (...args) => {
        console.log(`[EchoTool EXECUTE START] All arguments received:`, args);
        
        const firstArg = args[0];
        console.log(`[EchoTool EXECUTE START] Keys of first argument:`, firstArg ? firstArg : 'null or undefined');

        // 织：尝试从不同地方获取 message
        let messageToEcho = undefined;
        if (firstArg && typeof firstArg.input === 'object' && firstArg.input !== null && typeof firstArg.input.message === 'string') {
            messageToEcho = firstArg.input.message; // 假设 input 在 firstArg.input.message
            console.log('[EchoTool EXECUTE] Found message in firstArg.input.message');
        } else if (firstArg && typeof firstArg.message === 'string') {
            messageToEcho = firstArg.message; // 假设 message 直接在 firstArg.message (不太可能了，根据上次日志)
            console.log('[EchoTool EXECUTE] Found message in firstArg.message');
        } else if (args.length > 1 && typeof args[1] === 'object' && args[1] !== null && typeof args[1].message === 'string') {
            messageToEcho = args[1].message; // 假设 input 在第二个参数的 message 属性
            console.log('[EchoTool EXECUTE] Found message in secondArg.message');
        } else if (args.length > 1 && typeof args[1] === 'object' && args[1] !== null && typeof args[1].input === 'object' && args[1].input !== null && typeof args[1].input.message === 'string') {
            messageToEcho = args[1].input.message; // 假设 input 在第二个参数的 input.message 属性
            console.log('[EchoTool EXECUTE] Found message in secondArg.input.message');
        }

        if (typeof messageToEcho !== 'string') {
            console.error('[EchoTool EXECUTE] Error: Could not find a string message to echo. Received firstArg:', JSON.stringify(firstArg, null, 2));
         //   throw new Error('Input message (string) not found in expected place.');
        }
        
        const result ={content:[ {type:'text',text: `Server echoes: ${messageToEcho}`}]}
        console.log(`[EchoTool EXECUTE END] Returning result:`, JSON.stringify(result, null, 2));
        return result;
    },
};

// ====================================
// BroadcastChannel Test
// ====================================

// 织: 定义与客户端一致的发现协议常量和类型 (仅用于测试脚本内部模拟)
const MCP_DISCOVERY_PROTOCOL_TEST = 'mcp-discovery-v1'; 
// type SessionRequestMessage_Test = { protocol: string, type: 'request-session', clientIdHint: string };
// type SessionResponseMessage_Test = { protocol: string, type: 'session-granted', clientIdHint?: string, sessionId: string, sessionChannelName: string };

async function testBroadcastChannel() {
    const statusEl = 'broadcast-status';
    const logEl = 'broadcast-log';
    updateStatus(statusEl, null, 'BroadcastChannel Test starting (with session discovery)...');
    appendLog(logEl, '--- BroadcastChannel Test (Session Discovery) ---');

    const DISCOVERY_CHANNEL_NAME = 'mcp-test-discovery-channel-' + Date.now(); // Make it unique per test run to avoid clashes
    let discoveryListenerChannel; // For the server-side discovery listener
    let bcServer; // Will hold the HuiMcpServer for the session
    let bcServerTransport; // Will hold the server transport for the session
    let bcClient; // Will hold the HuiMcpClient
    let bcClientTransport; // Will hold the client transport

    try {
        // Server-Side: Setup Discovery Listener
        appendLog(logEl, `[BC Discovery Server] Initializing listener on: ${DISCOVERY_CHANNEL_NAME}`);
        discoveryListenerChannel = new BroadcastChannel(DISCOVERY_CHANNEL_NAME);

        const serverSessionPromise = new Promise((resolveSession, rejectSession) => {
            discoveryListenerChannel.onmessage = async (event) => {
                try {
                    const request = JSON.parse(event.data);
                    appendLog(logEl, `[BC Discovery Server] Received on discovery: ${JSON.stringify(request)}`);

                    if (request.protocol === MCP_DISCOVERY_PROTOCOL_TEST && request.type === 'request-session' && request.clientIdHint) {
                        appendLog(logEl, `[BC Discovery Server] Valid session request from ${request.clientIdHint}. Granting session.`);
                        
                        const sessionId = crypto.randomUUID();
                        const sessionChannelName = `mcp-session-${sessionId}`;

                        // Create HuiMcpServer and its dedicated transport for this session
                        bcServer = new HuiMcpServer(serverInfo);
                        bcServer.tool(
                            echoTool.name, 
                            echoTool.description, 
                            echoTool.inputSchema, 
                            echoTool.execute
                        );
                        // 织: Server transport now takes sessionChannelName and sessionId
                        bcServerTransport = new BroadcastChannelServerTransport(sessionChannelName, sessionId);
                        bcServerTransport.onerror = (err) => appendLog(logEl, `[BC Session Server Transport SID: ${sessionId} Error] ${err.message}`);
                        bcServerTransport.onclose = () => appendLog(logEl, `[BC Session Server Transport SID: ${sessionId}] Closed.`);
                        
                        await bcServer.connect(bcServerTransport);
                        appendLog(logEl, `[BC Session Server SID: ${sessionId}] Ready on channel ${sessionChannelName}.`);

                        const responseMsg = {
                            protocol: MCP_DISCOVERY_PROTOCOL_TEST,
                            type: 'session-granted',
                            clientIdHint: request.clientIdHint,
                            sessionId: sessionId,
                            sessionChannelName: sessionChannelName
                        };
                        appendLog(logEl, `[BC Discovery Server] Sending session grant to ${request.clientIdHint}: ${JSON.stringify(responseMsg)}`);
                        discoveryListenerChannel.postMessage(JSON.stringify(responseMsg));
                        
                        // Discovery part is done for this server, resolve the promise for cleanup later
                        resolveSession({ server: bcServer, transport: bcServerTransport }); 

                        // Optional: Close discovery channel after one successful session grant for this test
                        // discoveryListenerChannel.close();
                        // discoveryListenerChannel = null;
                        // appendLog(logEl, '[BC Discovery Server] Listener closed after granting session.');
                    } else {
                        appendLog(logEl, `[BC Discovery Server] Ignored irrelevant message on discovery: ${event.data}`);
                    }
                } catch (e) {
                    const errorMsg = e instanceof Error ? e.message : String(e);
                    appendLog(logEl, `[BC Discovery Server] Error processing discovery message: ${errorMsg}`);
                    rejectSession(new Error(`Discovery server processing error: ${errorMsg}`));
                }
            };
            discoveryListenerChannel.onmessageerror = (event) => {
                 appendLog(logEl, `[BC Discovery Server] Message error on discovery channel: ${JSON.stringify(event.data)}`);
                 // Potentially rejectSession or log more verbosely
            };
        });

        // Client Part: Connect using discovery
        appendLog(logEl, `[BC Client] Initializing with discovery channel: ${DISCOVERY_CHANNEL_NAME}`);
        // 织: Client transport now takes discoveryChannelName
        bcClientTransport = new BroadcastChannelClientTransport(DISCOVERY_CHANNEL_NAME, 15000); // 15s timeout for session
        bcClientTransport.onerror = (err) => appendLog(logEl, `[BC Client Transport Error] ${err.message}`);
        bcClientTransport.onclose = () => appendLog(logEl, `[BC Client Transport] Closed.`);
        
        bcClient = new HuiMcpClient(clientInfo);
        await bcClient.connect(bcClientTransport); // This will internally call establishSession then start
        appendLog(logEl, `[BC Client] Session established (SID: ${bcClientTransport.getSessionId()}) and connected.`);

        // Test: listTools
        appendLog(logEl, '[BC Client] Calling listTools...');
        const listToolsResponse = await bcClient.listTools();
        appendLog(logEl, `[BC Client] listTools response: ${JSON.stringify(listToolsResponse, null, 2)}`);
        
        const actualToolsArray = listToolsResponse.tools;

        if (!actualToolsArray || !Array.isArray(actualToolsArray) || actualToolsArray.length === 0) {
            throw new Error('listTools did not return a valid tools array or the array is empty.');
        }

        const echoToolInResponse = actualToolsArray.find(tool => tool.name === 'echo');
        if (!echoToolInResponse) {
            throw new Error('listTools did not return the echo tool.');
        }
        appendLog(logEl, `[BC Client] Found echo tool: ${JSON.stringify(echoToolInResponse, null, 2)}`);

        // Test: echo tool
        const testMessage = 'Hello via BroadcastChannel!';
        appendLog(logEl, `[BC Client] Calling echo with message: "${testMessage}"`);
        const echoResponse = await bcClient.callTool({ 
            name: 'echo', 
            arguments: { message: testMessage }
        });
        appendLog(logEl, `[BC Client] echo response: ${JSON.stringify(echoResponse)}`);
        if (!echoResponse || !echoResponse.content || !echoResponse.content[0] || echoResponse.content[0].type !== 'text' || echoResponse.content[0].text !== `Server echoes: ${testMessage}`) {
            throw new Error('Echo tool did not return the correct message or format.');
        }

        updateStatus(statusEl, true, 'BroadcastChannel Test PASSED!');
        
        // Cleanup
        appendLog(logEl, '[BC Test] Starting cleanup...');
        if (bcClient) await bcClient.close(); // Should close client transport
        appendLog(logEl, '[BC Test] Client closed.');
        
        // Wait for server resources created in discovery to be available for cleanup
        const sessionServerResources = await serverSessionPromise; 
        if (sessionServerResources && sessionServerResources.server) await sessionServerResources.server.close(); // Should close server transport
        appendLog(logEl, '[BC Test] Session Server closed.');

        if (discoveryListenerChannel) {
            discoveryListenerChannel.onmessage = null;
            discoveryListenerChannel.onmessageerror = null;
            discoveryListenerChannel.close();
            appendLog(logEl, '[BC Test] Discovery listener channel closed.');
        }

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        appendLog(logEl, `[BC Test Error] ${errorMessage}`);
        updateStatus(statusEl, false, `BroadcastChannel Test FAILED: ${errorMessage}`);
        throw err;
    }
    appendLog(logEl, '--- BroadcastChannel Test Ended ---');
}

// ====================================
// WebRTC Test
// ====================================

// 织: waitForDataChannelOpen 辅助函数将被移除，逻辑已移入 transport 内部
// async function waitForDataChannelOpen(transport, logElId, transportName, timeoutMs = 10000, intervalMs = 200) { ... }

async function testWebRTC() {
    const statusEl = 'webrtc-status';
    const logEl = 'webrtc-log';
    updateStatus(statusEl, null, 'WebRTC Test starting (Manual Signaling Mode)...');
    appendLog(logEl, '--- WebRTC Test (Manual Signaling) ---');

    // Get a handle to the new HTML elements
    const serverSignalOutEl = document.getElementById('webrtc-server-signal-out');
    const serverSignalInEl = document.getElementById('webrtc-server-signal-in');
    const serverHandleBtn = document.getElementById('webrtc-server-handle-signal-btn');
    const clientSignalOutEl = document.getElementById('webrtc-client-signal-out');
    const clientSignalInEl = document.getElementById('webrtc-client-signal-in');
    const clientHandleBtn = document.getElementById('webrtc-client-handle-signal-btn');

    let rtcServer;
    let rtcClient;
    let rtcServerTransport;
    let rtcClientTransport;

    const DATA_CHANNEL_TIMEOUT = 15000; // 15 seconds

    try {
        appendLog(logEl, '[WebRTC Server] Initializing...');
        rtcServer = new HuiMcpServer(serverInfo);
        rtcServer.tool(
            echoTool.name, 
            echoTool.description, 
            echoTool.inputSchema, 
            echoTool.execute
        );
        rtcServerTransport = new WebRTCServerTransport(undefined, DATA_CHANNEL_TIMEOUT); 
        rtcServerTransport.onerror = (err) => {
            appendLog(logEl, `[WebRTC Server Transport Error] ${err.message}`);
            serverSignalOutEl.value = `ERROR: ${err.message}`;
        };
        rtcServerTransport.onclose = () => appendLog(logEl, '[WebRTC Server Transport] Closed.');
        
        rtcClientTransport = new WebRTCClientTransport(undefined, DATA_CHANNEL_TIMEOUT);
        rtcClientTransport.onerror = (err) => {
            appendLog(logEl, `[WebRTC Client Transport Error] ${err.message}`);
            clientSignalOutEl.value = `ERROR: ${err.message}`;
        };
        rtcClientTransport.onclose = () => appendLog(logEl, '[WebRTC Client Transport] Closed.');

        // Setup manual signaling
        rtcServerTransport.onsignal = (signal) => {
            const signalStr = JSON.stringify(signal);
            appendLog(logEl, `[WebRTC Server] पद्धति onsignal: Produces Signal (for Client): ${signal.type || 'candidate'}. Raw signal: ${signalStr}`);
            serverSignalOutEl.value = signalStr;
            serverSignalOutEl.focus();
            serverSignalOutEl.select();
        };

        rtcClientTransport.onsignal = (signal) => {
            const signalStr = JSON.stringify(signal);
            appendLog(logEl, `[WebRTC Client] Produces Signal (for Server): ${signal.type || 'candidate'}`);
            clientSignalOutEl.value = signalStr;
            clientSignalOutEl.focus();
            clientSignalOutEl.select();
        };

        serverHandleBtn.onclick = () => {
            const signalStr = serverSignalInEl.value;
            if (!signalStr.trim()) {
                appendLog(logEl, '[WebRTC Server] No signal pasted to process.');
                return;
            }
            appendLog(logEl, `[WebRTC Server] Attempting to process pasted signal: ${signalStr.substring(0, 100)}...`);
            try {
                const signal = JSON.parse(signalStr);
                appendLog(logEl, `[WebRTC Server] Parsed signal successfully. Type: ${signal.type || 'candidate'}. Calling handleSignal.`);
                rtcServerTransport.handleSignal(signal);
                appendLog(logEl, '[WebRTC Server] rtcServerTransport.handleSignal() called.');
                serverSignalInEl.value = ''; // Clear after processing
            } catch (e) {
                appendLog(logEl, `[WebRTC Server] Error parsing or handling pasted signal: ${e.message}. Signal: ${signalStr}`);
            }
        };

        clientHandleBtn.onclick = () => {
            const signalStr = clientSignalInEl.value;
            if (!signalStr.trim()) {
                appendLog(logEl, '[WebRTC Client] No signal pasted to process.');
                return;
            }
            try {
                const signal = JSON.parse(signalStr);
                appendLog(logEl, `[WebRTC Client] Manually handling signal from Server: ${signal.type || 'candidate'}`);
                rtcClientTransport.handleSignal(signal);
                clientSignalInEl.value = ''; // Clear after processing
            } catch (e) {
                appendLog(logEl, `[WebRTC Client] Error parsing pasted signal: ${e.message}. Signal: ${signalStr}`);
            }
        };
        
        appendLog(logEl, '[WebRTC UI] Manual signaling UI is now active. Start the connection by initiating client or server.');
        appendLog(logEl, '[WebRTC UI] Typical flow: Server connects, then Client connects. This will produce an offer on Client output.');
        appendLog(logEl, '[WebRTC UI] Copy Client output to Server input & process. Then copy Server output to Client input & process.');
        appendLog(logEl, '[WebRTC UI] Repeat for ICE candidates until connected.');


        // Connect server (doesn't wait for data channel, just sets up to receive offer)
        await rtcServer.connect(rtcServerTransport);
        appendLog(logEl, '[WebRTC Server] Ready (via connect call). It will produce signals once client attempts to connect.');

        // Connect client (this WILL wait for its data channel to open via its internal promise,
        // AFTER signaling is manually completed by the user)
        appendLog(logEl, '[WebRTC Client] Connecting client (will produce an OFFER in its output box)...');
        rtcClient = new HuiMcpClient(clientInfo);
        
        // The actual promise for connection will be awaited later. 
        // We need to allow signals to be exchanged first.
        const clientConnectionPromise = rtcClient.connect(rtcClientTransport); 
        appendLog(logEl, '[WebRTC Client] Client connect() called. Monitor signal boxes.');

        appendLog(logEl, '[WebRTC Test] User needs to manually relay signals now using the text boxes.');
        appendLog(logEl, '[WebRTC Test] Once signals are exchanged and DataChannels established, test will proceed.');

        // Now wait for the client connection to actually complete (data channel open)
        await clientConnectionPromise;
        appendLog(logEl, '[WebRTC Client] Client connect() promise resolved. Its data channel should be open.');

        appendLog(logEl, '[WebRTC Test] Client connected. Now explicitly waiting for server data channel to confirm open...');
        await rtcServerTransport.awaitDataChannelOpen();
        appendLog(logEl, '[WebRTC Test] Server data channel confirmed open.');
        
        appendLog(logEl, '[WebRTC Client] Calling listTools...');
        const rtcListToolsResponse = await rtcClient.listTools();
        appendLog(logEl, `[WebRTC Client] listTools response: ${JSON.stringify(rtcListToolsResponse, null, 2)}`);
        
        const rtcActualToolsArray = rtcListToolsResponse.tools;

        if (!rtcActualToolsArray || !Array.isArray(rtcActualToolsArray) || rtcActualToolsArray.length === 0) {
            throw new Error('listTools via WebRTC did not return a valid tools array or the array is empty.');
        }

        const rtcEchoToolInResponse = rtcActualToolsArray.find(tool => tool.name === 'echo');
        if (!rtcEchoToolInResponse) {
            throw new Error('listTools via WebRTC did not return the echo tool.');
        }
        appendLog(logEl, `[WebRTC Client] Found echo tool via WebRTC: ${JSON.stringify(rtcEchoToolInResponse, null, 2)}`);

        // Test: echo tool
        const rtcTestMessage = 'Hello via WebRTC!';
        appendLog(logEl, `[WebRTC Client] Calling echo with message: "${rtcTestMessage}"`);
        const rtcEchoResponse = await rtcClient.callTool({ 
            name: 'echo', 
            arguments: { message: rtcTestMessage }
        });
        appendLog(logEl, `[WebRTC Client] echo response: ${JSON.stringify(rtcEchoResponse)}`);
        if (!rtcEchoResponse || !rtcEchoResponse.content || !rtcEchoResponse.content[0] || rtcEchoResponse.content[0].type !== 'text' || rtcEchoResponse.content[0].text !== `Server echoes: ${rtcTestMessage}`) {
            throw new Error('Echo tool did not return the correct message or format via WebRTC.');
        }

        updateStatus(statusEl, true, 'WebRTC Test PASSED!');

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        appendLog(logEl, `[WebRTC Test Error] ${errorMessage}`);
        updateStatus(statusEl, false, `WebRTC Test FAILED: ${errorMessage}`);
        // throw err; // Allow other tests to run
    } finally {
        appendLog(logEl, '[WebRTC Test] Entering finally block for cleanup...');
        // Remove event listeners to prevent memory leaks if test is re-run or errors out
        serverHandleBtn.onclick = null;
        clientHandleBtn.onclick = null;

        if (rtcClient) {
            try { await rtcClient.close(); appendLog(logEl, '[WebRTC Test] Client closed.'); } 
            catch (e) { appendLog(logEl, `[WebRTC Test] Error closing client: ${e.message}`); }
        }
        if (rtcServer) { // rtcServer.close() should close rtcServerTransport
            try { await rtcServer.close(); appendLog(logEl, '[WebRTC Test] Server closed.'); } 
            catch (e) { appendLog(logEl, `[WebRTC Test] Error closing server: ${e.message}`); }
        }
        // Transports are closed by their respective HuiMcpClient/Server instances.
        // Clear text areas as well
        if (serverSignalOutEl) serverSignalOutEl.value = '';
        if (serverSignalInEl) serverSignalInEl.value = '';
        if (clientSignalOutEl) clientSignalOutEl.value = '';
        if (clientSignalInEl) clientSignalInEl.value = '';
        
        appendLog(logEl, '--- WebRTC Test Ended (finally) ---');
    }
}

// Run tests after a short delay to ensure modules are loaded and DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(async () => {
        updateStatus('setup-status', true, 'All scripts loaded. Starting tests...');
        await testBroadcastChannel();
        await testWebRTC();
        updateStatus('setup-status', true, 'All tests finished.');
    }, 500);
}); 