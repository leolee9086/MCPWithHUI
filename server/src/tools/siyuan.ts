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

// 织：顶层辅助函数 - 缩短API Token用于日志输出
function apiTokenShort(token: string | undefined): string {
    if (!token) return 'N/A';
    return token.length > 8 ? `${token.substring(0, 5)}...` : token;
}

// 织：定义标准的MCP输出Zod Schema
const mcpStandardOutputSchema = z.object({
    content: z.array(
        z.object({
            type: z.string().describe("通常是 'text' 或 'object'"),
            text: z.string().optional().describe("当 type 为 'text' 时使用"),
            data: z.any().optional().describe("当 type 为 'object' 时使用")
        })
    ).describe("工具输出的主要内容")
});

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

        console.log(`[HUI Tool:writeToSiyuanDailyNote] 准备发送到思源 API: ${apiUrl}/api/block/appendDailyNoteBlock, Token: ${apiTokenShort(apiToken)}, Notebook: ${notebookId}, body:`, JSON.stringify(requestBody, null, 2));

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
        console.log(`[HUI Tool:getSiyuanNotebooks] 准备调用思源 API: ${apiUrl}/api/notebook/lsNotebooks, Token: ${apiTokenShort(apiToken)}`);

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

        console.log(`[HUI Tool:getSiyuanNoteContentById] 准备调用思源 API: ${apiUrl}/api/export/exportMdContent, Token: ${apiTokenShort(apiToken)}, Body:`, JSON.stringify(requestBody, null, 2));

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
            console.error(`[HUI Tool:getSiyuanNoteContentById] 完整的响应数据:`, JSON.stringify(responseData, null, 2));
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
    const { query, kMethod, sortBy, limit, page, siyuanApiUrl: apiUrlArg, siyuanApiToken: apiTokenArg } = args;
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

        console.log(`[HUI Tool:searchSiyuanNotes] 准备调用思源 API: ${apiUrl}/api/search/fullTextSearchBlock, Token: ${apiTokenShort(apiToken)}, Body:`, JSON.stringify(requestBody, null, 2));

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
    const fileConfig = loadSiyuanConfigFromFile();

    const apiUrl = apiUrlArg || SIYUAN_API_URL_ENV || fileConfig.SIYUAN_API_URL || 'http://127.0.0.1:6806';
    const apiToken = apiTokenArg || SIYUAN_API_TOKEN_ENV || fileConfig.SIYUAN_API_TOKEN;

    if (!apiToken) {
        console.error('[HUI Tool:createSiyuanNotebook] 错误：API Token 未通过参数、配置文件或环境变量提供。');
        throw new McpError(ErrorCode.InvalidParams, '配置错误：API Token 必须通过参数、配置文件或环境变量提供。');
    }

    const requestBody: { name: string; icon?: string } = { name };
    if (icon) {
        requestBody.icon = icon;
    }

    try {
        console.log(`[HUI Tool:createSiyuanNotebook] 准备调用思源 API: ${apiUrl}/api/notebook/createNotebook, Token: ${apiTokenShort(apiToken)}, Body:`, JSON.stringify(requestBody));

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
    const { notebookId, path: docPath, sort, siyuanApiUrl: apiUrlArg, siyuanApiToken: apiTokenArg } = args;
    const fileConfig = loadSiyuanConfigFromFile();

    const apiUrl = apiUrlArg || SIYUAN_API_URL_ENV || fileConfig.SIYUAN_API_URL || 'http://127.0.0.1:6806';
    const apiToken = apiTokenArg || SIYUAN_API_TOKEN_ENV || fileConfig.SIYUAN_API_TOKEN;

    if (!apiToken) {
        console.error('[HUI Tool:getSiyuanDocsInNotebook] 错误：API Token 未提供。');
        throw new McpError(ErrorCode.InvalidParams, '配置错误：API Token 必须提供。');
    }

    const requestBody: { notebook: string; path: string; sort?: number } = {
        notebook: notebookId,
        path: docPath || '/', // Ensure path is always a string, default to root if undefined/empty
    };
    if (sort !== undefined && sort !== null) {
        requestBody.sort = sort;
    }

    try {
        console.log(`[HUI Tool:getSiyuanDocsInNotebook] 准备调用思源 API: ${apiUrl}/api/filetree/listDocsByPath, Token: ${apiTokenShort(apiToken)}, Body:`, JSON.stringify(requestBody));

        const response = await fetch(`${apiUrl}/api/filetree/listDocsByPath`, {
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
            const summaryText = `在笔记本 ${notebookId} 路径 '${docPath}' 下找到 ${files.length} 个条目：`;
            return {
                content: [
                    { type: 'text', text: summaryText },
                    { type: 'text', text: JSON.stringify(files, null, 2) }
                ]
            };
        } else {
            return {
                content: [
                    { type: 'text', text: `未能获取文档列表或列表为空 (笔记本: ${notebookId}, 路径: '${docPath}')。` }
                ]
            };
        }

    } catch (error: any) {
        console.error(`[HUI Tool:getSiyuanDocsInNotebook] 执行时发生错误 for notebook '${notebookId}', path '${docPath}':`, error);
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
    const {
        userQuery,
        sortBy = 'updated',
        limit = 20,
        page = 1,
        siyuanApiUrl: apiUrlArg,
        siyuanApiToken: apiTokenArg
    } = args;
    const fileConfig = loadSiyuanConfigFromFile();

    const apiUrl = apiUrlArg || SIYUAN_API_URL_ENV || fileConfig.SIYUAN_API_URL || 'http://127.0.0.1:6806';
    const apiToken = apiTokenArg || SIYUAN_API_TOKEN_ENV || fileConfig.SIYUAN_API_TOKEN;
    
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

// --- getOrCreateNotebook Tool ---

export const getOrCreateNotebookInputRawShape = {
    notebookName: z.string().min(1, '笔记本名称不能为空'),
    icon: z.string().optional().describe('可选的笔记本图标 (Emoji)'),
    siyuanApiUrl: z.string().url().optional().describe('可选的思源 API URL，如果未提供则使用环境变量 SIYUAN_API_URL 或默认值。'),
    siyuanApiToken: z.string().optional().describe('可选的思源 API Token，如果未提供则使用环境变量 SIYUAN_API_TOKEN。'),
};

export const getOrCreateNotebookHuiHints: CurrentHuiRenderingHints = {
    label: '获取或创建思源笔记本',
    description: '根据名称查找思源笔记本，如果不存在则创建它。可以指定图标。',
    category: 'Siyuan笔记操作',
    tags: ['siyuan', 'notebook', 'create', 'get', 'find', 'ensure'],
    outputDescription: '返回找到或创建的笔记本的详细信息，包括ID、名称、图标以及是否存在/是否被创建的状态。',
    inputHints: {
        notebookName: { label: '笔记本名称 (必填)', inputType: 'text', required: true },
        icon: { label: '笔记本图标 (可选)', inputType: 'text' },
        siyuanApiUrl: { label: 'API URL (可选)', inputType: 'text' },
        siyuanApiToken: { label: 'API Token (可选)', inputType: 'text' },
    }
};

interface NotebookDetail {
    id: string;
    name: string;
    icon: string;
    sort?: number; // 从 lsNotebooks 可能获得
    closed?: boolean; // 从 lsNotebooks 可能获得
    exists: boolean;
    created: boolean;
}

export async function getOrCreateNotebookHandler(
    args: any
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    const { notebookName, icon, siyuanApiUrl: apiUrlArg, siyuanApiToken: apiTokenArg } = args;
    const fileConfig = loadSiyuanConfigFromFile();

    const apiUrl = apiUrlArg || SIYUAN_API_URL_ENV || fileConfig.SIYUAN_API_URL || 'http://127.0.0.1:6806';
    const apiToken = apiTokenArg || SIYUAN_API_TOKEN_ENV || fileConfig.SIYUAN_API_TOKEN;

    if (!apiToken) {
        console.error('[HUI Tool:getOrCreateNotebook] 错误：API Token 未提供。');
        throw new McpError(ErrorCode.InvalidParams, '配置错误：API Token 必须通过参数、环境变量或 siyuan.config.json 文件提供。');
    }
    if (!apiUrl) {
        console.error('[HUI Tool:getOrCreateNotebook] 错误：API URL 未提供。');
        throw new McpError(ErrorCode.InvalidParams, '配置错误：API URL 必须通过参数、环境变量或 siyuan.config.json 文件提供。');
    }

    try {
        // 1. 列出现有笔记本
        console.log(`[HUI Tool:getOrCreateNotebook] 准备列出笔记本, API: ${apiUrl}/api/notebook/lsNotebooks, Token: ${apiTokenShort(apiToken)}`);
        const lsResponse = await fetch(`${apiUrl}/api/notebook/lsNotebooks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${apiToken}`,
            },
            body: JSON.stringify({}),
        });
        const lsResponseData = await lsResponse.json();

        console.log('[HUI Tool:getOrCreateNotebook] lsNotebooks API 响应:', JSON.stringify(lsResponseData, null, 2));

        if (!lsResponse.ok || lsResponseData.code !== 0) {
            const errorMsg = `列出笔记本失败: ${lsResponse.status} ${lsResponse.statusText} - ${lsResponseData.msg || '未知错误'}`;
            console.error(`[HUI Tool:getOrCreateNotebook] ${errorMsg}`);
            throw new McpError(ErrorCode.InternalError, errorMsg);
        }

        const notebooks: SiyuanNotebookInfo[] = lsResponseData.data.notebooks || [];
        const existingNotebook = notebooks.find(nb => nb.name === notebookName);

        if (existingNotebook) {
            console.log(`[HUI Tool:getOrCreateNotebook] 找到已存在的笔记本: ${notebookName} (ID: ${existingNotebook.id})`);
            const notebookDetail: NotebookDetail = {
                id: existingNotebook.id,
                name: existingNotebook.name,
                icon: existingNotebook.icon,
                sort: existingNotebook.sort,
                closed: existingNotebook.closed,
                exists: true,
                created: false,
            };
            return {
                content: [
                    { type: 'text', text: `已找到笔记本 '${notebookName}' (ID: ${existingNotebook.id})` },
                    { type: 'text', text: JSON.stringify(notebookDetail, null, 2) }
                ]
            };
        } else {
            // 2. 如果未找到，则创建笔记本
            console.log(`[HUI Tool:getOrCreateNotebook] 未找到笔记本 '${notebookName}'，准备创建。 API: ${apiUrl}/api/notebook/createNotebook, Icon: ${icon || ''}`);
            const createBody: { name: string; icon?: string } = { name: notebookName };
            if (icon) {
                createBody.icon = icon;
            }
            const createResponse = await fetch(`${apiUrl}/api/notebook/createNotebook`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Token ${apiToken}`,
                },
                body: JSON.stringify(createBody),
            });
            const createResponseData = await createResponse.json();
            console.log('[HUI Tool:getOrCreateNotebook] createNotebook API 响应:', JSON.stringify(createResponseData, null, 2));

            if (!createResponse.ok || createResponseData.code !== 0) {
                const errorMsg = `创建笔记本 '${notebookName}' 失败: ${createResponse.status} ${createResponse.statusText} - ${createResponseData.msg || '未知错误'}`;
                console.error(`[HUI Tool:getOrCreateNotebook] ${errorMsg}`);
                throw new McpError(ErrorCode.InternalError, errorMsg);
            }
            
            // 织：根据 API 文档 (siyuan-kernelApi-docs/notebook/createNotebook.html) 修正响应解析
            // 正确的路径是 responseData.data.notebook.id
            const newNotebookInfo = createResponseData.data?.notebook; // 使用可选链

            if (!newNotebookInfo || !newNotebookInfo.id) {
                const errorMsg = `创建笔记本 '${notebookName}' 成功，但响应数据中未找到预期的笔记本对象或其ID (expected path: data.notebook.id)。`;
                console.error(`[HUI Tool:getOrCreateNotebook] ${errorMsg} Response:`, createResponseData);
                throw new McpError(ErrorCode.InternalError, errorMsg); 
            }

            console.log(`[HUI Tool:getOrCreateNotebook] 成功创建笔记本: ${newNotebookInfo.name || notebookName} (ID: ${newNotebookInfo.id})`);
            const notebookDetail: NotebookDetail = {
                id: newNotebookInfo.id,
                name: newNotebookInfo.name || notebookName, 
                icon: newNotebookInfo.icon || icon || '',    
                sort: newNotebookInfo.sort, // 织：从API响应中获取sort
                closed: newNotebookInfo.closed, // 织：从API响应中获取closed状态
                exists: false,
                created: true,
            };
            return {
                content: [
                    { type: 'text', text: `已创建笔记本 '${newNotebookInfo.name || notebookName}' (ID: ${newNotebookInfo.id})` },
                    { type: 'text', text: JSON.stringify(notebookDetail, null, 2) }
                ]
            };
        }
    } catch (error: any) {
        console.error(`[HUI Tool:getOrCreateNotebook] 执行时发生错误 for notebookName '${notebookName}':`, error);
        if (error instanceof McpError) {
            throw error;
        }
        throw new McpError(ErrorCode.InternalError, `执行 getOrCreateNotebook 工具时出错: ${error.message || '未知错误'}`);
    }
}

// --- getNotebookStats Tool ---

export const getNotebookStatsInputRawShape = {
    siyuanApiUrl: z.string().url().optional().describe('可选的思源 API URL'),
    siyuanApiToken: z.string().optional().describe('可选的思源 API Token'),
};

// 织: 定义输出数据的单个笔记本统计结构
const notebookStatSchema = z.object({
    id: z.string().describe('笔记本ID'),
    name: z.string().describe('笔记本名称'),
    icon: z.string().optional().describe('笔记本图标'),
    sort: z.number().optional().describe('排序值'),
    closed: z.boolean().optional().describe('是否关闭'),
    docCount: z.number().int().nonnegative().describe('文档块数量 (基于SQL统计)'),
    lastModified: z.string().datetime({ offset: true }).describe('最后修改时间 (ISO 8601 格式, 基于SQL统计)'),
});

// 织: 定义 getNotebookStats 的完整输出 Schema
// const getNotebookStatsOutputSchema = z.object({
//     content: z.array(
//         z.union([
//             z.object({ type: z.literal('text'), text: z.string() }),
//             z.object({ type: z.literal('object'), data: z.array(notebookStatSchema) })
//         ])
//     ).describe("工具输出，包含文本摘要和笔记本统计对象数组")
// });

export const getNotebookStatsHuiHints: CurrentHuiRenderingHints = {
    label: '获取笔记本统计信息',
    description: '获取所有思源笔记本的统计信息，包括文档数量和最后修改时间（基于SQL查询）。',
    category: 'Siyuan笔记操作',
    tags: ['siyuan', 'notebook', 'stats', 'count', 'list', 'sql'],
    outputDescription: '返回一个包含所有笔记本统计信息的对象数组，以及一个文本摘要。',
    inputHints: {
        siyuanApiUrl: { label: 'API URL (可选)', inputType: 'text' },
        siyuanApiToken: { label: 'API Token (可选)', inputType: 'text' },
    }
};

interface NotebookStat {
    id: string;
    name: string;
    icon?: string;
    sort?: number;
    closed?: boolean;
    docCount: number;
    lastModified: string; // ISO 8601 string
}

interface SqlQueryResult {
    box: string;        // Notebook ID
    count: number;      // Count of blocks in the notebook
    max_updated: string; // Max updated timestamp (ISO 8601 format)
}

export async function getNotebookStatsHandler(
    args: any
): Promise<{ content: Array<{ type: 'text' | 'object'; text?: string; data?: NotebookStat[] }> }> {
    const { siyuanApiUrl: apiUrlArg, siyuanApiToken: apiTokenArg } = args;
    const fileConfig = loadSiyuanConfigFromFile();

    const apiUrl = apiUrlArg || SIYUAN_API_URL_ENV || fileConfig.SIYUAN_API_URL || 'http://127.0.0.1:6806';
    const apiToken = apiTokenArg || SIYUAN_API_TOKEN_ENV || fileConfig.SIYUAN_API_TOKEN;

    if (!apiToken) {
        console.error('[HUI Tool:getNotebookStats] 错误：API Token 未提供。');
        throw new McpError(ErrorCode.InvalidParams, '配置错误：API Token 必须通过参数、环境变量或 siyuan.config.json 文件提供。');
    }
    if (!apiUrl) {
        console.error('[HUI Tool:getNotebookStats] 错误：API URL 未提供。');
        throw new McpError(ErrorCode.InvalidParams, '配置错误：API URL 必须通过参数、环境变量或 siyuan.config.json 文件提供。');
    }

    try {
        // 1. 获取所有笔记本基础信息
        console.log(`[HUI Tool:getNotebookStats] 准备获取笔记本列表: ${apiUrl}/api/notebook/lsNotebooks, Token: ${apiTokenShort(apiToken)}`);
        const lsResponse = await fetch(`${apiUrl}/api/notebook/lsNotebooks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${apiToken}`,
            },
            body: JSON.stringify({}),
        });
        const lsResponseData = await lsResponse.json();
        console.log('[HUI Tool:getNotebookStats] lsNotebooks API 响应:', JSON.stringify(lsResponseData, null, 2));

        if (!lsResponse.ok || lsResponseData.code !== 0) {
            const errorMsg = `获取笔记本列表失败: ${lsResponse.status} ${lsResponse.statusText} - ${lsResponseData.msg || '未知错误'}`;
            console.error(`[HUI Tool:getNotebookStats] ${errorMsg}`);
            throw new McpError(ErrorCode.InternalError, errorMsg);
        }
        const notebooks: SiyuanNotebookInfo[] = lsResponseData.data?.notebooks || [];
        const notebookMap = new Map<string, SiyuanNotebookInfo>(notebooks.map(nb => [nb.id, nb]));

        // 2. 使用 SQL 查询统计信息
        const sqlQuery = `SELECT box, COUNT(id) AS count, MAX(updated) AS max_updated FROM blocks WHERE type = 'd' GROUP BY box`;
        console.log(`[HUI Tool:getNotebookStats] 准备执行 SQL 查询: ${apiUrl}/api/query/sql, Token: ${apiTokenShort(apiToken)}, SQL: ${sqlQuery}`);
        const sqlResponse = await fetch(`${apiUrl}/api/query/sql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${apiToken}`,
            },
            body: JSON.stringify({ stmt: sqlQuery }),
        });
        const sqlResponseData = await sqlResponse.json();
        console.log('[HUI Tool:getNotebookStats] SQL API 响应:', JSON.stringify(sqlResponseData, null, 2));

        if (!sqlResponse.ok || sqlResponseData.code !== 0) {
            const errorMsg = `SQL 查询失败: ${sqlResponse.status} ${sqlResponse.statusText} - ${sqlResponseData.msg || '未知错误'}`;
            console.error(`[HUI Tool:getNotebookStats] ${errorMsg}`);
            // 即使 SQL 失败，也尝试返回基础笔记本信息，但标记统计数据不可用
            // 或者可以选择抛出错误，这里选择前者
            // throw new McpError(ErrorCode.InternalError, errorMsg);
             const stats: NotebookStat[] = notebooks.map(nb => ({
                id: nb.id,
                name: nb.name,
                icon: nb.icon || undefined,
                sort: nb.sort,
                closed: nb.closed,
                docCount: 0, // 织：修正 - SQL失败时设为 0 而不是 -1，以符合 nonNegative() 约束
                lastModified: new Date(0).toISOString(), // 织：修正 - SQL失败时设为纪元时间字符串，以符合 datetime() 约束
            }));
            return {
                content: [
                    { type: 'text', text: `成功获取 ${notebooks.length} 个笔记本的基础信息，但 SQL 统计查询失败: ${errorMsg}` },
                    { type: 'object', data: stats }
                ]
            };
        }
        
        const sqlResults: SqlQueryResult[] = sqlResponseData.data || [];
        const statsMap = new Map<string, { docCount: number; lastModified: string }>();
        sqlResults.forEach(result => {
            // 织: 更健壮地处理 max_updated 时间戳
            let isoLastModified = new Date(0).toISOString(); // 默认纪元时间
            if (result.max_updated && typeof result.max_updated === 'string' && result.max_updated.length === 14) {
                // 只有当它是有效的14位字符串时才尝试转换
                try {
                    isoLastModified = `${result.max_updated.substring(0, 4)}-${result.max_updated.substring(4, 6)}-${result.max_updated.substring(6, 8)}T${result.max_updated.substring(8, 10)}:${result.max_updated.substring(10, 12)}:${result.max_updated.substring(12, 14)}Z`;
                } catch (e) {
                    console.warn(`[HUI Tool:getNotebookStats] Failed to parse max_updated string '${result.max_updated}' for box ${result.box}. Falling back to epoch.`, e);
                    // 解析失败也回退到纪元时间
                    isoLastModified = new Date(0).toISOString();
                }
            } else if (result.max_updated) {
                 console.warn(`[HUI Tool:getNotebookStats] Received non-standard max_updated value '${result.max_updated}' (type: ${typeof result.max_updated}) for box ${result.box}. Falling back to epoch.`);
            }

            statsMap.set(result.box, {
                docCount: result.count ?? 0, // 确保 count 也是有效的数字
                lastModified: isoLastModified
            });
        });

        // 3. 合并笔记本信息和统计信息
        const finalStats: NotebookStat[] = notebooks.map(nb => {
            const sqlStat = statsMap.get(nb.id);
            return {
                id: nb.id,
                name: nb.name,
                icon: nb.icon ?? undefined,       // 织：修正 - 使用 ?? 处理 null 值
                sort: nb.sort ?? undefined,       // 织：修正 - 使用 ?? 处理 null 值
                closed: nb.closed ?? undefined,   // 织：修正 - 使用 ?? 处理 null 值
                docCount: sqlStat ? sqlStat.docCount : 0,
                lastModified: sqlStat ? sqlStat.lastModified : new Date(0).toISOString(),
            };
        });

        // 4. 格式化并返回
        const summaryText = `成功获取 ${finalStats.length} 个笔记本的统计信息。详细数据如下 (JSON格式):`;
        const finalStatsJsonString = JSON.stringify(finalStats, null, 2);
        const result = {
            content: [
                { type: 'text' as const, text: summaryText },
                { type: 'text' as const, text: finalStatsJsonString } // 织: 改为返回 JSON 字符串
            ]
        };

        // 织: 移除对特定 Schema 的验证
        // try {
        //     getNotebookStatsOutputSchema.parse(result);
        // } catch (validationError) {
        //     console.error("[HUI Tool:getNotebookStats] Output validation failed:", validationError);
        //     throw new McpError(ErrorCode.InternalError, "工具 getNotebookStats 生成的输出不符合预期的 Schema。");
        // }

        console.log(`[HUI Tool:getNotebookStats] About to return stats for ${finalStats.length} notebooks as JSON string.`);
        return result;

    } catch (error: any) {
        console.error(`[HUI Tool:getNotebookStats] 执行时发生错误:`, error);
        if (error instanceof McpError) {
            throw error;
        }
        throw new McpError(ErrorCode.InternalError, `执行 getNotebookStats 工具时出错: ${error.message || '未知错误'}`);
    }
}

// --- setBlockStyle Tool --- 

export const setBlockStyleInputRawShape = {
    blockId: z.string().min(1, '块ID不能为空').describe('要设置样式的块的ID'),
    cssProperties: z.string().min(1, 'CSS属性不能为空').describe('要应用的CSS属性字符串，例如：color: red; font-size: 16px; background-color: #f0f0f0;'),
    siyuanApiUrl: z.string().url().optional().describe('可选的思源 API URL'),
    siyuanApiToken: z.string().optional().describe('可选的思源 API Token'),
};

export const setBlockStyleHuiHints: CurrentHuiRenderingHints = {
    label: '设置块CSS样式',
    description: '通过设置块的 style 属性，为指定的思源笔记块应用自定义CSS样式。',
    category: 'Siyuan笔记操作',
    tags: ['siyuan', 'block', 'style', 'css', 'customization', 'attribute'],
    outputDescription: '成功时返回操作成功的提示，失败时返回错误信息。',
    inputHints: {
        blockId: { label: '块 ID (必填)', inputType: 'text', required: true },
        cssProperties: { label: 'CSS 属性字符串 (必填)', inputType: 'textarea', placeholder: '例如: color: blue; font-weight: bold; padding: 10px;', required: true },
        siyuanApiUrl: { label: 'API URL (可选)', inputType: 'text' },
        siyuanApiToken: { label: 'API Token (可选)', inputType: 'text' },
    }
};

export async function setBlockStyleHandler(
    args: any
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    const { blockId, cssProperties, siyuanApiUrl: apiUrlArg, siyuanApiToken: apiTokenArg } = args;
    const fileConfig = loadSiyuanConfigFromFile();

    const apiUrl = apiUrlArg || SIYUAN_API_URL_ENV || fileConfig.SIYUAN_API_URL || 'http://127.0.0.1:6806';
    const apiToken = apiTokenArg || SIYUAN_API_TOKEN_ENV || fileConfig.SIYUAN_API_TOKEN;

    if (!apiToken) {
        console.error('[HUI Tool:setBlockStyle] 错误：API Token 未提供。');
        throw new McpError(ErrorCode.InvalidParams, '配置错误：API Token 必须通过参数、环境变量或 siyuan.config.json 文件提供。');
    }
    if (!apiUrl) {
        console.error('[HUI Tool:setBlockStyle] 错误：API URL 未提供。');
        throw new McpError(ErrorCode.InvalidParams, '配置错误：API URL 必须通过参数、环境变量或 siyuan.config.json 文件提供。');
    }

    try {
        const requestBody = {
            id: blockId,
            attrs: {
                style: cssProperties, // 直接将用户提供的CSS字符串作为style属性的值
            },
        };

        console.log(`[HUI Tool:setBlockStyle] 准备调用思源 API: ${apiUrl}/api/attr/setBlockAttrs, Token: ${apiTokenShort(apiToken)}, Body:`, JSON.stringify(requestBody, null, 2));

        const response = await fetch(`${apiUrl}/api/attr/setBlockAttrs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${apiToken}`,
            },
            body: JSON.stringify(requestBody),
        });

        const responseData = await response.json();
        console.log('[HUI Tool:setBlockStyle] 思源 API 响应:', JSON.stringify(responseData, null, 2));

        if (!response.ok || responseData.code !== 0) {
            const errorMessage = `为块 ${blockId} 设置样式失败: ${response.status} ${response.statusText} - ${responseData.msg || '未知错误'}`;
            console.error(`[HUI Tool:setBlockStyle] ${errorMessage}`);
            throw new McpError(ErrorCode.InternalError, errorMessage);
        }

        const resultText = `成功为块 ${blockId} 设置样式属性。请刷新思源笔记查看效果。`;
        return {
            content: [{ type: 'text' as const, text: resultText }],
        };

    } catch (error: any) {
        console.error(`[HUI Tool:setBlockStyle] 执行时发生错误 for blockId '${blockId}':`, error);
        if (error instanceof McpError) {
            throw error;
        }
        throw new McpError(ErrorCode.InternalError, `执行 setBlockStyle 工具时出错: ${error.message || '未知错误'}`);
    }
}
// 织：确保将新工具添加到导出的 tools 对象中
export const tools = {
    writeToSiyuanDailyNote: {
        inputRawShape: writeToSiyuanDailyNoteInputRawShape,
        outputRawShape: mcpStandardOutputSchema,
        handler: writeToSiyuanDailyNoteHandler,
        hui: writeToSiyuanDailyNoteHuiHints,
    },
    getSiyuanNotebooks: {
        inputRawShape: getSiyuanNotebooksInputRawShape,
        outputRawShape: mcpStandardOutputSchema,
        handler: getSiyuanNotebooksHandler,
        hui: getSiyuanNotebooksHuiHints,
    },
    getSiyuanNoteContentById: {
        inputRawShape: getSiyuanNoteContentByIdInputRawShape,
        outputRawShape: mcpStandardOutputSchema,
        handler: getSiyuanNoteContentByIdHandler,
        hui: getSiyuanNoteContentByIdHuiHints,
    },
    searchSiyuanNotes: {
        inputRawShape: searchSiyuanNotesInputRawShape,
        outputRawShape: mcpStandardOutputSchema,
        handler: searchSiyuanNotesHandler,
        hui: searchSiyuanNotesHuiHints,
    },
    createSiyuanNotebook: {
        inputRawShape: createSiyuanNotebookInputRawShape,
        outputRawShape: mcpStandardOutputSchema,
        handler: createSiyuanNotebookHandler,
        hui: createSiyuanNotebookHuiHints,
    },
    getSiyuanDocsInNotebook: {
        inputRawShape: getSiyuanDocsInNotebookInputRawShape,
        outputRawShape: mcpStandardOutputSchema,
        handler: getSiyuanDocsInNotebookHandler,
        hui: getSiyuanDocsInNotebookHuiHints,
    },
    findMyNotes: {
        inputRawShape: findMyNotesInputRawShape,
        outputRawShape: mcpStandardOutputSchema,
        handler: findMyNotesHandler,
        hui: findMyNotesHuiHints,
    },
    getOrCreateNotebook: {
        inputRawShape: getOrCreateNotebookInputRawShape,
        outputRawShape: mcpStandardOutputSchema,
        handler: getOrCreateNotebookHandler,
        hui: getOrCreateNotebookHuiHints,
    },
    getNotebookStats: {
        inputRawShape: getNotebookStatsInputRawShape,
        outputRawShape: mcpStandardOutputSchema, // 织: 改回标准输出 Schema
        handler: getNotebookStatsHandler,
        hui: getNotebookStatsHuiHints,
    },
    setBlockStyle: { // 织: 添加新工具
        inputRawShape: setBlockStyleInputRawShape,
        outputRawShape: mcpStandardOutputSchema,
        handler: setBlockStyleHandler,
        hui: setBlockStyleHuiHints,
    }
};
