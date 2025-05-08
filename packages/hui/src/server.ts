// Core MCP SDK imports
import { McpServer, RegisteredTool, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { ServerOptions } from '@modelcontextprotocol/sdk/server/index.js';

// Remove Other dependencies (express, cors, etc.)
import { z, ZodError, ZodRawShape } from 'zod';

// Shared types (including our HUI extensions)
import { HuiActionDefinition, HuiInputHint, HuiRenderingHints } from 'mcpwithhui-shared';

// --- HuiMcpServer Class Definition ---
// This is the main export of this package
export class HuiMcpServer extends McpServer {
    private huiDefinitionsStore: Map<string, HuiActionDefinition<any, any>> = new Map();

    constructor(serverInfo: { name: string; version: string }, options?: ServerOptions) {
        super(serverInfo, options);
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
        const huiDefinition: HuiActionDefinition<typeof inputSchemaObject, any> = {
            name,
            description,
            inputSchema: inputSchemaObject,
            huiHints,
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
} 