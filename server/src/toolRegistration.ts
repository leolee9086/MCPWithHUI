import { HuiMcpServer } from '@mcpwithhui/hui';
import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { HuiInputHint, HuiRenderingHints } from 'mcpwithhui-shared';

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
    findMyNotesHandler
} from './tools/siyuan.js';

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
} from './tools/meta'; // Assuming meta.ts is in the same tools directory

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
    findMyNotesHuiHints.description || '查找"织"记录的笔记。',
    findMyNotesInputRawShape,
    findMyNotesHuiHints,
    findMyNotesHandler
  );

  // 织：注册 getWebpageContent 工具
  huiMcpServer.huiTool(
    'getWebpageContent',
    getWebpageContentHuiHints.description || '获取指定URL的网页HTML内容。', // 使用HUI描述或默认描述
    getWebpageContentInputRawShape,
    getWebpageContentHuiHints,
    getWebpageContentHandler
  );

  // --- Meta tools ---
  huiMcpServer.huiTool(
    'findSuitableTools', // Tool name (MCP standard)
    findSuitableToolsHuiHints.description || 'Finds suitable tools based on a query.', // Engine description
    findSuitableToolsInputRawShape,      // Zod Raw Shape for input
    findSuitableToolsHuiHints,           // HUI Rendering Hints
    findSuitableToolsHandler             // Handler function
  );

  console.log('[ToolRegistration] All tools, including meta-tools, registered on huiMcpServer.');
} 