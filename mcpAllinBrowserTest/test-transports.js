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
async function testBroadcastChannel() {
    const statusEl = 'broadcast-status';
    const logEl = 'broadcast-log';
    updateStatus(statusEl, null, 'BroadcastChannel Test starting...');
    appendLog(logEl, '--- BroadcastChannel Test ---');

    const CHANNEL_NAME = 'mcp-test-broadcast-channel';

    try {
        // Server Part
        appendLog(logEl, '[BC Server] Initializing...');
        const bcServer = new HuiMcpServer(serverInfo);
        bcServer.tool(
            echoTool.name, 
            echoTool.description, 
            echoTool.inputSchema, 
            echoTool.execute
        );
        const bcServerTransport = new BroadcastChannelServerTransport(CHANNEL_NAME);
        bcServerTransport.onerror = (err) => appendLog(logEl, `[BC Server Transport Error] ${err.message}`);
        bcServerTransport.onclose = () => appendLog(logEl, '[BC Server Transport] Closed.');
        await bcServer.connect(bcServerTransport);
        appendLog(logEl, '[BC Server] Ready and listening (transport started by server.connect).');

        // Client Part
        appendLog(logEl, '[BC Client] Initializing...');
        const bcClient = new HuiMcpClient(clientInfo);
        const bcClientTransport = new BroadcastChannelClientTransport(CHANNEL_NAME);
        bcClientTransport.onerror = (err) => appendLog(logEl, `[BC Client Transport Error] ${err.message}`);
        bcClientTransport.onclose = () => appendLog(logEl, '[BC Client Transport] Closed.');
        await bcClient.connect(bcClientTransport);
        appendLog(logEl, '[BC Client] Connected (transport started by client.connect).');

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
        await bcClient.close();
        await bcServer.close(); // This should also close the server transport
        // bcClientTransport.close(); // client.close() should handle this
        // bcServerTransport.close(); // server.close() should handle this

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

// Helper to wait for data channel to open by polling its state
async function waitForDataChannelOpen(transport, logElId, transportName, timeoutMs = 10000, intervalMs = 200) {
    appendLog(logElId, `[${transportName}] Waiting for data channel to open (max ${timeoutMs / 1000}s)...`);
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        // @ts-ignore _dataChannel is private, used here for robust testing
        if (transport._dataChannel && transport._dataChannel.readyState === 'open') {
            // @ts-ignore _dataChannel is private
            appendLog(logElId, `[${transportName}] Data channel is open. State: ${transport._dataChannel.readyState}`);
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    // @ts-ignore _dataChannel is private
    const state = transport._dataChannel ? transport._dataChannel.readyState : 'not available';
    appendLog(logElId, `[${transportName}] Data channel did NOT open within ${timeoutMs / 1000}s. Current state: ${state}`);
    return false;
}

async function testWebRTC() {
    const statusEl = 'webrtc-status';
    const logEl = 'webrtc-log';
    updateStatus(statusEl, null, 'WebRTC Test starting...');
    appendLog(logEl, '--- WebRTC Test ---');

    // Simple in-memory signaling for this test
    let clientSignalQueue = [];
    let serverSignalQueue = [];

    try {
        // Server Part
        appendLog(logEl, '[WebRTC Server] Initializing...');
        const rtcServer = new HuiMcpServer(serverInfo);
        rtcServer.tool(
            echoTool.name, 
            echoTool.description, 
            echoTool.inputSchema, 
            echoTool.execute
        );
        const rtcServerTransport = new WebRTCServerTransport(); // Using default RTCConfiguration
        rtcServerTransport.onerror = (err) => appendLog(logEl, `[WebRTC Server Transport Error] ${err.message}`);
        rtcServerTransport.onclose = () => appendLog(logEl, '[WebRTC Server Transport] Closed.');
        rtcServerTransport.onsignal = (signal) => {
            appendLog(logEl, `[WebRTC Server] Signaling to Client: ${signal.type}`);
            setTimeout(() => rtcClientTransport.handleSignal(signal), 0);
        };
        await rtcServer.connect(rtcServerTransport);
        appendLog(logEl, '[WebRTC Server] Ready, awaiting offer (transport started by server.connect).');

        // Client Part
        appendLog(logEl, '[WebRTC Client] Initializing...');
        const rtcClient = new HuiMcpClient(clientInfo);
        const rtcClientTransport = new WebRTCClientTransport(); // Using default RTCConfiguration
        rtcClientTransport.onerror = (err) => appendLog(logEl, `[WebRTC Client Transport Error] ${err.message}`);
        rtcClientTransport.onclose = () => appendLog(logEl, '[WebRTC Client Transport] Closed.');
        rtcClientTransport.onsignal = (signal) => {
            appendLog(logEl, `[WebRTC Client] Signaling to Server: ${signal.type}`);
            setTimeout(() => rtcServerTransport.handleSignal(signal), 0);
        };
        await rtcClient.connect(rtcClientTransport);
        appendLog(logEl, '[WebRTC Client] Client connect initiated. Waiting for data channels to open.');

        // Wait for data channels to open using the new helper
        const clientChannelOpen = await waitForDataChannelOpen(rtcClientTransport, logEl, 'WebRTC Client Transport');
        const serverChannelOpen = await waitForDataChannelOpen(rtcServerTransport, logEl, 'WebRTC Server Transport');

        if (!clientChannelOpen) {
            throw new Error('WebRTC Client DataChannel did not open in time.');
        }
        if (!serverChannelOpen) {
            // Log non-critical failure for server if client is primary
            appendLog(logEl, '[WebRTC Server Transport] Server data channel did not open in time. Test might be unstable.');
        }

        appendLog(logEl, '[WebRTC Client] Checking data channel state (post-wait)...');
        // @ts-ignore _dataChannel is private but we peek for test logging
        if (!rtcClientTransport._dataChannel || rtcClientTransport._dataChannel.readyState !== 'open') {
             // @ts-ignore
            const dcState = rtcClientTransport._dataChannel ? rtcClientTransport._dataChannel.readyState : 'not available';
            appendLog(logEl, `[WebRTC Client] Data channel not open. State: ${dcState}. Test might fail.`);
        }
        // @ts-ignore _dataChannel is private
        if (!rtcServerTransport._dataChannel || rtcServerTransport._dataChannel.readyState !== 'open') {
            // @ts-ignore
            const dcState = rtcServerTransport._dataChannel ? rtcServerTransport._dataChannel.readyState : 'not available';
            appendLog(logEl, `[WebRTC Server] Data channel not open. State: ${dcState}. Test might fail.`);
        }

        // Test: listTools
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

        // Cleanup
        await rtcClient.close();
        await rtcServer.close();

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        appendLog(logEl, `[WebRTC Test Error] ${errorMessage}`);
        updateStatus(statusEl, false, `WebRTC Test FAILED: ${errorMessage}`);
    }
    appendLog(logEl, '--- WebRTC Test Ended ---');
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