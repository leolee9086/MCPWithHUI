import { Client as McpSdkClient } from '@modelcontextprotocol/sdk/client/index.js';
import type { ClientOptions } from '@modelcontextprotocol/sdk/client/index.js';
import type { RequestOptions as McpRequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { z } from 'zod';
import { ListToolsResultSchema, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type {
  Implementation as ClientInfo,
  ListToolsRequest,
  CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';

import type { HuiToolInformation, HuiHints } from '../shared/types.js';

// --- SDK Type Inference for Single Tool ---
// This accesses the Zod schema for a single tool object within the 'tools' array of ListToolsResultSchema
const SingleToolSchemaForClient = ListToolsResultSchema.shape.tools.element;
// This is the TypeScript type for a single tool, inferred from its Zod schema
type SdkToolDefinition = z.infer<typeof SingleToolSchemaForClient>;
// --- End SDK Type Inference ---

// Let's define a conventional name for the HUI meta-tool
const HUI_META_TOOL_NAME = 'listHuiDefinitions';

// Schema for the result of our HUI meta-tool
const HuiDefinitionsResultSchema = z.object({
  tools: z.array(z.object({
    name: z.string(),
    huiHints: z.any(), 
  }))
});
// Type inferred from the HUI meta-tool's result schema
type HuiDefinitionsResult = z.infer<typeof HuiDefinitionsResultSchema>;

// 织: 为了从 callTool 的默认输出中安全地提取 HUI 定义，
// 我们假设 HUI 的 {tools: [...]} 对象可能被包装在
// SDK content 数组的某个元素中，比如一个 type: 'json' 的对象里。
const GenericJsonDataContentSchema = z.object({
  type: z.string(), // 宽松匹配 type，实际可能是 'json' 或其他
  data: z.any(),    // HUI data 会在这里
}).passthrough(); // 允许其他未知属性，以免解析失败

export class HuiMcpClient extends McpSdkClient {
  private serverSupportsHui: boolean | null = null;
  private discoveredHuiMetaToolName: string | null = null;

  constructor(clientInfo: ClientInfo, options?: ClientOptions) {
    super(clientInfo, options);
  }

  /**
   * Lists tools available on the server, attempting to enrich them with HUI hints.
   * If the server supports HUI (by exposing a conventional HUI meta-tool),
   * this method will call that meta-tool to fetch HuiHints and merge them.
   * Otherwise, it returns standard tool information.
   */
  async listToolsWithHui(
    params?: ListToolsRequest["params"],
    options?: McpRequestOptions
  ): Promise<HuiToolInformation[]> {
    const standardToolsResult = await super.listTools(params, options);
    
    if (!standardToolsResult || !standardToolsResult.tools) {
      return [];
    }

    let huiToolInfoArray: HuiToolInformation[] = standardToolsResult.tools.map((tool: SdkToolDefinition) => ({
      ...tool, 
      huiHints: undefined,
    }));

    if (this.serverSupportsHui === null) {
      this.discoveredHuiMetaToolName = this.findHuiMetaTool(standardToolsResult.tools as SdkToolDefinition[]);
      this.serverSupportsHui = !!this.discoveredHuiMetaToolName;
    }

    if (this.serverSupportsHui && this.discoveredHuiMetaToolName) {
      try {
        const callParams: CallToolRequest["params"] = {
          name: this.discoveredHuiMetaToolName,
          arguments: {},
        };

        // 织: 调用 callTool时不传递自定义 responseSchema，让 SDK 使用默认的 CallToolResultSchema
        // sdkCallResult 的类型将是 z.infer<typeof CallToolResultSchema> (由SDK内部定义)
        const sdkCallResult = await super.callTool(
          callParams,
          undefined, // 使用 SDK 默认的 CallToolResultSchema
          options
        );

        console.log('[HuiMcpClient] SDK Result from callTool (default schema):', JSON.stringify(sdkCallResult, null, 2));

        let huiDefinitionsResult: HuiDefinitionsResult | null = null;

        if (sdkCallResult && sdkCallResult.content && Array.isArray(sdkCallResult.content)) {
          for (const contentItem of sdkCallResult.content) {
            if (!contentItem || typeof contentItem !== 'object') continue;

            // 尝试1: contentItem 本身直接就是 HUI 定义？ (不太可能了，因为服务端现在返回 TextContent)
            let parseAttempt = HuiDefinitionsResultSchema.safeParse(contentItem);
            if (parseAttempt.success) {
              huiDefinitionsResult = parseAttempt.data;
              console.log('[HuiMcpClient] Found HUI definitions directly in content item (unexpected with TextContent from server):', huiDefinitionsResult);
              break;
            }

            // 尝试2: contentItem 是一个包含 data 字段的通用 JSON 对象？
            // (例如 { type: 'json', data: { tools: [...] } }) - 这条路径现在也不太可能，因为服务器返回 type: 'text'
            const genericJsonParse = GenericJsonDataContentSchema.safeParse(contentItem);
            if (genericJsonParse.success && genericJsonParse.data.data) { // 确保 .data.data 存在
              parseAttempt = HuiDefinitionsResultSchema.safeParse(genericJsonParse.data.data);
              if (parseAttempt.success) {
                huiDefinitionsResult = parseAttempt.data;
                console.log('[HuiMcpClient] Found HUI definitions in .data of generic JSON content item (unexpected with TextContent from server):', huiDefinitionsResult);
                break;
              }
            }

            // 织: 尝试3: contentItem 是 TextContentPart，其 text 字段是 HUI 定义的 JSON 字符串
            if (contentItem && typeof contentItem === 'object' && 'type' in contentItem && contentItem.type === 'text' && 'text' in contentItem && typeof contentItem.text === 'string') {
              try {
                const parsedTextData = JSON.parse(contentItem.text);
                parseAttempt = HuiDefinitionsResultSchema.safeParse(parsedTextData);
                if (parseAttempt.success) {
                  huiDefinitionsResult = parseAttempt.data;
                  console.log('[HuiMcpClient] Successfully parsed HUI definitions from TextContent item:', huiDefinitionsResult);
                  break; // 成功找到并解析，跳出循环
                } else {
                  console.warn('[HuiMcpClient] TextContent item JSON parsed, but failed HuiDefinitionsResultSchema validation:', parseAttempt.error, 'Parsed data was:', parsedTextData);
                }
              } catch (e) {
                console.warn('[HuiMcpClient] Failed to JSON.parse text from TextContent item:', e, 'Text was:', contentItem.text);
              }
            }
          }
          if (!huiDefinitionsResult) {
            console.warn('[HuiMcpClient] Could not find or parse HUI definitions in sdkCallResult.content array after checking direct match and generic JSON item with .data field.');
          }
        } else {
          console.warn('[HuiMcpClient] sdkCallResult.content is not a valid array or sdkCallResult is invalid.', sdkCallResult);
        }

        if (huiDefinitionsResult && huiDefinitionsResult.tools) {
          const hintsMap = new Map<string, HuiHints>();
          for (const toolWithHint of huiDefinitionsResult.tools) {
            hintsMap.set(toolWithHint.name, toolWithHint.huiHints as HuiHints);
          }

          huiToolInfoArray = huiToolInfoArray.map((tool: HuiToolInformation) => ({
            ...tool,
            huiHints: hintsMap.get(tool.name!) || tool.huiHints,
          }));
        } else {
          // 这个分支理论上不应该被执行，因为如果 schema 验证失败，callTool 会抛错
          // 但保留以防万一，或 HuiDefinitionsResultSchema 定义允许了 null/undefined tools
          console.warn(`[HuiMcpClient] HUI definitions result was valid by schema, but tools array was missing or empty for '${this.discoveredHuiMetaToolName}'. Received:`, huiDefinitionsResult);
        }
      } catch (error) {
        console.warn(`[HuiMcpClient] Failed to fetch or merge HUI hints using tool '${this.discoveredHuiMetaToolName}':`, error);
      }
    }
    return huiToolInfoArray;
  }

  /**
   * Helper to find the conventional HUI meta-tool from a list of tools.
   * TODO: Make the conventional name configurable or allow multiple conventional names.
   */
  private findHuiMetaTool(tools: SdkToolDefinition[]): string | null {
    const found = tools.find(tool => tool.name === HUI_META_TOOL_NAME);
    return found ? found.name : null;
  }

  // It might be useful to have a more direct way to get HuiHints for a single tool if needed
  async getHuiHintsForTool(
    toolName: string, 
    options?: McpRequestOptions
  ): Promise<HuiHints | undefined> {
    if (this.serverSupportsHui === null) {
      console.warn('[HuiMcpClient] HUI support status unknown. Call listToolsWithHui first or implement checkHuiSupport.');
    }

    if (this.serverSupportsHui && this.discoveredHuiMetaToolName) {
      try {
        const callParams: CallToolRequest["params"] = {
          name: this.discoveredHuiMetaToolName,
          arguments: { toolName },
        };

        const rawSdkResultSingleTool = await super.callTool(
          callParams,
          undefined, // Use default result schema
          options
        );

        // GUESS: Extract HUI-specific output from the standard SDK result
        const huiSpecificOutputSingleTool = rawSdkResultSingleTool.content; // GUESS
        const result: HuiDefinitionsResult = HuiDefinitionsResultSchema.parse(huiSpecificOutputSingleTool);
        
        const toolHintData = result.tools?.find(t => t.name === toolName);
        if (toolHintData) {
          return toolHintData.huiHints as HuiHints;
        }
      } catch (error) {
        console.error(`[HuiMcpClient] Error fetching HuiHints for tool '${toolName}':`, error);
      }
    }
    return undefined;
  }
  
  // TODO: Consider adding a dedicated method to check for HUI support explicitly
  // async checkHuiSupport(options?: McpRequestOptions): Promise<boolean> { ... }

  // All other methods from McpSdkClient (connect, callTool, etc.) are inherited
  // and should work lovingly without modification for standard MCP servers.
} 