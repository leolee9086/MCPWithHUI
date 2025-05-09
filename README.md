# MCPWithHUI

## 项目简介

MCPWithHUI（Model Context Protocol with Human User Interface）是一个创新性项目，它扩展了标准的MCP（Model Context Protocol）协议，增加了面向人类用户的界面元数据和渲染能力。

### 核心理念

这个项目建立在两个关键概念上：

1. **MCP Server With HUI**：扩展标准MCP服务器，让其定义的`Resources`和`Tools`不仅能被AI代理程序调用，还包含丰富的元数据，用于自动生成人类可用的交互界面。

2. **MCP Client With HUI**：连接到上述服务器的客户端应用，能够获取可用的Resources和Tools，并基于服务器提供的元数据**动态生成交互式UI**。

通过这种方式，人类用户可以像AI代理一样，通过自动生成的UI界面使用MCP服务器提供的能力。

## 项目结构

本项目采用monorepo结构，包含以下主要组件：

```
MCPWithHUI/
├── server/       # MCP服务器实现，包含HUI增强功能
├── client/       # Web客户端实现，用于渲染HUI
├── shared/       # 服务器和客户端共享的代码和类型定义
├── packages/     # 可重用的包
│   └── hui/      # HUI核心库，提供客户端和服务器扩展
```

## 快速开始

### 前置要求

- Node.js 18+
- pnpm 9+（项目使用pnpm作为包管理器）

### 安装步骤

1. **克隆仓库**

```bash
git clone https://github.com/yourusername/MCPWithHUI.git
cd MCPWithHUI
```

2. **安装依赖**

```bash
pnpm install
```

3. **构建项目**

先构建HUI核心库，它是服务器和客户端的基础：

```bash
pnpm --filter @mcpwithhui/hui build
```

然后构建整个项目：

```bash
pnpm build
```

### 运行服务器

启动MCP服务器（开发模式）：

```bash
pnpm dev:server
```

服务器默认在以下地址提供服务：
- HTTP API：http://localhost:8080/mcp
- SSE端点：http://localhost:8080/sse
- 静态文件：http://localhost:8080/

### 运行客户端（可选）

如果你想使用预构建的Web客户端：

```bash
pnpm dev:client
```

客户端默认在 http://localhost:5173 运行。

## 在浏览器中使用HUI客户端

服务器启动后，可以通过以下方式在浏览器中使用HUI客户端：

1. 通过服务器工具获取使用说明：
   - 连接到服务器并调用`getStaticHuiClientUsageInfo`工具

2. 直接在浏览器中导入客户端库：
   ```javascript
   import { HuiMcpClient } from 'http://localhost:8080/libs/hui-client.js';
   
   async function connectToMCP() {
     const client = new HuiMcpClient({
       serverUrl: 'http://localhost:8080/mcp'
     });
     
     await client.initialize();
     const tools = await client.listAvailableTools();
     console.log("可用工具：", tools);
   }
   
   connectToMCP();
   ```

## 自定义工具开发

### 创建新工具

在`server/src/tools`目录中创建新的工具文件：

```typescript
// myTool.ts
import { defineHuiAction } from '../hui/actionDefinition';
import { z } from 'zod';

export const myCustomTool = defineHuiAction({
  name: 'myCustomTool',
  description: '这是一个自定义工具示例',
  parameters: z.object({
    input: z.string().describe('输入参数')
  }),
  returnType: z.string(),
  huiHints: {
    label: '我的工具',
    description: '这个工具用于演示HUI功能',
    category: '示例工具',
    iconName: 'star'
  },
  handler: async ({ input }) => {
    return `您输入的是: ${input}`;
  }
});
```

然后在`server/src/toolRegistration.ts`中注册该工具：

```typescript
import { myCustomTool } from './tools/myTool';

// 在registerAllTools函数中添加
mcpServer.registerAction(myCustomTool);
```

## 贡献指南

欢迎为MCPWithHUI项目做出贡献！如果您有兴趣参与开发，请遵循以下步骤：

1. Fork本仓库
2. 创建您的特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交您的更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启一个Pull Request

## 常见问题

### Q: 我在运行项目时遇到了Zod相关的错误

这可能是由于`@modelcontextprotocol/sdk`对特定版本Zod的依赖导致的。我们在项目的pnpm配置中已经设置了Zod的版本覆盖。如果仍然遇到问题，请尝试：

```bash
pnpm install
```

由于官方SDK中使用了instanceOf来进行zodType的相关判断,如果你的项目从多个路径引入了zod,可能会造成一些奇奇怪怪的问题,临时解决方式是修改`sdk/dist/esm(cjs)/server/mcp.js`中的这个判断函数:

```
 // Helper to check if an object is a Zod schema (ZodRawShape)
        const isZodRawShape = (obj) => {
            if (typeof obj !== "object" || obj === null)
                return false;
            // Check that at least one property is a ZodType instance
            return Object.values(obj).some(v => v?._def?.typeName);
        };
```

### Q: SSE连接方式总是出现timeout错误怎么办?

client端可能会在服务端长时间没有推送消息时断开SSE连接,此时你可以每隔约25s向客户端发送保活消息:

```
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
```

### Q: 如何调试服务器？

可以通过以下命令运行并调试服务器：

```bash
# 在server目录运行
pnpm dev
```

或者在根目录:
```bash
pnpm dev:server
```

然后可以使用IDE的调试工具连接到Node.js进程。

## 许可证

MIT

## 作者

由leolee9086和织共同开发和维护。 