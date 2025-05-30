import { HuiMcpServer } from '@mcpwithhui/hui/server';
import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { HuiInputHint, HuiRenderingHints } from '@mcpwithhui/hui/shared';

// Import Siyuan tool specifics
import {
    writeToSiyuanDailyNoteInputRawShape,
    writeToSiyuanDailyNoteHuiHints,
    writeToSiyuanDailyNoteHandler,
    getSiyuanNotebooksInputRawShape,
    getSiyuanNotebooksHuiHints,
    getSiyuanNotebooksHandler,
    getSiyuanNoteContentByIdInputRawShape,
    getSiyuanNoteContentByIdHuiHints,
    getSiyuanNoteContentByIdHandler,
    searchSiyuanNotesInputRawShape,
    searchSiyuanNotesHuiHints,
    searchSiyuanNotesHandler,
    createSiyuanNotebookInputRawShape,
    createSiyuanNotebookHuiHints,
    createSiyuanNotebookHandler,
    getSiyuanDocsInNotebookInputRawShape,
    getSiyuanDocsInNotebookHuiHints,
    getSiyuanDocsInNotebookHandler,
    findMyNotesInputRawShape,
    findMyNotesHuiHints,
    findMyNotesHandler,
    // 织：为新工具 getOrCreateNotebook 手动导入
    getOrCreateNotebookInputRawShape,
    getOrCreateNotebookHuiHints,
    getOrCreateNotebookHandler,
    tools as siyuanToolCollection // 织：导入整个siyuan工具集合，用于自动注册
} from './tools/siyuan.js';

// 导入生活日志工具
import {
    findBlocksWithLifelogTypeInputRawShape,
    findBlocksWithLifelogTypeHuiHints,
    findBlocksWithLifelogTypeHandler,
    findDailyNoteBlocksWithoutLifelogInputRawShape,
    findDailyNoteBlocksWithoutLifelogHuiHints,
    findDailyNoteBlocksWithoutLifelogHandler
} from './tools/lifelog.js';

// 织：导入新的网络工具
import {
    getWebpageContentInputRawShape,
    getWebpageContentHuiHints,
    getWebpageContentHandler
} from './tools/network.js';

// Import Meta tool specifics
import {
    findSuitableToolsInputRawShape,
    findSuitableToolsHuiHints,
    findSuitableToolsHandler
} from './tools/meta.js';

// 织：导入新的通用思源API调用工具
import {
    invokeSiyuanAPIInputRawShape,
    invokeSiyuanAPIHuiHints,
    invokeSiyuanAPIHandler
} from './tools/siyuanGenericAPITool.js';

// 织: 为新工具定义 HUI Hints (虽然它不接受输入，但可以有描述)
const getStaticHuiClientUsageInfoHuiHints: HuiRenderingHints = {
  label: '获取静态HUI客户端使用说明',
  description: '提供如何在浏览器端通过静态JS文件使用HuiMcpClient连接此服务器的说明和代码示例。'
};

export function registerAllTools(huiMcpServer: HuiMcpServer): void {
  // --- greet tool ---
  const greetInputShape = {
    name: z.string().describe('The name of the person to greet.')
  };
  const greetHuiHints: HuiRenderingHints = {
    label: '打个招呼',
    description: '向指定的人发送问候。',
    inputHints: {
      name: { label: '名字', inputType: 'text', placeholder: '输入名字...', required: true } as HuiInputHint
    }
  };
  huiMcpServer.huiTool(
    'greet',
    'Sends a friendly greeting.',
    greetInputShape,
    greetHuiHints,
    async (args, extra: any) => {
      const { name } = args;
      console.log(`[Tool:greet] Executing with name: ${name}`);
      try {
        const message = `你好, ${name}! 👋 (via global server)`;
        return { content: [{ type: 'text', text: message }] };
      } catch (error: any) {
        console.error(`[Tool:greet] Error:`, error);
        throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error');
      }
    }
  );

  // --- getCurrentTime tool ---
  const getCurrentTimeInputShape = {}; // No input needed
  const getCurrentTimeHuiHints: HuiRenderingHints = {
    label: '获取当前时间',
    description: '获取服务器当前的精确日期和时间。'
    // No inputHints needed
  };
  huiMcpServer.huiTool(
    'getCurrentTime',
    'Gets the current server date and time.',
    getCurrentTimeInputShape,
    getCurrentTimeHuiHints,
    async (args: {}, extra: any) => { // args will be empty object
      console.log(`[Tool:getCurrentTime] Executing...`);
      try {
        const now = new Date();
        const timeString = now.toString();
        console.log(`[Tool:getCurrentTime] Current time: ${timeString}`);
        return { content: [{ type: 'text', text: timeString }] };
      } catch (error: any) {
        console.error(`[Tool:getCurrentTime] Error:`, error);
        throw new McpError(ErrorCode.InternalError, 'Failed to get current time');
      }
    }
  );

  // --- Siyuan tools ---
  huiMcpServer.huiTool(
    'writeToSiyuanDailyNote',
    '将内容写入思源笔记的每日笔记中。',
    writeToSiyuanDailyNoteInputRawShape,
    writeToSiyuanDailyNoteHuiHints,
    writeToSiyuanDailyNoteHandler
  );

  huiMcpServer.huiTool(
    'getSiyuanNotebooks',
    '获取思源笔记的笔记本列表。',
    getSiyuanNotebooksInputRawShape,
    getSiyuanNotebooksHuiHints,
    getSiyuanNotebooksHandler
  );

  huiMcpServer.huiTool(
    'getSiyuanNoteContentById',
    '根据ID获取思源笔记的内容。',
    getSiyuanNoteContentByIdInputRawShape,
    getSiyuanNoteContentByIdHuiHints,
    getSiyuanNoteContentByIdHandler
  );

  huiMcpServer.huiTool(
    'searchSiyuanNotes',
    '搜索思源笔记。',
    searchSiyuanNotesInputRawShape,
    searchSiyuanNotesHuiHints,
    searchSiyuanNotesHandler
  );

  huiMcpServer.huiTool(
    'createSiyuanNotebook',
    '创建一个新的思源笔记本。',
    createSiyuanNotebookInputRawShape,
    createSiyuanNotebookHuiHints,
    createSiyuanNotebookHandler
  );

  huiMcpServer.huiTool(
    'getSiyuanDocsInNotebook',
    '获取指定思源笔记本内路径下的文档和文件夹列表。',
    getSiyuanDocsInNotebookInputRawShape,
    getSiyuanDocsInNotebookHuiHints,
    getSiyuanDocsInNotebookHandler
  );

  huiMcpServer.huiTool(
    'findMyNotes',
    (findMyNotesHuiHints as HuiRenderingHints)?.description || '查找"织"记录的笔记。',
    findMyNotesInputRawShape,
    findMyNotesHuiHints,
    findMyNotesHandler
  );

  // 织：手动注册 getOrCreateNotebook 工具 (临时，后续会被自动注册替代)
  huiMcpServer.huiTool(
    'getOrCreateNotebook',
    (getOrCreateNotebookHuiHints as HuiRenderingHints)?.description || '获取或创建思源笔记本。',
    getOrCreateNotebookInputRawShape,
    getOrCreateNotebookHuiHints,
    getOrCreateNotebookHandler
  );
  console.log('[ToolRegistration] Manually registered Siyuan tool: getOrCreateNotebook');

  // 织：手动注册新的 invokeSiyuanAPI 工具
  huiMcpServer.huiTool(
    'invokeSiyuanAPI',
    (invokeSiyuanAPIHuiHints as HuiRenderingHints)?.description || '通用思源API调用工具。', // 使用HUI Hints中的描述，或提供一个默认值
    invokeSiyuanAPIInputRawShape,
    invokeSiyuanAPIHuiHints,
    invokeSiyuanAPIHandler
  );
  console.log('[ToolRegistration] Manually registered Siyuan tool: invokeSiyuanAPI');

  // 织：定义一个手动注册过的思源工具列表，用于在自动注册时跳过它们
  const manuallyRegisteredSiyuanTools = [
    'writeToSiyuanDailyNote',
    'getSiyuanNotebooks',
    'getSiyuanNoteContentById',
    'searchSiyuanNotes',
    'createSiyuanNotebook',
    'getSiyuanDocsInNotebook',
    'findMyNotes',
    'getOrCreateNotebook',
    'invokeSiyuanAPI' // 织：将新工具添加到手动注册列表
  ];

  // --- 自动注册来自 siyuan.ts 的工具 (实验性) ---
  console.log('[ToolRegistration] Starting automatic registration of tools from siyuanToolCollection...');
  for (const toolName in siyuanToolCollection) {
    if (Object.prototype.hasOwnProperty.call(siyuanToolCollection, toolName)) {
        const toolDef = (siyuanToolCollection as any)[toolName]; // 使用 any 类型断言，因为 siyuanToolCollection 的类型可能不精确
        
        // 从 HUI hints 获取描述，如果不存在则使用默认描述
        const description = (toolDef.hui as HuiRenderingHints)?.description || `Siyuan tool: ${toolName}`;

        // 检查是否已手动注册，避免重复（主要针对 getOrCreateNotebook 的过渡期）
        if (manuallyRegisteredSiyuanTools.includes(toolName)) {
            console.log(`[ToolRegistration] Skipping automatic registration for already manually registered tool: ${toolName}`);
            continue;
        }

        // 检查工具定义是否完整
        if (!toolDef.inputRawShape || !toolDef.hui || !toolDef.handler) {
            console.warn(`[ToolRegistration] Tool '${toolName}' from siyuanToolCollection is missing one or more required properties (inputRawShape, hui, handler). Skipping registration.`);
            continue;
        }

        huiMcpServer.huiTool(
            toolName,
            description,
            toolDef.inputRawShape,
            toolDef.hui as HuiRenderingHints,
            toolDef.handler
        );
        console.log(`[ToolRegistration] Automatically registered Siyuan tool: ${toolName}`);
    }
  }
  console.log('[ToolRegistration] Finished automatic registration from siyuanToolCollection.');

  // 织：注册 getWebpageContent 工具
  huiMcpServer.huiTool(
    'getWebpageContent',
    (getWebpageContentHuiHints as HuiRenderingHints)?.description || '获取指定URL的网页HTML内容。',
    getWebpageContentInputRawShape,
    getWebpageContentHuiHints,
    getWebpageContentHandler
  );

  // --- Meta tools ---
  huiMcpServer.huiTool(
    'findSuitableTools',
    (findSuitableToolsHuiHints as HuiRenderingHints)?.description || 'Finds suitable tools based on a query.',
    findSuitableToolsInputRawShape,
    findSuitableToolsHuiHints,
    findSuitableToolsHandler
  );

  // 织: 注册新的 getStaticHuiClientUsageInfo 工具
  huiMcpServer.huiTool(
    'howToBuildGUIForThisTool',
    (getStaticHuiClientUsageInfoHuiHints as HuiRenderingHints)?.description || 'Provides instructions on how to use the static HUI client.',
    {}, // No input parameters
    getStaticHuiClientUsageInfoHuiHints,
    async (args: {}, extra: any) => {
      console.log(`[Tool:getStaticHuiClientUsageInfo] Executing...`);
      // 动态获取当前服务器的 host 和 port，以便生成准确的端点URL
      // 注意：在服务器端直接获取请求的 host/port 对于一个通用工具来说可能比较复杂，
      // 因为工具执行时可能没有直接的 HTTP 请求上下文。
      // 这里我们暂时硬编码为 localhost:8080，但理想情况下应该从配置或环境变量读取。
      const serverBaseUrl = extra.serverConfig?.publicUrl || 'http://localhost:8080'; // 假设 extra 或 serverConfig 中有此信息
      const mcpEndpoint = `${serverBaseUrl}/mcp?apiKey=test-key`;
      const sseEndpoint = `${serverBaseUrl}/sse?apiKey=test-key`;
      const clientJsUrl = `${serverBaseUrl}/libs/hui-client.js`;
      const httpTransportJsUrl = `${serverBaseUrl}/libs/mcp-sdk-streamableHttp.esm.js`;
      const sseTransportJsUrl = `${serverBaseUrl}/libs/mcp-sdk-sse.esm.js`;

      const usageInstructions = `
您可以通过 ES Module (ESM) 在浏览器中直接引入并使用静态伺服的 JavaScript 文件来与此MCP服务器交互。

**步骤说明:**

1.  **确保您的脚本以模块方式加载**: 在 HTML 中使用 \`<script type="module" src="your-script.js"></script>\` 或者在 JS 中使用动态 \`import()\`. 

2.  **导入必要的模块**:
    *   从 \`${clientJsUrl}\` 导入 \`HuiMcpClient\`。此文件包含了 HUI 客户端核心逻辑。
    *   从 \`${httpTransportJsUrl}\` 导入 \`StreamableHTTPClientTransport\`。
    *   从 \`${sseTransportJsUrl}\` 导入 \`SSEClientTransport\`，用于备用连接。
    *   **注意**: 所有这些 JS 文件都是由服务器静态提供的、经过 esbuild 打包的版本，理论上包含了各自所需的依赖。您**无需**再从 CDN 或其他地方导入 SDK。

**代码示例:**

\`\`\`javascript
// --- 在您的浏览器端 JS 模块中 ---
async function connectAndListTools() {
  // 从服务器静态伺服的路径导入 HUI 客户端和 Transport
  const clientJsPath = \'${clientJsUrl}\'; 
  const httpTransportJsPath = \'${httpTransportJsUrl}\';
  const sseTransportJsPath = \'${sseTransportJsUrl}\'; 

  let client; // HuiMcpClient 实例
  let transport; // Transport 实例

  try {
    // 并行或按需导入所需的模块
    // @ts-ignore - 这些 import() 在标准浏览器环境中是有效的动态导入
    const [{ HuiMcpClient }, { StreamableHTTPClientTransport }, { SSEClientTransport }] = await Promise.all([
      import(clientJsPath),
      import(httpTransportJsPath),
      import(sseTransportJsPath)
    ]);

    const MCP_POST_ENDPOINT = \'${mcpEndpoint}\';
    const MCP_SSE_ENDPOINT = \'${sseEndpoint}\';

    const clientInfo = { name: \'MyStaticBrowserClient\', version: \'0.1.0\' }; 
    client = new HuiMcpClient(clientInfo);

    try {
      // 尝试 StreamableHTTPClientTransport (POST)
      console.log(\`Attempting to connect using StreamableHTTPClientTransport at \${MCP_POST_ENDPOINT}...\`);
      transport = new StreamableHTTPClientTransport(MCP_POST_ENDPOINT);
      await client.connect(transport);
      console.log("Connected successfully using StreamableHTTPClientTransport (POST).");
    } catch (httpError) {
      console.warn(\`StreamableHTTPClientTransport (POST) connection failed at \${MCP_POST_ENDPOINT}:\`, httpError);
      
      if (transport && typeof transport.close === 'function') {
        try {
          await transport.close(); // 关闭失败的 transport
        } catch (closeErr) {
          console.warn('Error closing failed HTTP transport:', closeErr);
        }
      }
      transport = null;

      console.log(\`Falling back to SSEClientTransport at \${MCP_SSE_ENDPOINT}...\`);
      try {
        transport = new SSEClientTransport(new URL(MCP_SSE_ENDPOINT)); 
        await client.connect(transport); 
        console.log("Connected successfully using SSEClientTransport.");
      } catch (sseError) {
        console.error(\`SSEClientTransport connection also failed at \${MCP_SSE_ENDPOINT}:\`, sseError);
        const httpErrorMessage = (httpError instanceof Error) ? httpError.message : String(httpError);
        const sseErrorMessage = (sseError instanceof Error) ? sseError.message : String(sseError);
        console.error(\`Failed to connect to MCP server. Attempted POST (Error: \${httpErrorMessage}) and SSE (Error: \${sseErrorMessage}). Please ensure the server is running and supports MCP.\`);
        return; 
      }
    }

    console.log('Fetching tools with HUI hints...');
    const tools = await client.listToolsWithHui(); 
    console.log('Available tools with HUI hints:', tools);

    const greetTool = tools.find(t => t.name === \'greet\');
    if (greetTool) {
      console.log("Attempting to call 'greet' tool...");
      const greetArgs = { name: \'Static Client User\' };
      const result = await client.callTool({ name: \'greet\', arguments: greetArgs });
      console.log('Greet tool result:\', result);
    }

  } catch (error) {
    console.error('MCP client setup, connection, or tool call failed unexpectedly:', error);
  } finally {
    console.log('Client operations finished. Cleaning up...');
    if (client && typeof client.close === 'function') {
      try {
        await client.close();
        console.log('MCP client closed.');
      } catch (closeErr) {
        console.error('Error closing MCP client:', closeErr);
      }
    }
  }
}

connectAndListTools().catch(console.error);
\`\`\`

**重要提示:**
*   现在所有必需的客户端代码（HUI Client 和 SDK Transports）都由本服务器提供，无需依赖外部 CDN。
*   请确保服务器已成功构建并拷贝了所有相关的 bundle 文件 (hui-client.js, mcp-sdk-*.js)。检查服务器启动日志中的警告信息。
*   跨域资源共享 (CORS): 此服务器 (\`${serverBaseUrl}\`) 仍需正确配置 CORS 策略。
`;

      return { content: [{ type: 'text', text: usageInstructions }] };
    }
  );

  // 注册生活日志工具
  huiMcpServer.huiTool(
    'findBlocksWithLifelogType',
    '查询所有包含custom-lifelog-type属性的块',
    findBlocksWithLifelogTypeInputRawShape,
    findBlocksWithLifelogTypeHuiHints,
    findBlocksWithLifelogTypeHandler
  );

  // 注册无生活日志标记的日记子块查询工具
  huiMcpServer.huiTool(
    'findDailyNoteBlocksWithoutLifelog',
    '查询日记块的直接子块中，没有custom-lifelog-type属性的块',
    findDailyNoteBlocksWithoutLifelogInputRawShape,
    findDailyNoteBlocksWithoutLifelogHuiHints,
    findDailyNoteBlocksWithoutLifelogHandler
  );

  console.log('[ToolRegistration] All tools, including meta-tools, registered on huiMcpServer.');
} 