// Core MCP SDK imports
import { McpServer, RegisteredTool, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError, JSONRPCRequestSchema, isInitializeRequest, ListToolsResultSchema, CallToolRequest, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { ServerOptions } from '@modelcontextprotocol/sdk/server/index.js';

// Remove Other dependencies (express, cors, etc.)
import { z, ZodError, ZodRawShape } from 'zod';

// Import from local shared file with extension
import { HuiActionDefinition, HuiInputHint, HuiRenderingHints, HUI_META_TOOL_NAME } from './shared/types.js';

// --- HuiMcpServer Class Definition ---
// This is the main export of this package
export class HuiMcpServer extends McpServer {
    private huiDefinitionsStore: Map<string, HuiActionDefinition<any, any>> = new Map();

    constructor(serverInfo: { name: string; version: string }, options?: ServerOptions) {
        super(serverInfo, options);
        this.registerMetaTool();
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
} 