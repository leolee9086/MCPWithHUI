// MCPWithHUI/server/src/tools/siyuanGenericAPITool.ts
// Provides a generic HUI tool to call any Siyuan API endpoint.

import { z } from 'zod';
import type { HuiInputHint, HuiRenderingHints } from '@mcpwithhui/hui/shared';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { callSiyuanAPI } from './siyuanAPICaller.js'; 
// 织：暂时移除对 siyuan.ts 中特定函数的导入，将直接处理配置获取
// import { getSiyuanApiUrl, getSiyuanApiToken, SIYUAN_API_URL_ENV_VAR_NAME, SIYUAN_API_TOKEN_ENV_VAR_NAME } from './siyuan.js';
import fs from 'fs'; // 织：引入 fs 用于读取配置文件
import path from 'path'; // 织：引入 path 用于处理路径

// 织：先定义 invokeSiyuanAPIInputRawShape
export const invokeSiyuanAPIInputRawShape = {
  endpoint: z.string().describe("The Siyuan API endpoint path (e.g., /api/notebook/lsNotebooks). Must start with '/api/'.")
    .refine(val => val.startsWith('/api/'), { message: "Endpoint must start with /api/" }),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('POST').describe("HTTP method to use."),
  payload: z.string().optional().describe("Payload for the request, as a JSON string. For GET, if it represents a JSON object, it will be parsed and converted to query params."),
  siyuanApiUrl: z.string().url().optional().describe("Optional Siyuan API URL. Overrides environment variables and siyuan.config.json."),
  siyuanApiToken: z.string().optional().describe("Optional Siyuan API Token. Overrides environment variables and siyuan.config.json.")
};

// 织：然后再用它来创建 ZodObject schema
const invokeSiyuanAPIInputSchema = z.object(invokeSiyuanAPIInputRawShape);

// 织：从 siyuan.ts 借鉴并适配的配置加载逻辑
const SIYUAN_CONFIG_FILE_PATH = path.resolve(process.cwd(), 'server', 'src', 'siyuan.config.json');
interface SiyuanConfig {
    SIYUAN_API_URL?: string;
    SIYUAN_API_TOKEN?: string;
    SIYUAN_DAILY_NOTE_NOTEBOOK_ID?: string;
}
let loadedSiyuanAppConfig: SiyuanConfig | null = null;
let siyuanAppConfigLoadAttempted = false;

function loadSiyuanAppConfigFromFile(): SiyuanConfig {
    if (siyuanAppConfigLoadAttempted) {
        return loadedSiyuanAppConfig || {};
    }
    siyuanAppConfigLoadAttempted = true;
    try {
        if (fs.existsSync(SIYUAN_CONFIG_FILE_PATH)) {
            const fileContent = fs.readFileSync(SIYUAN_CONFIG_FILE_PATH, 'utf-8');
            loadedSiyuanAppConfig = JSON.parse(fileContent) as SiyuanConfig;
            console.log('[invokeSiyuanAPI] Successfully loaded app config from:', SIYUAN_CONFIG_FILE_PATH);
            return loadedSiyuanAppConfig || {};
        } else {
            console.warn('[invokeSiyuanAPI] App config file not found at:', SIYUAN_CONFIG_FILE_PATH, '- falling back to env/args.');
        }
    } catch (error: any) {
        console.warn('[invokeSiyuanAPI] Error loading or parsing app siyuan.config.json:', error.message);
    }
    return {};
}

const endpointHint: HuiInputHint = { label: 'API 端点', inputType: 'text', placeholder: '/api/system/version', required: true };
const methodHint: HuiInputHint = {
      label: 'HTTP 方法',
      inputType: 'select',
      options: [{label: 'POST', value: 'POST'}, {label: 'GET', value: 'GET'}, {label: 'PUT', value: 'PUT'}, {label: 'DELETE', value: 'DELETE'}],
      defaultValue: 'POST',
      required: true
};
const payloadHint: HuiInputHint = { 
    label: '载荷 (Payload JSON 字符串)', 
    inputType: 'textarea', 
    placeholder: '{\"id\": \"your_block_id\"}', 
    required: false
};
const siyuanApiUrlHint: HuiInputHint = { label: '思源 API URL (可选)', inputType: 'text', placeholder: 'http://127.0.0.1:6806', required: false };
const siyuanApiTokenHint: HuiInputHint = { label: '思源 API Token (可选)', inputType: 'password', placeholder: '您的思源Token', required: false };

export const invokeSiyuanAPIHuiHints: HuiRenderingHints = {
  label: '调用思源API (通用)',
  description: '通过指定端点、方法和载荷，调用任意思源HTTP API。高级工具，请谨慎使用。',
  category: 'Siyuan笔记操作',
  tags: ['Siyuan', 'API', 'Generic', 'Advanced'],
  inputHints: {
    endpoint: endpointHint,
    method: methodHint,
    payload: payloadHint,
    siyuanApiUrl: siyuanApiUrlHint,
    siyuanApiToken: siyuanApiTokenHint,
  }
};

// 织：修正 Handler 的返回类型，参考项目中其他工具的模式
export async function invokeSiyuanAPIHandler(
  args: z.infer<typeof invokeSiyuanAPIInputSchema>, 
  extra: any 
): Promise<{ content: Array<{ type: 'text'; text: string }> }> { // 织：修改返回类型
  console.log('[Tool:invokeSiyuanAPI] Received args:', args);

  const { endpoint, method, payload: payloadString, siyuanApiUrl: apiUrlArg, siyuanApiToken: apiTokenArg } = args;
  
  try {
    const fileConfig = loadSiyuanAppConfigFromFile();
    
    const apiUrlToUse = apiUrlArg || process.env.SIYUAN_API_URL || fileConfig.SIYUAN_API_URL || 'http://127.0.0.1:6806';
    const apiTokenToUse = apiTokenArg || process.env.SIYUAN_API_TOKEN || fileConfig.SIYUAN_API_TOKEN;

    if (!apiUrlToUse) { 
        throw new McpError(ErrorCode.InvalidParams, "Siyuan API URL is not configured. Provide it in args, siyuan.config.json, or SIYUAN_API_URL env var.");
    }
    if (!apiTokenToUse) {
      throw new McpError(ErrorCode.InvalidParams, "Siyuan API Token is not configured. Provide it in args, siyuan.config.json, or SIYUAN_API_TOKEN env var.");
    }

    console.log(`[Tool:invokeSiyuanAPI] Calling endpoint: ${method} ${apiUrlToUse}${endpoint}`);
    
    let parsedPayload: any = null;
    if (payloadString) {
        try {
            parsedPayload = JSON.parse(payloadString);
        } catch (e) {
            throw new McpError(ErrorCode.InvalidParams, `Payload is not a valid JSON string: ${ (e as Error).message }`);
        }
    }

    const resultData = await callSiyuanAPI<any>(
      apiUrlToUse,
      apiTokenToUse,
      endpoint,
      parsedPayload, 
      method
    );

    const resultJson = JSON.stringify(resultData, null, 2);
    return {
      content: [
        { type: 'text', text: `API call to ${method} ${endpoint} successful.` },
        { type: 'text', text: resultJson }
      ]
    };

  } catch (error: any) {
    console.error(`[Tool:invokeSiyuanAPI] Error calling Siyuan API:`, error);
    if (error instanceof McpError) {
        throw error;
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during API call';
    throw new McpError(ErrorCode.InternalError, `Failed to invoke Siyuan API ${method} ${endpoint}: ${errorMessage}`);
  }
}

export const tools = {
  invokeSiyuanAPI: {
    inputRawShape: invokeSiyuanAPIInputRawShape,
    handler: invokeSiyuanAPIHandler,
    hui: invokeSiyuanAPIHuiHints,
    description: invokeSiyuanAPIHuiHints.description, 
  }
}; 