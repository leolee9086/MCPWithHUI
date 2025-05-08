// siyuan.ts - 思源笔记交互工具

import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import * as cheerio from 'cheerio';
import fs from 'fs'; // 织：引入 fs
import path from 'path'; // 织：引入 path
import { fileURLToPath } from 'url'; // 织：新增导入
import type { HuiRenderingHints as ImportedHuiRenderingHints } from '@mcpwithhui/hui/shared'; // 织: 添加导入

// 织：为 ES 模块定义 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CurrentHuiRenderingHints extends ImportedHuiRenderingHints {
    category?: string;
    tags?: string[];
    keywords?: string[];
    outputDescription?: string;
}

// 织：配置文件路径，假设在 server/src/siyuan.config.json
// __dirname 在 ES模块中不可用，需要用 import.meta.url 转换或更可靠的路径策略
// 为了简单起见，我们先尝试一个基于当前文件可能位置的相对路径，实际部署时可能需要调整
const CONFIG_FILE_PATH = path.join(__dirname, '../siyuan.config.json'); // 假设 siyuan.ts 在 tools/ 下，配置文件在 src/ 下

interface SiyuanConfig {
    SIYUAN_API_URL?: string;
    SIYUAN_API_TOKEN?: string;
    SIYUAN_DAILY_NOTE_NOTEBOOK_ID?: string;
}

let loadedConfig: SiyuanConfig | null = null;
let configLoadAttempted = false;

// 织：新的辅助函数，用于从文件加载配置
function loadSiyuanConfigFromFile(): SiyuanConfig {
    if (configLoadAttempted) {
        return loadedConfig || {};
    }
    configLoadAttempted = true;
    try {
        // 尝试更可靠的路径定位到 server/src/siyuan.config.json
        // 这个路径是假设执行脚本时，CWD 是项目根目录 MCPWithHUI
        const projectRootRelativePath = path.resolve(process.cwd(), 'server', 'src', 'siyuan.config.json');
        if (fs.existsSync(projectRootRelativePath)) {
            const fileContent = fs.readFileSync(projectRootRelativePath, 'utf-8');
            loadedConfig = JSON.parse(fileContent) as SiyuanConfig;
            console.log('[SiyuanToolConfig] Successfully loaded config from:', projectRootRelativePath);
            return loadedConfig || {};
        } else {
            console.warn('[SiyuanToolConfig] Config file not found at:', projectRootRelativePath, '- falling back to env/args.');
        }
    } catch (error: any) {
        console.warn('[SiyuanToolConfig] Error loading or parsing siyuan.config.json:', error.message);
    }
    return {};
}

// 从环境变量读取配置 (作为备选)
const SIYUAN_API_URL_ENV = process.env.SIYUAN_API_URL || 'http://127.0.0.1:6806';
const SIYUAN_API_TOKEN_ENV = process.env.SIYUAN_API_TOKEN;
const SIYUAN_DAILY_NOTE_NOTEBOOK_ID_ENV = process.env.SIYUAN_DAILY_NOTE_NOTEBOOK_ID;

// 导出原始的 ZodRawShape
export const writeToSiyuanDailyNoteInputRawShape = {
    content: z.string().min(1, '内容不能为空'),
    siyuanApiUrl: z.string().url().optional().describe('可选的思源 API URL，如果未提供则使用环境变量 SIYUAN_API_URL 或默认值。'),
    siyuanApiToken: z.string().optional().describe('可选的思源 API Token，如果未提供则使用环境变量 SIYUAN_API_TOKEN。'),
    siyuanNotebookId: z.string().optional().describe('可选的思源笔记本 ID，如果未提供则使用环境变量 SIYUAN_DAILY_NOTE_NOTEBOOK_ID。'),
};

export const writeToSiyuanDailyNoteHuiHints: CurrentHuiRenderingHints = {
    label: '写入思源日记',
    description: '将指定内容追加到思源笔记的当日日记中。可以临时提供 API URL、Token 和笔记本 ID 作为参数，否则将从服务器环境变量读取。',
    category: 'Siyuan笔记操作',
    tags: ['siyuan', 'daily', 'write'],
    inputHints: {
        content: { label: '内容 (必填)', inputType: 'textarea', required: true },
        siyuanApiUrl: { label: 'API URL (可选)', inputType: 'text' },
        siyuanApiToken: { label: 'API Token (可选)', inputType: 'text' },
        siyuanNotebookId: { label: '笔记本ID (可选)', inputType: 'text' },
    }
};

export async function writeToSiyuanDailyNoteHandler(
    args: any
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    const { content, siyuanApiUrl: apiUrlArg, siyuanApiToken: apiTokenArg, siyuanNotebookId: notebookIdArg } = args;
    const fileConfig = loadSiyuanConfigFromFile();

    const apiUrl = apiUrlArg || SIYUAN_API_URL_ENV || fileConfig.SIYUAN_API_URL || 'http://127.0.0.1:6806'; // 确保总有一个默认值
    const apiToken = apiTokenArg || SIYUAN_API_TOKEN_ENV || fileConfig.SIYUAN_API_TOKEN;
    const notebookId = notebookIdArg || SIYUAN_DAILY_NOTE_NOTEBOOK_ID_ENV || fileConfig.SIYUAN_DAILY_NOTE_NOTEBOOK_ID;

    if (!apiToken) {
        console.error('[HUI Tool:writeToSiyuanDailyNote] 错误：API Token 未通过参数、环境变量或配置文件提供。');
        throw new McpError(ErrorCode.InvalidParams, '配置错误：API Token 必须通过参数、环境变量或 siyuan.config.json 文件提供。');
    }
    if (!notebookId) {
        console.error('[HUI Tool:writeToSiyuanDailyNote] 错误：笔记本 ID 未通过参数、环境变量或配置文件提供。');
        throw new McpError(ErrorCode.InvalidParams, '配置错误：笔记本 ID 必须通过参数、环境变量或 siyuan.config.json 文件提供。');
    }
    if (!apiUrl) { 
        console.error('[HUI Tool:writeToSiyuanDailyNote] 错误：API URL 未通过参数、环境变量或配置文件提供，且无默认值。');
        throw new McpError(ErrorCode.InvalidParams, '配置错误：API URL 必须通过参数、环境变量或 siyuan.config.json 文件提供。');
    }

    try {
        const requestBody = {
            notebook: notebookId,
            dataType: 'markdown',
            data: content,
        };

        console.log(`[HUI Tool:writeToSiyuanDailyNote] 准备发送到思源 API: ${apiUrl}/api/block/appendDailyNoteBlock, Token: ${apiToken ? apiToken.substring(0,5) + '...' : 'N/A'}, Notebook: ${notebookId}, body:`, JSON.stringify(requestBody, null, 2));

        const response = await fetch(`${apiUrl}/api/block/appendDailyNoteBlock`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${apiToken}`,
            },
            body: JSON.stringify(requestBody),
        });

        const responseData = await response.json();

        console.log('[HUI Tool:writeToSiyuanDailyNote] 思源 API 响应:', JSON.stringify(responseData, null, 2));

        if (!response.ok || responseData.code !== 0) {
            const errorMessage = `思源 API 调用失败: ${response.status} ${response.statusText} - ${responseData.msg || '未知错误'}`;
            console.error(`[HUI Tool:writeToSiyuanDailyNote] ${errorMessage}`);
            throw new McpError(ErrorCode.InternalError, errorMessage);
        }

        // --- 织：开始添加属性 (使用 cheerio 解析HTML) ---
        let resultText = `成功将内容追加到思源日记，但未在响应中找到可操作的块ID或有效的HTML数据。`; // 默认返回信息
        const processedBlockIds: string[] = [];
        const apiCallData = responseData.data; 

        if (apiCallData && Array.isArray(apiCallData) && apiCallData.length > 0 && 
            apiCallData[0].doOperations && Array.isArray(apiCallData[0].doOperations) && apiCallData[0].doOperations.length > 0 &&
            apiCallData[0].doOperations[0].data && typeof apiCallData[0].doOperations[0].data === 'string') {
            
            const htmlData = apiCallData[0].doOperations[0].data;
            const $ = cheerio.load(htmlData);
            const blockIdsFromHtml: string[] = [];

            $('div[data-node-id]').each((i, elem) => {
                const blockId = $(elem).attr('data-node-id');
                if (blockId) {
                    blockIdsFromHtml.push(blockId);
                }
            });

            if (blockIdsFromHtml.length > 0) {
                const timestamp = new Date().toISOString();
                for (const blockId of blockIdsFromHtml) {
                    processedBlockIds.push(blockId);
                    try {
                        const attrsToSet = {
                            'custom-chat-role': 'assistant',
                            'custom-chat-persona': '织',
                            'custom-by-tool': 'mcp-zhi-toolbox-writeToSiyuanDailyNoteHandler',
                            'custom-tool-timestamp': timestamp
                        };
                        
                        const attrResponse = await fetch(`${apiUrl}/api/attr/setBlockAttrs`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Token ${apiToken}`,
                            },
                            body: JSON.stringify({
                                id: blockId,
                                attrs: attrsToSet,
                            }),
                        });
                        const attrResponseData = await attrResponse.json();
                        if (!attrResponse.ok || attrResponseData.code !== 0) {
                            console.warn(`[HUI Tool:writeToSiyuanDailyNote] 为块 ${blockId} 设置属性失败: ${attrResponse.status} ${attrResponse.statusText} - ${attrResponseData.msg || '未知错误'}`);
                        } else {
                            // console.log(`[HUI Tool:writeToSiyuanDailyNote] 成功为块 ${blockId} 设置属性。`);
                        }
                    } catch (attrError: any) {
                        console.warn(`[HUI Tool:writeToSiyuanDailyNote] 为块 ${blockId} 设置属性时发生异常: ${attrError.message || '未知错误'}`);
                    }
                }
                resultText = `成功将内容追加到思源日记。操作的块ID: ${processedBlockIds.join(', ')}`;
            } else {
                resultText = `成功将内容追加到思源日记，但在返回的HTML中未提取到任何块ID。`;
            }
        } else {
            resultText = `成功将内容追加到思源日记，但响应数据为空、格式不正确或不包含有效的操作数据。`;
        }
        // --- 织：结束添加属性 ---
        
        const result = {
            content: [{ type: 'text' as const, text: resultText }],
        };
        
        if (!result || !Array.isArray(result.content) || result.content.length === 0 || !result.content[0].text) {
            console.error('[HUI Tool:writeToSiyuanDailyNote] 尝试返回无效的成功结果结构:', JSON.stringify(result));
            throw new McpError(ErrorCode.InternalError, '工具writeToSiyuanDailyNote未能生成有效的成功响应。');
        }
        console.log(`[HUI Tool:writeToSiyuanDailyNote] About to return result for content '${content.substring(0,50)}...':`, JSON.stringify(result));
        return result;

    } catch (error: any) {
        console.error(`[HUI Tool:writeToSiyuanDailyNote] 执行时发生错误 for content '${content.substring(0,50)}...':`, error);
        if (error instanceof McpError) {
            throw error;
        }
        throw new McpError(ErrorCode.InternalError, `执行 writeToSiyuanDailyNote 工具时出错: ${error.message || '未知错误'}`);
    }
}

// --- getSiyuanNotebooks Tool --- 

export const getSiyuanNotebooksInputRawShape = {
    siyuanApiUrl: z.string().url().optional().describe('可选的思源 API URL，如果未提供则使用环境变量 SIYUAN_API_URL 或默认值。'),
    siyuanApiToken: z.string().optional().describe('可选的思源 API Token，如果未提供则使用环境变量 SIYUAN_API_TOKEN。'),
};

export const getSiyuanNotebooksHuiHints: CurrentHuiRenderingHints = {
    label: '获取思源笔记本列表',
    description: '调用思源 API /api/notebook/lsNotebooks 获取所有笔记本的列表。可以临时提供 API URL 和 Token 作为参数。',
    category: 'Siyuan笔记操作',
    tags: ['siyuan', 'notebook', 'list'],
    outputDescription: '返回笔记本列表的JSON字符串和摘要信息。',
    inputHints: {
        siyuanApiUrl: { label: 'API URL (可选)', inputType: 'text' },
        siyuanApiToken: { label: 'API Token (可选)', inputType: 'text' },
    }
};

interface SiyuanNotebookInfo {
    id: string;
    name: string;
    icon: string;
    sort: number;
    closed: boolean;
}

export async function getSiyuanNotebooksHandler(
    args: any
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    const { siyuanApiUrl: apiUrlArg, siyuanApiToken: apiTokenArg } = args;
    const fileConfig = loadSiyuanConfigFromFile();

    const apiUrl = apiUrlArg || SIYUAN_API_URL_ENV || fileConfig.SIYUAN_API_URL || 'http://127.0.0.1:6806';
    const apiToken = apiTokenArg || SIYUAN_API_TOKEN_ENV || fileConfig.SIYUAN_API_TOKEN;

    if (!apiToken) {
        console.error('[HUI Tool:getSiyuanNotebooks] 错误：API Token 未通过参数、环境变量或配置文件提供。');
        throw new McpError(ErrorCode.InvalidParams, '配置错误：API Token 必须通过参数、环境变量或 siyuan.config.json 文件提供。');
    }
    if (!apiUrl) {
        console.error('[HUI Tool:getSiyuanNotebooks] 错误：API URL 未通过参数、环境变量或配置文件提供，且无默认值。');
        throw new McpError(ErrorCode.InvalidParams, '配置错误：API URL 必须通过参数、环境变量或 siyuan.config.json 文件提供。');
    }

    try {
        console.log(`[HUI Tool:getSiyuanNotebooks] 准备调用思源 API: ${apiUrl}/api/notebook/lsNotebooks, Token: ${apiToken ? apiToken.substring(0,5) + '...' : 'N/A'}`);

        const response = await fetch(`${apiUrl}/api/notebook/lsNotebooks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${apiToken}`,
            },
            body: JSON.stringify({}), // lsNotebooks API 不需要参数，发送空对象
        });

        const responseData = await response.json();
        console.log('[HUI Tool:getSiyuanNotebooks] 思源 API 响应:', JSON.stringify(responseData, null, 2));

        if (!response.ok || responseData.code !== 0) {
            const errorMessage = `思源 API (lsNotebooks) 调用失败: ${response.status} ${response.statusText} - ${responseData.msg || '未知错误'}`;
            console.error(`[HUI Tool:getSiyuanNotebooks] ${errorMessage}`);
            throw new McpError(ErrorCode.InternalError, errorMessage);
        }

        const notebooks: SiyuanNotebookInfo[] = responseData.data?.notebooks || [];
        
        // 将笔记本列表转换为格式化的JSON字符串
        const notebooksJsonString = JSON.stringify(notebooks, null, 2); 

        const result = {
            content: [
                { type: 'text' as const, text: `成功获取到 ${notebooks.length} 个笔记本。详细列表如下（JSON格式）:` },
                { type: 'text' as const, text: notebooksJsonString } // 以text形式返回JSON字符串
            ],
        };
        
        if (!result || !Array.isArray(result.content) || result.content.length < 1 || !result.content[0].text) {
            console.error('[HUI Tool:getSiyuanNotebooks] 尝试返回无效的结果结构:', JSON.stringify(result));
            throw new McpError(ErrorCode.InternalError, '工具getSiyuanNotebooks未能生成有效的响应。');
        }
        console.log(`[HUI Tool:getSiyuanNotebooks] About to return ${notebooks.length} notebooks as a JSON string.`);
        return result;

    } catch (error: any) {
        console.error(`[HUI Tool:getSiyuanNotebooks] 执行时发生错误:`, error);
        if (error instanceof McpError) {
            throw error;
        }
        throw new McpError(ErrorCode.InternalError, `执行 getSiyuanNotebooks 工具时出错: ${error.message || '未知错误'}`);
    }
} 

// --- getSiyuanNoteContentById Tool ---

export const getSiyuanNoteContentByIdInputRawShape = {
    noteId: z.string().min(1, '笔记ID不能为空'),
    siyuanApiUrl: z.string().url().optional().describe('可选的思源 API URL，如果未提供则使用环境变量 SIYUAN_API_URL 或默认值。'),
    siyuanApiToken: z.string().optional().describe('可选的思源 API Token，如果未提供则使用环境变量 SIYUAN_API_TOKEN。'),
};

export const getSiyuanNoteContentByIdHuiHints: CurrentHuiRenderingHints = {
    label: '获取思源笔记内容',
    description: '根据指定的块ID获取思源笔记的 Markdown 内容。可以临时提供 API URL 和 Token 作为参数。',
    category: 'Siyuan笔记操作',
    tags: ['siyuan', 'note', 'content', 'read'],
    outputDescription: '返回笔记的Markdown内容。',
    inputHints: {
        noteId: { label: '笔记/块 ID (必填)', inputType: 'text', required: true },
        siyuanApiUrl: { label: 'API URL (可选)', inputType: 'text' },
        siyuanApiToken: { label: 'API Token (可选)', inputType: 'text' },
    }
};

export async function getSiyuanNoteContentByIdHandler(
    args: any
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    const { noteId, siyuanApiUrl: apiUrlArg, siyuanApiToken: apiTokenArg } = args;
    const fileConfig = loadSiyuanConfigFromFile();

    const apiUrl = apiUrlArg || SIYUAN_API_URL_ENV || fileConfig.SIYUAN_API_URL || 'http://127.0.0.1:6806';
    const apiToken = apiTokenArg || SIYUAN_API_TOKEN_ENV || fileConfig.SIYUAN_API_TOKEN;

    if (!noteId) { // noteId is specific to this tool and must be provided
        console.error('[HUI Tool:getSiyuanNoteContentById] 错误：noteId 未提供。');
        throw new McpError(ErrorCode.InvalidParams, '参数错误：必须提供 noteId。');
    }
    if (!apiToken) {
        console.error('[HUI Tool:getSiyuanNoteContentById] 错误：API Token 未通过参数、环境变量或配置文件提供。');
        throw new McpError(ErrorCode.InvalidParams, '配置错误：API Token 必须通过参数、环境变量或 siyuan.config.json 文件提供。');
    }
    if (!apiUrl) {
        console.error('[HUI Tool:getSiyuanNoteContentById] 错误：API URL 未通过参数、环境变量或配置文件提供，且无默认值。');
        throw new McpError(ErrorCode.InvalidParams, '配置错误：API URL 必须通过参数、环境变量或 siyuan.config.json 文件提供。');
    }

    try {
        const requestBody = {
            id: noteId,
        };

        console.log(`[HUI Tool:getSiyuanNoteContentById] 准备调用思源 API: ${apiUrl}/api/export/exportMdContent, Token: ${apiToken ? apiToken.substring(0,5) + '...' : 'N/A'}, Body:`, JSON.stringify(requestBody, null, 2));

        const response = await fetch(`${apiUrl}/api/export/exportMdContent`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${apiToken}`,
            },
            body: JSON.stringify(requestBody),
        });

        const responseData = await response.json();
        console.log('[HUI Tool:getSiyuanNoteContentById] 思源 API 响应:', JSON.stringify(responseData, null, 2));

        if (!response.ok || responseData.code !== 0) {
            const errorMessage = `思源 API (exportMdContent) 调用失败: ${response.status} ${response.statusText} - ${responseData.msg || '未知错误'}`;
            console.error(`[HUI Tool:getSiyuanNoteContentById] ${errorMessage}`);
            throw new McpError(ErrorCode.InternalError, errorMessage);
        }

        const noteContent = responseData.data?.content;
        if (typeof noteContent !== 'string') {
            const errorMessage = `思源 API (exportMdContent) 返回的内容格式不正确，期望获取字符串，实际获取：${typeof noteContent}`;
            console.error(`[HUI Tool:getSiyuanNoteContentById] ${errorMessage}`);
            console.error(`[HUI Tool:getSiyuanNoteContentById] 完整的响应数据:`, JSON.stringify(responseData, null, 2));
            throw new McpError(ErrorCode.InternalError, errorMessage);
        }
        
        const result = {
            content: [{ type: 'text' as const, text: noteContent }],
        };
        
        if (!result || !Array.isArray(result.content) || result.content.length === 0 || typeof result.content[0].text !== 'string') {
            console.error('[HUI Tool:getSiyuanNoteContentById] 尝试返回无效的结果结构:', JSON.stringify(result));
            throw new McpError(ErrorCode.InternalError, '工具getSiyuanNoteContentById未能生成有效的响应。');
        }
        console.log(`[HUI Tool:getSiyuanNoteContentById] About to return content for note ID '${noteId}'.`);
        return result;

    } catch (error: any) {
        console.error(`[HUI Tool:getSiyuanNoteContentById] 执行时发生错误 for note ID '${noteId}':`, error);
        if (error instanceof McpError) {
            throw error;
        }
        throw new McpError(ErrorCode.InternalError, `执行 getSiyuanNoteContentById 工具时出错: ${error.message || '未知错误'}`);
    }
} 

// --- searchSiyuanNotes Tool ---

export const searchSiyuanNotesInputRawShape = {
    query: z.string().min(1, '搜索关键词不能为空'),
    kMethod: z.enum(['keyword', 'tag', 'sql', 'wildcard', 'regex', 'template', 'outline', 'Task', 'TaskNotDone', 'TaskDone', 'ChildDocument', 'assets', 'content']).default('keyword').describe('搜索方法，默认为关键词搜索 (keyword)'),
    sortBy: z.enum(['rank', 'created', 'updated', 'docRank', 'refCount', 'alphanum', 'alphanumASC', 'alphanumDESC']).default('rank').describe('排序方式，默认为相关度 (rank)'),
    page: z.number().int().positive().default(1).describe('页码，从 1 开始'),
    limit: z.number().int().positive().max(100).default(20).describe('每页数量，默认 20，最大 100'),
    siyuanApiUrl: z.string().url().optional().describe('可选的思源 API URL，如果未提供则使用环境变量 SIYUAN_API_URL 或默认值。'),
    siyuanApiToken: z.string().optional().describe('可选的思源 API Token，如果未提供则使用环境变量 SIYUAN_API_TOKEN。'),
};

export const searchSiyuanNotesHuiHints: CurrentHuiRenderingHints = {
    label: '搜索思源笔记',
    description: '根据关键词、标签等在思源笔记中进行全文搜索。',
    category: 'Siyuan笔记操作',
    tags: ['siyuan', 'search', 'find'],
    outputDescription: '返回搜索结果列表的JSON字符串和摘要信息。',
    inputHints: {
        query: { label: '搜索关键词 (必填)', inputType: 'text', required: true },
        kMethod: { 
            label: '搜索方法 (可选)', 
            inputType: 'select', 
            options: ['keyword', 'tag', 'sql', 'wildcard', 'regex', 'template', 'outline', 'Task', 'TaskNotDone', 'TaskDone', 'ChildDocument', 'assets', 'content'].map(v => ({ label: v, value: v })), 
            placeholder: '默认 keyword' 
        },
        sortBy: { 
            label: '排序方式 (可选)', 
            inputType: 'select', 
            options: ['rank', 'created', 'updated', 'docRank', 'refCount', 'alphanum', 'alphanumASC', 'alphanumDESC'].map(v => ({ label: v, value: v })), 
            placeholder: '默认 rank' 
        },
        page: { label: '页码 (可选)', inputType: 'number', placeholder: '默认 1' },
        limit: { label: '每页数量 (可选)', inputType: 'number', placeholder: '默认 20, 最大 100' },
        siyuanApiUrl: { label: 'API URL (可选)', inputType: 'text' },
        siyuanApiToken: { label: 'API Token (可选)', inputType: 'text' },
    }
};

interface SiyuanSearchResultBlock {
    id: string;
    box: string; // Notebook ID
    path: string; // Breadcrumb path
    name: string; // Document name or first line of block
    content: string; // Matched content snippet (HTML)
    markdown: string; // Markdown of the block
    type: string; // e.g., 'd' for document, 'h' for heading, 'p' for paragraph
    [key: string]: any; // Other potential fields
}

export async function searchSiyuanNotesHandler(
    args: any
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    const { query, siyuanApiUrl: apiUrlArg, siyuanApiToken: apiTokenArg, kMethod, sortBy, limit, page } = args;
    const fileConfig = loadSiyuanConfigFromFile();

    const apiUrl = apiUrlArg || SIYUAN_API_URL_ENV || fileConfig.SIYUAN_API_URL || 'http://127.0.0.1:6806';
    const apiToken = apiTokenArg || SIYUAN_API_TOKEN_ENV || fileConfig.SIYUAN_API_TOKEN;
    
    if (!query) {
        console.error('[HUI Tool:searchSiyuanNotes] 错误：搜索查询 (query) 未提供。');
        throw new McpError(ErrorCode.InvalidParams, '参数错误：必须提供搜索查询 (query)。');
    }
    if (!apiToken) {
        console.error('[HUI Tool:searchSiyuanNotes] 错误：API Token 未通过参数、环境变量或配置文件提供。');
        throw new McpError(ErrorCode.InvalidParams, '配置错误：API Token 必须通过参数、环境变量或 siyuan.config.json 文件提供。');
    }
    if (!apiUrl) {
        console.error('[HUI Tool:searchSiyuanNotes] 错误：API URL 未通过参数、环境变量或配置文件提供，且无默认值。');
        throw new McpError(ErrorCode.InvalidParams, '配置错误：API URL 必须通过参数、环境变量或 siyuan.config.json 文件提供。');
    }

    try {
        const requestBody = {
            query,
            method: kMethod, // API expects 'method' not 'kMethod'
            sort: sortBy,    // API expects 'sort' not 'sortBy'
            page,
            limit,
        };

        console.log(`[HUI Tool:searchSiyuanNotes] 准备调用思源 API: ${apiUrl}/api/search/fullTextSearchBlock, Token: ${apiToken ? apiToken.substring(0,5) + '...' : 'N/A'}, Body:`, JSON.stringify(requestBody, null, 2));

        const response = await fetch(`${apiUrl}/api/search/fullTextSearchBlock`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${apiToken}`,
            },
            body: JSON.stringify(requestBody),
        });

        const responseData = await response.json();
        console.log('[HUI Tool:searchSiyuanNotes] 思源 API 响应:', JSON.stringify(responseData, null, 2));

        if (!response.ok || responseData.code !== 0) {
            const errorMessage = `思源 API (fullTextSearchBlock) 调用失败: ${response.status} ${response.statusText} - ${responseData.msg || '未知错误'}`;
            console.error(`[HUI Tool:searchSiyuanNotes] ${errorMessage}`);
            throw new McpError(ErrorCode.InternalError, errorMessage);
        }

        const searchResults: SiyuanSearchResultBlock[] = responseData.data?.blocks || [];
        const matchedCount: number = responseData.data?.matchedCount || 0;
        const pageCount: number = responseData.data?.pageCount || 0;
        
        const resultSummaryText = `搜索 '${query}' (方法: ${kMethod}, 排序: ${sortBy}, 页码: ${page}, 每页: ${limit})：找到 ${matchedCount} 个结果，共 ${pageCount} 页。当前显示 ${searchResults.length} 条。`;
        const resultsAsJsonString = JSON.stringify(searchResults, null, 2);
        
        const result = {
            content: [
                { type: 'text' as const, text: resultSummaryText },
                { type: 'text' as const, text: `详细结果 (JSON格式):\n${resultsAsJsonString}` }
            ],
        };
        
        if (!result || !Array.isArray(result.content) || result.content.length < 1) {
            console.error('[HUI Tool:searchSiyuanNotes] 尝试返回无效的结果结构:', JSON.stringify(result));
            throw new McpError(ErrorCode.InternalError, '工具 searchSiyuanNotes 未能生成有效的响应。');
        }
        console.log(`[HUI Tool:searchSiyuanNotes] About to return ${searchResults.length} search results for query '${query}'.`);
        return result;

    } catch (error: any) {
        console.error(`[HUI Tool:searchSiyuanNotes] 执行时发生错误 for query '${query}':`, error);
        if (error instanceof McpError) {
            throw error;
        }
        throw new McpError(ErrorCode.InternalError, `执行 searchSiyuanNotes 工具时出错: ${error.message || '未知错误'}`);
    }
} 

// --- createSiyuanNotebook Tool ---

export const createSiyuanNotebookInputRawShape = {
    name: z.string().min(1, '笔记本名称不能为空').describe('新笔记本的名称'),
    icon: z.string().optional().describe('可选的笔记本图标 (Emoji)'),
    siyuanApiUrl: z.string().url().optional().describe('可选的思源 API URL，如果未提供则使用配置文件或环境变量。'),
    siyuanApiToken: z.string().optional().describe('可选的思源 API Token，如果未提供则使用配置文件或环境变量。'),
};

export const createSiyuanNotebookHuiHints: CurrentHuiRenderingHints = {
    label: '创建思源笔记本',
    description: '创建一个新的思源笔记本。可以指定名称和可选的图标。',
    category: 'Siyuan笔记操作',
    tags: ['siyuan', 'notebook', 'create'],
    outputDescription: '成功时返回新创建笔记本的ID和名称等信息，失败时返回错误。',
    inputHints: {
        name: { label: '笔记本名称', inputType: 'text', placeholder: '例如：我的新项目', required: true },
        icon: { label: '笔记本图标 (可选)', inputType: 'text', placeholder: '例如：🚀', required: false },
        siyuanApiUrl: { label: 'API URL (可选)', inputType: 'text', placeholder: '覆盖默认 API URL', required: false },
        siyuanApiToken: { label: 'API Token (可选)', inputType: 'text', placeholder: '覆盖默认 API Token', required: false },
    }
};

export async function createSiyuanNotebookHandler(
    args: any // Will be typed by z.infer<typeof createSiyuanNotebookInputSchema> by the caller (HuiMcpServer.tool)
): Promise<{ content: Array<{ type: 'text'; text: string } & Record<string, unknown>> }> {
    const { name, icon, siyuanApiUrl: apiUrlArg, siyuanApiToken: apiTokenArg } = args;
    const fileConfig = loadSiyuanConfigFromFile(); // Assumes loadSiyuanConfigFromFile is defined in this file

    const apiUrl = apiUrlArg || fileConfig.SIYUAN_API_URL || SIYUAN_API_URL_ENV || 'http://127.0.0.1:6806';
    const apiToken = apiTokenArg || fileConfig.SIYUAN_API_TOKEN || SIYUAN_API_TOKEN_ENV;

    if (!apiToken) {
        console.error('[HUI Tool:createSiyuanNotebook] 错误：API Token 未通过参数、配置文件或环境变量提供。');
        throw new McpError(ErrorCode.InvalidParams, '配置错误：API Token 必须通过参数、配置文件或环境变量提供。');
    }

    const requestBody: { name: string; icon?: string } = { name };
    if (icon) {
        requestBody.icon = icon;
    }

    try {
        console.log(`[HUI Tool:createSiyuanNotebook] 准备调用思源 API: ${apiUrl}/api/notebook/createNotebook, Token: ${apiToken ? apiToken.substring(0, 5) + '...' : 'N/A'}, Body:`, JSON.stringify(requestBody));

        const response = await fetch(`${apiUrl}/api/notebook/createNotebook`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${apiToken}`,
            },
            body: JSON.stringify(requestBody),
        });

        const responseData = await response.json();
        console.log('[HUI Tool:createSiyuanNotebook] 思源 API 响应:', JSON.stringify(responseData, null, 2));

        if (!response.ok || responseData.code !== 0) {
            const errorMessage = `创建笔记本失败: ${response.status} ${response.statusText} - ${responseData.msg || '未知错误'}`;
            console.error(`[HUI Tool:createSiyuanNotebook] ${errorMessage}`);
            throw new McpError(ErrorCode.InternalError, errorMessage);
        }

        // 假设成功时 responseData.data 包含 { id: string, name: string, icon: string, ... }
        // 根据实际API返回调整，如果API不直接返回创建的笔记本信息，可能需要后续调用 lsNotebooks 或 getNotebookConf
        // 但通常创建操作会返回被创建资源的一些信息。
        // 从 lsNotebooks 的输出来看，data直接就是笔记本对象数组，这里可能是单个对象
        // 暂时假设 data 是 { notebook: { id: string, name: string, icon: string, ... } } 或直接是 notebook 对象
        let newNotebookInfo = "";
        if (responseData.data) {
            // 根据之前 lsNotebooks 和 renameNotebook 的 data 结构，这里 data 可能是 null 或 包含 notebook 信息的对象
            // 如果 createNotebook API 成功时不返回 data (或返回null)，我们需要调整这里的逻辑
            // 查阅 `notebook/index.html` 看到 `createNotebook.html`，但我们无法读取它
            // 我们先假设它返回一个包含 notebook ID 的对象在 data 里，比如 data.id
            // 或者，如果返回的 data 直接是笔记本对象，如 {id: 'xxx', name: 'yyy', icon: '🚀'}
            // 我们需要一个更可靠的方式来确定返回结构。暂时用一个通用成功消息
            newNotebookInfo = ` (ID: ${responseData.data.id || '未知'})`; // 尝试获取ID
        }

        return {
            content: [
                { type: 'text', text: `成功创建笔记本 '${name}'${newNotebookInfo}` }
            ]
        };

    } catch (error: any) {
        console.error(`[HUI Tool:createSiyuanNotebook] 执行时发生错误 for name '${name}':`, error);
        if (error instanceof McpError) {
            throw error;
        }
        throw new McpError(ErrorCode.InternalError, `执行 createSiyuanNotebook 工具时出错: ${error.message || '未知错误'}`);
    }
} 

// --- getSiyuanDocsInNotebook Tool ---

export const getSiyuanDocsInNotebookInputRawShape = {
    notebookId: z.string().min(1, '笔记本ID不能为空').describe('要查询的笔记本ID'),
    path: z.string().optional().default('/').describe('要查询的笔记本内路径，默认为根路径 "/"'),
    sort: z.number().int().min(0).max(3).optional().describe('排序方式 (0:名称, 1:更新时间, 2:创建时间, 3:自定义)'),
    siyuanApiUrl: z.string().url().optional().describe('可选的思源 API URL'),
    siyuanApiToken: z.string().optional().describe('可选的思源 API Token'),
};

export const getSiyuanDocsInNotebookHuiHints: CurrentHuiRenderingHints = {
    label: '获取笔记本内文档列表',
    description: '列出指定思源笔记本内指定路径下的文档和文件夹。',
    category: 'Siyuan笔记操作',
    tags: ['siyuan', 'notebook', 'filetree', 'list', 'document'],
    outputDescription: '返回文档和文件夹列表的JSON字符串以及摘要信息。',
    inputHints: {
        notebookId: { label: '笔记本ID (必填)', inputType: 'text', required: true },
        path: { label: '路径 (可选)', inputType: 'text', placeholder: '默认为根路径 /', required: false },
        sort: { label: '排序方式 (可选)', inputType: 'select', options: [{label: '名称 (0)', value:0}, {label:'更新时间 (1)', value:1}, {label:'创建时间 (2)', value:2}, {label:'自定义 (3)', value:3}], required: false },
        siyuanApiUrl: { label: 'API URL (可选)', inputType: 'text', required: false },
        siyuanApiToken: { label: 'API Token (可选)', inputType: 'text', required: false },
    }
};

export async function getSiyuanDocsInNotebookHandler(
    args: any // Typed by z.infer later by HuiMcpServer.tool
): Promise<{ content: Array<{ type: 'text'; text: string } & Record<string, unknown>> }> {
    const { notebookId, path, sort, siyuanApiUrl: apiUrlArg, siyuanApiToken: apiTokenArg } = args;
    const fileConfig = loadSiyuanConfigFromFile();

    const apiUrl = apiUrlArg || fileConfig.SIYUAN_API_URL || SIYUAN_API_URL_ENV || 'http://127.0.0.1:6806';
    const apiToken = apiTokenArg || fileConfig.SIYUAN_API_TOKEN || SIYUAN_API_TOKEN_ENV;

    if (!apiToken) {
        console.error('[HUI Tool:getSiyuanDocsInNotebook] 错误：API Token 未提供。');
        throw new McpError(ErrorCode.InvalidParams, '配置错误：API Token 必须提供。');
    }

    const requestBody: { notebook: string; path: string; sort?: number } = {
        notebook: notebookId,
        path: path || '/', // Ensure path is always a string, default to root if undefined/empty
    };
    if (sort !== undefined && sort !== null) {
        requestBody.sort = sort;
    }

    try {
        console.log(`[HUI Tool:getSiyuanDocsInNotebook] 准备调用思源 API: ${apiUrl}/api/filetree/listDocTree, Token: ${apiTokenShort(apiToken)}, Body:`, JSON.stringify(requestBody));
        // 织: 定义一个辅助函数来缩短Token日志输出，避免敏感信息过长
        function apiTokenShort(token: string | undefined): string {
            if (!token) return 'N/A';
            return token.length > 8 ? token.substring(0, 5) + '...' : token;
        }

        const response = await fetch(`${apiUrl}/api/filetree/listDocTree`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${apiToken}`,
            },
            body: JSON.stringify(requestBody),
        });

        const responseData = await response.json();
        console.log('[HUI Tool:getSiyuanDocsInNotebook] 思源 API 响应:', JSON.stringify(responseData, null, 2));

        if (!response.ok || responseData.code !== 0) {
            const errorMessage = `获取文档列表失败: ${response.status} ${response.statusText} - ${responseData.msg || '未知错误'}`;
            console.error(`[HUI Tool:getSiyuanDocsInNotebook] ${errorMessage}`);
            throw new McpError(ErrorCode.InternalError, errorMessage);
        }

        const files = responseData.data?.files;
        if (Array.isArray(files)) {
            const summaryText = `在笔记本 ${notebookId} 路径 '${requestBody.path}' 下找到 ${files.length} 个条目：`;
            return {
                content: [
                    { type: 'text', text: summaryText },
                    { type: 'text', text: JSON.stringify(files, null, 2) }
                ]
            };
        } else {
            return {
                content: [
                    { type: 'text', text: `未能获取文档列表或列表为空 (笔记本: ${notebookId}, 路径: '${requestBody.path}')。` }
                ]
            };
        }

    } catch (error: any) {
        console.error(`[HUI Tool:getSiyuanDocsInNotebook] 执行时发生错误 for notebook '${notebookId}', path '${path}':`, error);
        if (error instanceof McpError) {
            throw error;
        }
        throw new McpError(ErrorCode.InternalError, `执行 getSiyuanDocsInNotebook 工具时出错: ${error.message || '未知错误'}`);
    }
} 

// --- findMyNotes Tool (织's Notes Search) ---

export const findMyNotesInputRawShape = {
    userQuery: z.string().optional().describe('在"织"的笔记中搜索的关键词 (可选)'),
    sortBy: z.enum(['rank', 'created', 'updated', 'docRank', 'refCount', 'alphanum', 'alphanumASC', 'alphanumDESC']).default('updated').optional().describe('排序方式，默认为更新时间'),
    page: z.number().int().positive().default(1).optional().describe('页码，从 1 开始'),
    limit: z.number().int().positive().max(100).default(20).optional().describe('每页数量，默认 20，最大 100'),
    siyuanApiUrl: z.string().url().optional().describe('可选的思源 API URL'),
    siyuanApiToken: z.string().optional().describe('可选的思源 API Token'),
};

export const findMyNotesHuiHints: CurrentHuiRenderingHints = {
    label: '查找我的笔记 (织)',
    description: "在思源笔记中搜索由'织'创建的笔记。可以额外指定关键词在这些笔记中进一步搜索。",
    category: 'Siyuan笔记操作',
    tags: ['siyuan', 'search', 'find', '织', 'assistant-notes'],
    outputDescription: '返回搜索到的笔记列表 (JSON格式) 和摘要信息。',
    inputHints: {
        userQuery: { label: '在"织"笔记中搜索 (可选)', inputType: 'text' },
        sortBy: { 
            label: '排序方式 (可选)', 
            inputType: 'select', 
            options: ['rank', 'created', 'updated', 'docRank', 'refCount', 'alphanum', 'alphanumASC', 'alphanumDESC'].map(v => ({ label: v, value: v })), 
            placeholder: '默认 updated' 
        },
        page: { label: '页码 (可选)', inputType: 'number', placeholder: '默认 1' },
        limit: { label: '每页数量 (可选)', inputType: 'number', placeholder: '默认 20, 最大 100' },
        siyuanApiUrl: { label: 'API URL (可选)', inputType: 'text' },
        siyuanApiToken: { label: 'API Token (可选)', inputType: 'text' },
    }
};

interface SiyuanSearchResultBlockForMyNotes extends SiyuanSearchResultBlock {} // Assuming SiyuanSearchResultBlock is already defined

export async function findMyNotesHandler(
    args: any 
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    const { userQuery, siyuanApiUrl: apiUrlArg, siyuanApiToken: apiTokenArg, sortBy: sortByArg, limit: limitArg, page: pageArg } = args;
    const fileConfig = loadSiyuanConfigFromFile();

    const apiUrl = apiUrlArg || SIYUAN_API_URL_ENV || fileConfig.SIYUAN_API_URL || 'http://127.0.0.1:6806';
    const apiToken = apiTokenArg || SIYUAN_API_TOKEN_ENV || fileConfig.SIYUAN_API_TOKEN;
    
    const sortBy = sortByArg || 'updated'; // Default sort
    const page = pageArg || 1;
    const limit = limitArg || 20;

    if (!apiToken) {
        console.error('[HUI Tool:findMyNotes] 错误：API Token 未提供。');
        throw new McpError(ErrorCode.InvalidParams, '配置错误：API Token 必须通过参数、环境变量或 siyuan.config.json 文件提供。');
    }
    if (!apiUrl) {
        console.error('[HUI Tool:findMyNotes] 错误：API URL 未提供。');
        throw new McpError(ErrorCode.InvalidParams, '配置错误：API URL 必须通过参数、环境变量或 siyuan.config.json 文件提供。');
    }

    let sqlStatement = `SELECT * FROM blocks WHERE id IN (SELECT block_id FROM attributes WHERE name = 'custom-chat-persona' AND value = '织')`;

    if (userQuery && typeof userQuery === 'string' && userQuery.trim() !== '') {
        const escapedQuery = userQuery.replace(/'/g, "''").replace(/%/g, "\%").replace(/_/g, "\_");
        sqlStatement += ` AND content LIKE '%${escapedQuery}%' ESCAPE '\'`;
    }

    let orderBySql = 'ORDER BY updated DESC'; 
    if (sortBy === 'created') orderBySql = 'ORDER BY created DESC';
    else if (sortBy === 'alphanumASC') orderBySql = 'ORDER BY sort ASC'; 
    else if (sortBy === 'alphanumDESC') orderBySql = 'ORDER BY sort DESC';
    sqlStatement += ` ${orderBySql}`;
    
    // Helper function for logging shortened API token
    function apiTokenShort(token: string | undefined): string {
        if (!token) return 'N/A';
        return token.length > 8 ? token.substring(0, 5) + '...' : token;
    }

    try {
        const requestBody = {
            query: sqlStatement,
            method: 'sql',
            sort: sortBy, 
            page,
            limit,
        };

        console.log(`[HUI Tool:findMyNotes] 准备调用思源 API: ${apiUrl}/api/search/fullTextSearchBlock, Token: ${apiTokenShort(apiToken)}, Body:`, JSON.stringify(requestBody, null, 2));

        const response = await fetch(`${apiUrl}/api/search/fullTextSearchBlock`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${apiToken}`,
            },
            body: JSON.stringify(requestBody),
        });

        const responseData = await response.json();
        console.log('[HUI Tool:findMyNotes] 思源 API 响应:', JSON.stringify(responseData, null, 2));

        if (!response.ok || responseData.code !== 0) {
            const errorMessage = `思源 API (findMyNotes via fullTextSearchBlock SQL) 调用失败: ${response.status} ${response.statusText} - ${responseData.msg || '未知错误'}`;
            console.error(`[HUI Tool:findMyNotes] ${errorMessage}`);
            throw new McpError(ErrorCode.InternalError, errorMessage);
        }

        const searchResults: SiyuanSearchResultBlockForMyNotes[] = responseData.data?.blocks || [];
        const matchedCount: number = responseData.data?.matchedCount || 0;
        const pageCount: number = responseData.data?.pageCount || 0;
        
        const userQueryText = (userQuery && userQuery.trim() !== '') ? `在"织"的笔记中搜索 "${userQuery}"` : "查找\"织\"的所有笔记";
        const resultSummaryText = `${userQueryText} (排序: ${sortBy}, 页码: ${page}, 每页: ${limit})：找到 ${matchedCount} 个结果，共 ${pageCount} 页。当前显示 ${searchResults.length} 条。`;
        const resultsAsJsonString = JSON.stringify(searchResults, null, 2);
        
        const result = {
            content: [
                { type: 'text' as const, text: resultSummaryText },
                { type: 'text' as const, text: `详细结果 (JSON格式):\n${resultsAsJsonString}` }
            ],
        };
        
        if (!result || !Array.isArray(result.content) || result.content.length < 1) {
            console.error('[HUI Tool:findMyNotes] 尝试返回无效的结果结构:', JSON.stringify(result));
            throw new McpError(ErrorCode.InternalError, '工具 findMyNotes 未能生成有效的响应。');
        }
        console.log(`[HUI Tool:findMyNotes] About to return ${searchResults.length} search results for query targeting "织" notes.`);
        return result;

    } catch (error: any) {
        console.error(`[HUI Tool:findMyNotes] 执行时发生错误 for query targeting "织" notes (userQuery: '${userQuery || ''}'):`, error);
        if (error instanceof McpError) {
            throw error;
        }
        throw new McpError(ErrorCode.InternalError, `执行 findMyNotes 工具时出错: ${error.message || '未知错误'}`);
    }
} 