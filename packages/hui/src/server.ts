// Core MCP SDK imports
import { McpServer, RegisteredTool, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError, JSONRPCRequestSchema, isInitializeRequest, ListToolsResultSchema, CallToolRequest, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { ServerOptions } from '@modelcontextprotocol/sdk/server/index.js';

// Remove Other dependencies (express, cors, etc.)
import { z, ZodError, ZodRawShape, ZodObject } from 'zod';
import zodToJsonSchemaLib from 'zod-to-json-schema';

// Import from local shared file with extension
import { HuiActionDefinition, HuiInputHint, HuiRenderingHints, HUI_META_TOOL_NAME } from './shared/types.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

// --- HuiMcpServer Class Definition ---
// This is the main export of this package
export class HuiMcpServer extends McpServer {
    private huiDefinitionsStore: Map<string, HuiActionDefinition<any, any>> = new Map();
    private zodSchemaStore: Map<string, ZodObject<any, any, any>> = new Map();

    constructor(serverInfo: { name: string; version: string }, options?: ServerOptions) {
        super(serverInfo, options);
        this.registerMetaTool();
        this.registerGetToolTypeDefinitionMetaTool();
    }
    connect(transport: Transport): Promise<void> {
        return super.connect(transport);
    }
    // Custom method to register a tool along with its HUI definition
    huiTool<InputSchema extends ZodRawShape, OutputResult>(
        name: string,
        description: string,
        inputShape: InputSchema,
        huiHints: HuiRenderingHints,
        handler: ToolCallback<InputSchema>
    ): RegisteredTool {
        const inputSchemaObject = z.object(inputShape);
        this.zodSchemaStore.set(name, inputSchemaObject);
        
        // Convert ZodRawShape (inputShape) to a basic JSON Schema object for SDK compatibility
        // This assumes simple object properties for now. A proper conversion might need zod-to-json-schema.
        const jsonSchemaProperties: Record<string, any> = {};
        for (const key in inputShape) {
            // Very basic mapping - needs refinement for actual types, descriptions etc.
            // This placeholder just creates an empty object for each property.
            jsonSchemaProperties[key] = {}; 
        }
        const sdkCompatibleInputSchema = {
            type: "object" as const, // Required by SDK's ToolDefinition
            properties: jsonSchemaProperties,
        };

        const huiDefinition: HuiActionDefinition<typeof inputSchemaObject, any> = {
            name,
            description,
            inputSchema: sdkCompatibleInputSchema, // Use the converted JSON Schema
            huiHints,
            // We might need to store the original Zod schema here if needed elsewhere
            // originalZodSchema: inputSchemaObject 
        };
        this.huiDefinitionsStore.set(name, huiDefinition);
        console.log(`Registering HUI tool: ${name}`);

        // Wrap the original handler to ensure extra.server is this HuiMcpServer instance
        const huiEnhancedCallback = async (args: z.infer<typeof inputSchemaObject>, extraProvidedBySdk: any) => {
            const modifiedExtra = {
                ...extraProvidedBySdk, // Preserve other context properties from SDK
                server: this // Override server to be the current HuiMcpServer instance
            };
            return handler(args, modifiedExtra);
        };

        // Call super.tool with the wrapped handler
        // We might need a type assertion for huiEnhancedCallback if TypeScript complains
        return super.tool(name, inputShape, huiEnhancedCallback as ToolCallback<InputSchema>);
    }

    // Method to get all registered HUI tool definitions
    listHuiTools(): HuiActionDefinition<any, any>[] {
        return Array.from(this.huiDefinitionsStore.values());
    }

    private registerMetaTool(): void {
        const metaToolName = HUI_META_TOOL_NAME;
        const metaToolInputShape = {};
        const metaToolHuiHints: HuiRenderingHints = {
            label: '获取HUI定义 (元工具)',
            description: '获取服务器上所有已注册工具的HUI（Human-User Interface）渲染提示信息。',
            category: '元工具',
            tags: ['meta', 'hui', 'discovery']
        };

        const metaToolHandler = async (args: {}, extra: any): Promise<z.infer<typeof CallToolResultSchema>> => {
            if (!extra || !extra.server || !(extra.server instanceof HuiMcpServer)) {
                console.error(`[${metaToolName} Handler] Incorrect server instance in context.`);
                throw new McpError(ErrorCode.InternalError, "Server context error in meta tool");
            }
            const self = extra.server as HuiMcpServer; 
            const definitions = self.listHuiTools();
            const output = {
                tools: definitions.map(def => ({
                    name: def.name,
                    huiHints: def.huiHints || {}
                }))
            };
            console.log(`[${metaToolName} Handler] Returning HUI hints for ${definitions.length} tools, as stringified text in CallToolResultSchema structure.`);
            
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(output)
                    }
                ]
            };
        };

        try {
            console.log(`[HuiMcpServer] Auto-registering meta-tool: ${metaToolName}`);
            this.huiTool(
                metaToolName,
                metaToolHuiHints.description || 'Fetches HUI definitions for all tools.',
                metaToolInputShape,
                metaToolHuiHints,
                metaToolHandler
            );
        } catch (error) {
            console.error(`[HuiMcpServer] Failed to auto-register meta-tool ${metaToolName}:`, error);
        }
    }

    private registerGetToolTypeDefinitionMetaTool(): void {
        const metaToolName = 'getToolTypeDefinition';

        const GetToolTypeDefinitionParamsSchema = z.object({
            toolName: z.string().min(1, "Tool name cannot be empty"),
            format: z.enum(['json-schema', 'typescript-declaration', 'zod-definition-string'])
                      .default('json-schema')
                      .describe("The desired format for the type definition."),
        });
        type GetToolTypeDefinitionParams = z.infer<typeof GetToolTypeDefinitionParamsSchema>;

        const getToolTypeDefinitionHuiHints: HuiRenderingHints = {
            label: '获取工具类型定义 (元工具)',
            description: '获取指定工具输入参数的详细类型定义，支持多种格式。',
            category: '元工具',
            tags: ['meta', 'type', 'schema', 'developer'],
            inputHints: {
                toolName: { label: '工具名称', inputType: 'text', description: '需要获取类型定义的工具的名称。' },
                format: {
                    label: '定义格式',
                    inputType: 'dropdown',
                    options: [
                        { label: 'JSON Schema', value: 'json-schema' },
                        { label: 'TypeScript 声明 (实验性)', value: 'typescript-declaration' },
                        { label: 'Zod 定义字符串 (实验性)', value: 'zod-definition-string' },
                    ],
                    defaultValue: 'json-schema',
                    description: '期望返回的类型定义格式。'
                }
            }
        };

        const handler = async (params: GetToolTypeDefinitionParams, extra: any): Promise<z.infer<typeof CallToolResultSchema>> => {
            if (!extra || !extra.server || !(extra.server instanceof HuiMcpServer)) {
                console.error(`[${metaToolName} Handler] Incorrect server instance in context.`);
                throw new McpError(ErrorCode.InternalError, "Server context error in meta tool");
            }
            const self = extra.server as HuiMcpServer;
            const targetZodSchema = self.zodSchemaStore.get(params.toolName);

            if (!targetZodSchema) {
                throw new McpError(ErrorCode.InvalidParams, `Tool with name '${params.toolName}' not found or has no registered Zod schema.`);
            }

            let definitionResult: any;
            switch (params.format) {
                case 'json-schema':
                    try {
                        const schemaConverter: any = (zodToJsonSchemaLib as any).default || zodToJsonSchemaLib;
                        const jsonSchema = schemaConverter(targetZodSchema, { $refStrategy: 'none' }); 
                        definitionResult = { toolName: params.toolName, format: params.format, definition: jsonSchema };
                    } catch (e: any) {
                        console.error(`[${metaToolName} Handler] Error converting Zod schema to JSON Schema for tool '${params.toolName}':`, e);
                        throw new McpError(ErrorCode.InternalError, `Failed to generate JSON Schema: ${e.message}`);
                    }
                    break;
                case 'typescript-declaration':
                case 'zod-definition-string':
                    definitionResult = { toolName: params.toolName, format: params.format, definition: `Format '${params.format}' is not yet supported.` };
                    break;
                default:
                    throw new McpError(ErrorCode.InvalidParams, `Unsupported format: ${params.format}`);
            }
            
            console.log(`[${metaToolName} Handler] Returning type definition for '${params.toolName}' in format '${params.format}'.`);
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(definitionResult) 
                    }
                ]
            };
        };

        try {
            console.log(`[HuiMcpServer] Auto-registering meta-tool: ${metaToolName}`);
            this.huiTool(
                metaToolName,
                getToolTypeDefinitionHuiHints.description || 'Fetches tool type definitions.',
                GetToolTypeDefinitionParamsSchema.shape, // Pass the ZodRawShape
                getToolTypeDefinitionHuiHints,
                handler as ToolCallback<typeof GetToolTypeDefinitionParamsSchema.shape>
            );
        } catch (error) {
            console.error(`[HuiMcpServer] Failed to auto-register meta-tool ${metaToolName}:`, error);
        }
    }
} 