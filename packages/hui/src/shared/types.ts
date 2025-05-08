import { z } from 'zod';
// Import ListToolsResultSchema as a value to access its shape
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';

// 织: 定义 HUI 元工具的约定名称
export const HUI_META_TOOL_NAME = 'listHuiDefinitions';

// This accesses the Zod schema for a single tool object within the 'tools' array of ListToolsResultSchema
const SingleToolSchemaForShared = ListToolsResultSchema.shape.tools.element;
// This is the TypeScript type for a single tool, inferred from its Zod schema
export type McpToolInformation = z.infer<typeof SingleToolSchemaForShared>;

// --- HUI Hint Definitions (mirrors what we drafted in ToolList.vue) ---
export interface HuiInputHintOption {
  label: string;
  value: any;
}

export interface HuiInputHint {
  label: string;
  inputType: 'text' | 'textarea' | 'number' | 'checkbox' | 'select' | 'radio' | string; // Allow custom types
  required?: boolean;
  placeholder?: string;
  options?: HuiInputHintOption[];
  defaultValue?: any;
  min?: number;
  max?: number;
  step?: number;
  // Potentially other properties like 'description', 'validationRegex', etc.
}

export interface HuiHints {
  label?: string;            // Primary display label for the tool/action
  description?: string;      // Detailed description of what the tool/action does
  inputHints?: Record<string, HuiInputHint>; // Hints for each input parameter
  outputHints?: {
    // Future: Hints for how to display the output, e.g., as a table, chart, markdown, etc.
    preferredRenderer?: string; 
  };
  category?: string;         // For grouping tools in the UI
  tags?: string[];           // For filtering/searching tools
  icon?: string;             // An icon identifier (e.g., from a known icon set or an SVG string)
  // ... other general rendering hints for the tool itself
}

// --- Placeholder for type needed by server.ts ---
// Define HuiActionDefinition as a generic interface
export interface HuiActionDefinition<TInput = any, TOutput = any> extends McpToolInformation { 
  // Placeholder: Add server-specific fields if needed
  // The types TInput and TOutput might be used for input schema and execute function
  execute?: (input: TInput) => Promise<TOutput>; // Example using generics
  huiHints?: HuiHints;
}
export type HuiRenderingHints = HuiHints; // Assuming it's just an alias for now

// --- Extended Tool Information to include HUI Hints ---
export interface HuiToolInformation extends McpToolInformation {
  huiHints?: HuiHints;
  // We might also want to carry the raw Zod input schema if available from the server
  // This would be useful for clients that want to perform pre-flight validation
  // or generate forms even without HUI hints.
  // inputSchema?: any; // Example: ZodRawShape or a serializable representation
}

// Type for the response from an endpoint like /mcp-hui/getActions
export interface HuiActionsResponse {
  actions: HuiToolInformation[];
} 