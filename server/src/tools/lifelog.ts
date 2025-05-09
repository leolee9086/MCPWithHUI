// lifelog.ts - 生活日志相关工具

import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { HuiRenderingHints as ImportedHuiRenderingHints } from '@mcpwithhui/hui/shared';

// 为 ES 模块定义 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CurrentHuiRenderingHints extends ImportedHuiRenderingHints {
    category?: string;
    tags?: string[];
    keywords?: string[];
    outputDescription?: string;
}

// 配置文件路径，与siyuan.ts保持一致
const CONFIG_FILE_PATH = path.join(__dirname, '../siyuan.config.json');

interface SiyuanConfig {
    SIYUAN_API_URL?: string;
    SIYUAN_API_TOKEN?: string;
}

let loadedConfig: SiyuanConfig | null = null;
let configLoadAttempted = false;

// 从文件加载配置
function loadSiyuanConfigFromFile(): SiyuanConfig {
    if (configLoadAttempted) {
        return loadedConfig || {};
    }
    configLoadAttempted = true;
    try {
        // 尝试更可靠的路径定位到 server/src/siyuan.config.json
        const projectRootRelativePath = path.resolve(process.cwd(), 'server', 'src', 'siyuan.config.json');
        if (fs.existsSync(projectRootRelativePath)) {
            const fileContent = fs.readFileSync(projectRootRelativePath, 'utf-8');
            loadedConfig = JSON.parse(fileContent) as SiyuanConfig;
            console.log('[LifelogToolConfig] 成功从以下位置加载配置:', projectRootRelativePath);
            return loadedConfig || {};
        } else {
            console.warn('[LifelogToolConfig] 未找到配置文件:', projectRootRelativePath, '- 尝试使用环境变量/参数。');
        }
    } catch (error: any) {
        console.warn('[LifelogToolConfig] 加载或解析 siyuan.config.json 时出错:', error.message);
    }
    return {};
}

// 从环境变量读取配置 (作为备选)
const SIYUAN_API_URL_ENV = process.env.SIYUAN_API_URL || 'http://127.0.0.1:6806';
const SIYUAN_API_TOKEN_ENV = process.env.SIYUAN_API_TOKEN;

// 导出查询lifelog块的输入参数定义
export const findBlocksWithLifelogTypeInputRawShape = {
    lifelogType: z.string().optional().describe('可选，指定要查询的特定lifelog类型值'),
    limit: z.number().optional().default(100).describe('结果数量限制，默认100条'),
    boxId: z.string().optional().describe('可选，限定在特定笔记本中查询'),
    siyuanApiUrl: z.string().url().optional().describe('可选的思源 API URL，如果未提供则使用环境变量 SIYUAN_API_URL 或默认值。'),
    siyuanApiToken: z.string().optional().describe('可选的思源 API Token，如果未提供则使用环境变量 SIYUAN_API_TOKEN。'),
};

// 导出UI渲染提示
export const findBlocksWithLifelogTypeHuiHints: CurrentHuiRenderingHints = {
    label: '查询生活日志类型块',
    description: '查询所有包含custom-lifelog-type属性的块，可按类型、笔记本等条件过滤',
    category: 'Siyuan笔记操作',
    tags: ['siyuan', 'lifelog', 'query', 'block', 'attribute'],
    keywords: ['生活日志', '属性查询', '块查询'],
    outputDescription: '返回匹配的块列表，包含块ID、内容、路径、属性值等信息',
    inputHints: {
        lifelogType: { 
            label: '生活日志类型', 
            inputType: 'text', 
            placeholder: '可选，如：工作、学习、固定',
            required: false 
        },
        limit: { 
            label: '结果数量限制', 
            inputType: 'number', 
            placeholder: '100',
            required: false 
        },
        boxId: { 
            label: '笔记本ID', 
            inputType: 'text', 
            placeholder: '可选，限定特定笔记本',
            required: false 
        },
        siyuanApiUrl: { 
            label: 'API URL (可选)', 
            inputType: 'text' 
        },
        siyuanApiToken: { 
            label: 'API Token (可选)', 
            inputType: 'text' 
        }
    }
};

// 处理函数
export async function findBlocksWithLifelogTypeHandler(
    args: any
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    const { 
        lifelogType, 
        limit = 100, 
        boxId, 
        siyuanApiUrl: apiUrlArg, 
        siyuanApiToken: apiTokenArg 
    } = args;
    
    const fileConfig = loadSiyuanConfigFromFile();
    
    const apiUrl = apiUrlArg || SIYUAN_API_URL_ENV || fileConfig.SIYUAN_API_URL || 'http://127.0.0.1:6806';
    const apiToken = apiTokenArg || SIYUAN_API_TOKEN_ENV || fileConfig.SIYUAN_API_TOKEN;

    if (!apiToken) {
        console.error('[HUI Tool:findBlocksWithLifelogType] 错误：API Token 未通过参数、环境变量或配置文件提供。');
        throw new McpError(ErrorCode.InvalidParams, '配置错误：API Token 必须通过参数、环境变量或 siyuan.config.json 文件提供。');
    }

    // 构建SQL查询语句
    let sqlStatement = `
        SELECT 
            b.id, b.content, b.path, b.box, b.hpath, b.type, b.parent_id, b.root_id, a.value AS lifelog_type
        FROM attributes AS a
        JOIN blocks AS b ON a.block_id = b.id
        WHERE a.name = 'custom-lifelog-type'
    `;

    // 添加可选的类型过滤条件
    if (lifelogType) {
        sqlStatement += ` AND a.value = '${lifelogType}'`;
    }
    
    // 添加可选的笔记本过滤条件
    if (boxId) {
        sqlStatement += ` AND b.box = '${boxId}'`;
    }
    
    // 添加排序和限制
    sqlStatement += `
        ORDER BY b.updated DESC
        LIMIT ${limit}
    `;

    try {
        console.log(`[HUI Tool:findBlocksWithLifelogType] 准备发送SQL查询到思源API: ${apiUrl}/api/query/sql`);
        console.log(`[HUI Tool:findBlocksWithLifelogType] 查询语句: ${sqlStatement}`);

        const response = await fetch(`${apiUrl}/api/query/sql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${apiToken}`,
            },
            body: JSON.stringify({
                stmt: sqlStatement,
            }),
        });

        const responseData = await response.json();

        if (!response.ok || responseData.code !== 0) {
            const errorMessage = `思源 API 调用失败: ${response.status} ${response.statusText} - ${responseData.msg || '未知错误'}`;
            console.error(`[HUI Tool:findBlocksWithLifelogType] ${errorMessage}`);
            throw new McpError(ErrorCode.InternalError, errorMessage);
        }

        // 从响应中获取查询结果
        const blocks = responseData.data || [];
        
        if (blocks.length === 0) {
            return {
                content: [{ 
                    type: 'text', 
                    text: `未找到匹配的生活日志块。${lifelogType ? `类型过滤: ${lifelogType}` : '查询了所有类型'}` 
                }]
            };
        }

        // 格式化结果
        let resultText = `找到 ${blocks.length} 个${lifelogType ? `类型为 "${lifelogType}" 的` : ''} 生活日志块：\n\n`;
        
        // 创建块信息摘要
        blocks.forEach((block: any, index: number) => {
            resultText += `${index + 1}. ID: ${block.id}\n`;
            resultText += `   类型: ${block.lifelog_type}\n`;
            resultText += `   内容: ${block.content.substring(0, 100)}${block.content.length > 100 ? '...' : ''}\n`;
            resultText += `   路径: ${block.hpath || block.path}\n`;
            resultText += `   笔记本: ${block.box}\n\n`;
        });

        return {
            content: [{ type: 'text', text: resultText }]
        };
    } catch (error: any) {
        if (error instanceof McpError) {
            throw error; // 已经是格式化的错误，直接抛出
        } else {
            console.error(`[HUI Tool:findBlocksWithLifelogType] 执行时出错:`, error);
            throw new McpError(
                ErrorCode.InternalError,
                `查询生活日志块失败: ${error.message || '未知错误'}`
            );
        }
    }
} 