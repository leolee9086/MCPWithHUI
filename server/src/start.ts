// Core MCP SDK imports
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'; // Added Streamable
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ErrorCode, McpError, JSONRPCRequestSchema, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'; // Moved isInitializeRequest here
import { randomUUID } from 'crypto';
import { HuiMcpServer } from '@mcpwithhui/hui/server';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

// 织: 导入新的工具注册函数
import { registerAllTools } from './toolRegistration.js'; // 确保使用 .js 后缀如果编译目标是ESM且原始文件是.ts

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
const SSE_POST_ENDPOINT_PATH = '/mcp-post'; // For legacy SSE clients
const KEEP_ALIVE_INTERVAL_MS = 25000; // 织: Added for SSE keep-alive (25 seconds)

// Create Express app
const app = express();
app.use(express.json());
app.use(cors());

// --- Shared Server Configuration ---
const sharedHuiServerConfig = {
  name: "mcp-hui-server-runner",
  version: "0.0.1",
};

// --- 织: 创建全局 HuiMcpServer 实例并注册工具 ---
const globalHuiMcpServer = new HuiMcpServer(sharedHuiServerConfig);
registerAllTools(globalHuiMcpServer);
console.log('[GlobalServer] Global HuiMcpServer instance created and tools registered.');

// 织: activeStreamableTransports 只存储 transport，因为它们都连接到 globalHuiMcpServer
const activeStreamableTransports = new Map<string, StreamableHTTPServerTransport>();
const activeSseSessions = new Map<string, { transport: SSEServerTransport, server: HuiMcpServer }>();

const simpleAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
    console.log(`[Auth] Checking for: ${req.path}, Method: ${req.method}`);
    const apiKeyFromHeader = req.headers['x-api-key'] as string | undefined;
    const apiKeyFromQuery = req.query.apiKey as string | undefined;
    const mcpSessionId = req.headers['mcp-session-id'] as string | undefined;
    const sseSessionId = req.query.sessionId as string | undefined; // For SSE POST

    // Prioritize API key for initial connection/setup
    const apiKey = apiKeyFromHeader || apiKeyFromQuery;
    if (apiKey === 'test-key') {
        console.log(`[Auth] Successful via API Key for ${req.path}. Source: ${apiKeyFromHeader ? 'header' : 'query'}`);
        return next();
    }

    // For /mcp, check active streamable session if no API key
    if (req.path === '/mcp' && mcpSessionId && activeStreamableTransports.has(mcpSessionId)) {
        console.log(`[Auth] Successful for /mcp via active Streamable session ${mcpSessionId}`);
        return next();
    }

    // For SSE POST endpoint, check active SSE session if no API key
    // if (req.path === SSE_POST_ENDPOINT_PATH && sseSessionId && activeSseTransports.has(sseSessionId)) { // 织: 修改为检查 activeSseSessions
    if (req.path === SSE_POST_ENDPOINT_PATH && sseSessionId && activeSseSessions.has(sseSessionId)) {
        console.log(`[Auth] Successful for ${SSE_POST_ENDPOINT_PATH} via active SSE session ${sseSessionId}`);
        return next();
    }
    
    console.log(`[Auth] Failed for ${req.path}. Header key: ${apiKeyFromHeader}, Query key: ${apiKeyFromQuery}, MCP Session: ${mcpSessionId}, SSE Session: ${sseSessionId}`);
    res.status(401).json({ error: 'Unauthorized' });
};


// --- Modern Streamable HTTP Endpoint (/mcp) ---
app.all('/mcp', simpleAuthMiddleware, async (req: Request, res: Response) => {
    console.log(`[HTTP /mcp] Received ${req.method} request for ${req.url}.`);
    const mcpSessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport | undefined;

    // 织: 添加详细日志
    console.log(`[HTTP /mcp] mcpSessionId from header: ${mcpSessionId}`);
    console.log(`[HTTP /mcp] Request body received:`, JSON.stringify(req.body, null, 2));
    const isInitReq = isInitializeRequest(req.body); // 把这个结果存起来，后面else分支也能用
    console.log(`[HTTP /mcp] Result of isInitializeRequest(req.body): ${isInitReq}`);

    if (mcpSessionId && activeStreamableTransports.has(mcpSessionId)) {
        transport = activeStreamableTransports.get(mcpSessionId);
        console.log(`[HTTP /mcp] Reusing existing StreamableHTTPServerTransport for session: ${mcpSessionId} (connected to global server).`);
    } else if (isInitReq) { // Check if it's an initialization request // 织: 使用缓存的 isInitReq 变量
        console.log('[HTTP /mcp] Initialization request detected. Creating new StreamableHTTPServerTransport to connect to global HuiMcpServer.');
        
        const newTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => {
                const newId = randomUUID();
                console.log(`[Transport /mcp] Generated new session ID: ${newId}`);
                return newId;
            },
            onsessioninitialized: (newlyGeneratedSessionId: string) => {
                console.log(`[Transport /mcp] Session initialized: ${newlyGeneratedSessionId}. Storing transport.`);
                activeStreamableTransports.set(newlyGeneratedSessionId, newTransport); 
                console.log(`[Transport /mcp] Active streamable sessions: ${activeStreamableTransports.size}`);
            }
        });
        transport = newTransport;
        
        try {
            await globalHuiMcpServer.connect(transport); 
            console.log('[HTTP /mcp] New transport connected to globalHuiMcpServer.');
        } catch (connectError) {
            console.error('[HTTP /mcp] Failed to connect new transport to globalHuiMcpServer:', connectError);
            res.status(500).json({ error: 'Server connection error during transport initialization' });
            return;
        }

        transport.onclose = () => {
            if (transport?.sessionId) { // transport.sessionId should be set by onsessioninitialized
                console.log(`[Transport /mcp] Streamable transport closed for session: ${transport.sessionId}. Removing from active list.`);
                activeStreamableTransports.delete(transport.sessionId);
                console.log(`[Transport /mcp] Active streamable sessions: ${activeStreamableTransports.size}`);
            } else {
                console.log('[Transport /mcp] Streamable transport closed but session ID was not available for cleanup.');
            }
        };
    } else {
        // 织: 添加日志，说明为什么走到这个分支
        console.log('[HTTP /mcp] Condition for creating/reusing transport NOT MET. mcpSessionId valid and present? ->', !!(mcpSessionId && activeStreamableTransports.has(mcpSessionId)), 'Is it an init request? ->', isInitReq);
        console.log('[HTTP /mcp] Invalid request: Not an initialization request and no valid session ID provided. Sending 400.');
        res.status(400).json({
            jsonrpc: '2.0',
            error: { code: ErrorCode.InvalidRequest, message: 'Bad Request: No valid session ID or initialization request.' },
            id: req.body?.id !== undefined ? req.body.id : null,
        });
        return;
    }

    if (!transport) {
        console.error('[HTTP /mcp] Transport is unexpectedly undefined. This should not happen.');
        res.status(500).json({ error: 'Internal Server Error: Transport not available' });
        return;
    }

    try {
        const transportSessionId = transport.sessionId || 'pending';
        console.log(`[HTTP /mcp][LOG_POINT_1A] Attempting to call transport.handleRequest for session: ${transportSessionId}. Request body ID: ${req.body?.id}`);
        await transport.handleRequest(req, res, req.body);
        // 织: 记录即将发送的响应头，尤其是在成功处理后
        if (!res.headersSent) { // 确保头还没发送
             console.log(`[HTTP /mcp][LOG_POINT_1B_HEADERS] Response headers before sending (after handleRequest success) for session: ${transport.sessionId || transportSessionId}:`, res.getHeaders());
        } else {
             console.log(`[HTTP /mcp][LOG_POINT_1B_HEADERS] Headers already sent for session: ${transport.sessionId || transportSessionId}.`);
        }
        console.log(`[HTTP /mcp][LOG_POINT_1B] Successfully returned from transport.handleRequest for session: ${transportSessionId}. Request body ID: ${req.body?.id}`);
    } catch (error: any) {
        const transportSessionId = transport?.sessionId || 'transport_undefined_in_catch';
        console.error(`[HTTP /mcp][LOG_POINT_1C] Error during transport.handleRequest for session: ${transportSessionId}. Request body ID: ${req.body?.id}. Error:`, error);
        if (!res.headersSent) {
            const isMcpErr = error instanceof McpError;
            const errCode = isMcpErr ? error.code : ErrorCode.InternalError;
            const errMsg = error.message || 'Failed to handle request via transport';
            let httpStatusCode = 500;
            if (errCode === ErrorCode.ParseError || errCode === ErrorCode.InvalidRequest || errCode === ErrorCode.InvalidParams) {
                httpStatusCode = 400;
            } else if (errCode === ErrorCode.MethodNotFound) {
                httpStatusCode = 404;
            }
            const responseId = req.body?.id !== undefined ? req.body.id : null;
            res.status(httpStatusCode).json({
                jsonrpc: "2.0",
                id: responseId,
                error: { code: errCode, message: errMsg }
            });
        }
    }
});


// --- Legacy SSE Connection Endpoint (GET /sse) ---
app.get('/sse', simpleAuthMiddleware, async (req: Request, res: Response) => {
    console.log(`[HTTP GET /sse] Received legacy SSE request for ${req.url}.`);
    
    const acceptHeader = req.headers.accept;
    if (!(acceptHeader?.includes("text/event-stream"))) {
        console.error('[HTTP GET /sse] Rejected: Client does not accept text/event-stream.');
        res.status(406).json({ error: 'Not Acceptable: Client must accept text/event-stream' });
        return;
    }

    console.log('[HTTP GET /sse] Creating new SSEServerTransport for legacy client...');
    let keepAliveIntervalId: NodeJS.Timeout | undefined = undefined; // 织: Declare interval ID

    try {
        const sseTransport = new SSEServerTransport(SSE_POST_ENDPOINT_PATH, res); // SSE transport tells client to POST here
        const sessionId = sseTransport.sessionId;
        console.log(`[HTTP GET /sse] Created SSEServerTransport with Session ID: ${sessionId}`);

        // 织: 为新的 SSE 会话创建独立的 HuiMcpServer 实例
        const sessionServer = new HuiMcpServer(sharedHuiServerConfig);
        registerAllTools(sessionServer); // 向新实例注册工具
        console.log(`[HTTP GET /sse] Created new HuiMcpServer instance for Session ID: ${sessionId}`);

        activeSseSessions.set(sessionId, { transport: sseTransport, server: sessionServer });
        console.log(`[HTTP GET /sse] Stored legacy SSE session for Session ID: ${sessionId}. Active SSE sessions: ${activeSseSessions.size}`);

        // 织: Start keep-alive ping
        keepAliveIntervalId = setInterval(() => {
            if (!res.writableEnded) {
                res.write(': keepalive\n\n'); // Standard SSE comment for keep-alive
                console.log(`[HTTP GET /sse] Sent keep-alive ping for session: ${sessionId}`);
            } else {
                // Should not happen if close handler is working correctly, but clear just in case
                if (keepAliveIntervalId) {
                    clearInterval(keepAliveIntervalId);
                    keepAliveIntervalId = undefined;
                    console.log(`[HTTP GET /sse] Cleared keep-alive (writableEnded) for session: ${sessionId}`);
                }
            }
        }, KEEP_ALIVE_INTERVAL_MS);
        console.log(`[HTTP GET /sse] Started keep-alive mechanism for session: ${sessionId}`);


        res.on('close', async () => { // 织: 添加 async
            console.log(`[HTTP GET /sse] Legacy client disconnected (Session: ${sessionId}). Cleaning up.`);
            // 织: Clear keep-alive interval
            if (keepAliveIntervalId) {
                clearInterval(keepAliveIntervalId);
                keepAliveIntervalId = undefined;
                console.log(`[HTTP GET /sse] Cleared keep-alive interval for session: ${sessionId}`);
            }
            const sessionData = activeSseSessions.get(sessionId);
            if (sessionData) {
                try {
                    await sessionData.server.close(); // 织: 关闭对应的 HuiMcpServer 实例
                    console.log(`[HTTP GET /sse] Closed HuiMcpServer for session: ${sessionId}`);
                } catch (serverCloseError) {
                    console.error(`[HTTP GET /sse] Error closing HuiMcpServer for session ${sessionId}:`, serverCloseError);
                }
            }
            activeSseSessions.delete(sessionId);
            sseTransport.close(); // Ensure transport resources are released
            console.log(`[HTTP GET /sse] Removed legacy SSE session for Session ID: ${sessionId}. Active SSE sessions: ${activeSseSessions.size}`);
        });

        // Connect to the new session-specific HuiMcpServer instance
        await sessionServer.connect(sseTransport); // This should call sseTransport.start()
        console.log(`[HTTP GET /sse] Legacy SSEServerTransport (Session: ${sessionId}) connected to its session-specific huiMcpServer. SSE stream started.`);


    } catch (error: any) {
        console.error('[HTTP GET /sse] Error during legacy SSE setup:', error);
        // 织: Clear keep-alive interval on error too
        if (keepAliveIntervalId) {
            clearInterval(keepAliveIntervalId);
            keepAliveIntervalId = undefined;
            console.log(`[HTTP GET /sse] Cleared keep-alive interval due to error during setup.`);
        }
        if (!res.headersSent) {
             res.status(500).json({ error: 'Failed to initialize legacy SSE connection' });
        } else {
             console.error('[HTTP GET /sse] Headers already sent for legacy SSE, cannot send JSON error response.');
             res.end();
        }
    }
});

// --- Legacy MCP Message Endpoint (POST /mcp-post) ---
app.post(SSE_POST_ENDPOINT_PATH, simpleAuthMiddleware, async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string | undefined;
    console.log(`[HTTP POST ${SSE_POST_ENDPOINT_PATH}] Received legacy message for Session ID: ${sessionId}`);

    if (!sessionId) {
        console.error(`[HTTP POST ${SSE_POST_ENDPOINT_PATH}] Rejected: Missing sessionId query parameter.`);
        res.status(400).json({ error: 'Bad Request: Missing sessionId query parameter' });
        return; // Ensure function exits here
    }

    // const sseTransport = activeSseTransports.get(sessionId); // 织: 修改为从 activeSseSessions 获取
    const sessionData = activeSseSessions.get(sessionId);
    if (!sessionData || !sessionData.transport) {
        console.error(`[HTTP POST ${SSE_POST_ENDPOINT_PATH}] Rejected: No active legacy SSE session or transport found for Session ID: ${sessionId}`);
        res.status(404).json({ error: `Legacy session not found: ${sessionId}` });
        return; // Ensure function exits here
    }
    const sseTransport = sessionData.transport; // 织: 获取 transport

    try {
        console.log(`[HTTP POST ${SSE_POST_ENDPOINT_PATH}][LOG_POINT_2A] Attempting to call sseTransport.handlePostMessage for session: ${sessionId}. Request body ID: ${req.body?.id}`);
        await sseTransport.handlePostMessage(req, res, req.body);
        console.log(`[HTTP POST ${SSE_POST_ENDPOINT_PATH}][LOG_POINT_2B] Successfully returned from sseTransport.handlePostMessage for session: ${sessionId}. Request body ID: ${req.body?.id}`);
    } catch (error: any) {
         console.error(`[HTTP POST ${SSE_POST_ENDPOINT_PATH}][LOG_POINT_2C] Error handling legacy POST message for Session ID ${sessionId}. Request body ID: ${req.body?.id}. Error:`, error);
         if (!res.headersSent) {
             res.status(500).json({ error: 'Failed to process legacy message' });
         }
         // No explicit return of res here
    }
});

// --- Custom endpoint to get Actions/Tools with HUI Hints (Uses global server) ---
app.post('/mcp-hui/getActions', simpleAuthMiddleware, (req: Request, res: Response) => {
    // console.log('[HTTP /mcp-hui/getActions] Handling request using global huiMcpServer...'); // 织: 全局实例已移除
    console.log('[HTTP /mcp-hui/getActions] Handling request by creating a temporary HuiMcpServer instance...');
    try {
        // 织: 创建临时实例以获取工具列表，因为工具注册是确定性的
        const tempServer = new HuiMcpServer(sharedHuiServerConfig);
        registerAllTools(tempServer);
        const huiActions = tempServer.listHuiTools(); 
        console.log('[HTTP /mcp-hui/getActions] Returning HUI actions:', huiActions.map(a => a.name));
        res.json({ actions: huiActions });
    } catch (error: any) {
        console.error('[HTTP /mcp-hui/getActions] Error generating HUI actions:', error);
        res.status(500).json({ error: 'Failed to generate HUI actions' });
    }
});

// --- Start the Express server ---
app.listen(PORT, () => {
  console.log(`MCP HUI Server Runner listening on http://localhost:${PORT}`);
  console.log(`Modern Streamable HTTP Endpoint: http://localhost:${PORT}/mcp`);
  console.log(`Legacy SSE Connection Endpoint: http://localhost:${PORT}/sse`);
  console.log(`Legacy MCP POST Message Endpoint: http://localhost:${PORT}${SSE_POST_ENDPOINT_PATH}`);
  console.log(`HUI Actions Endpoint: http://localhost:${PORT}/mcp-hui/getActions`);
}); 