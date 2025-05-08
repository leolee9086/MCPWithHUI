// MCPWithHUI Shared Types

// Example: Define how HUI hints might look on a Resource or Tool
export interface HuiRenderingHints {
  label?: string; // Button text or field label
  tooltip?: string;
  icon?: string; // Icon identifier or URL
  componentType?: 'button' | 'link' | 'form' | 'list' | 'text_display'; // Suggests UI element
  isPrimary?: boolean;
  // Add more fields as needed for UI generation...
}

// Extend the base MCP types (assuming they are available/imported)
// Example - augment the Tool definition from MCP SDK if possible
// declare module '@modelcontextprotocol/sdk' {
//   interface McpTool {
//     huiHints?: HuiRenderingHints;
//   }
//   interface McpResource {
//      huiHints?: HuiRenderingHints;
//   }
// }

// Placeholder for shared types...
export interface ExampleSharedType {
  id: string;
  data: any;
}

// Using @mcp/server directly might cause issues if shared doesn't depend on it.
// Re-declaring core MCP types might be necessary, or make shared depend on @mcp/server.
// For now, let's assume shared can access the types or we redefine minimally.
// We need at least a placeholder for ActionDefinition to extend.
import { z } from 'zod';

// Placeholder for the base ActionDefinition if @mcp/server is not a direct dependency
// Ideally, shared should depend on @mcp/server or use type imports if possible
interface BaseActionDefinition<InputSchema extends z.ZodTypeAny = z.ZodTypeAny, OutputSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema?: InputSchema;
  outputSchema?: OutputSchema;
  // Add other core MCP fields if needed for HUI logic
}

// --- HUI Specific Types ---

/**
 * Defines hints for rendering a specific input field within an action's form.
 */
export interface HuiInputHint {
  label?: string;          // Label for the input field (defaults to input key)
  description?: string;    // Tooltip or help text for the field
  inputType?: 'text' | 'textarea' | 'number' | 'password' | 'checkbox' | 'radio' | 'select' | 'file' | 'date' | 'datetime-local' | 'hidden'; // Type of input control
  options?: Array<{ label: string; value: string | number | boolean }>; // Options for select, radio
  placeholder?: string;    // Placeholder text for text-based inputs
  defaultValue?: any;      // Default value for the field
  required?: boolean;      // Whether the field is required
  // Add more hints: validation rules (min, max, pattern), visibility conditions, etc.
}

/**
 * Defines hints for rendering the overall action, including its inputs.
 */
export interface HuiRenderingHints {
  label?: string;          // Label for the action itself (e.g., button text)
  description?: string;    // Tooltip or help text for the action
  // Optional: Grouping/Categorization hints for organizing actions in the UI
  group?: string;          // For UI grouping, e.g., "File Operations", "Siyuan Utilities"
  category?: string;       // For AI to understand a tool's primary domain, e.g., "Siyuan笔记操作", "文件系统"
  tags?: string[];         // For AI and potentially UI filtering, e.g., ["siyuan", "read", "block"]
  keywords?: string[];     // For AI semantic matching, e.g., ["SiYuanNote", "fetchBlock", "getBlockDetail"]
  outputDescription?: string; // A natural language description of what the tool outputs, for AI understanding.
  icon?: string;           // Icon identifier (e.g., Material Icons name)
  // Map of input field names (keys of inputSchema) to their specific rendering hints
  inputHints?: Record<string, HuiInputHint>;
}

/**
 * Extends the standard MCP ActionDefinition with optional HUI rendering hints.
 * This is the definition the server should provide via getActions.
 */
export interface HuiActionDefinition<InputSchema extends z.ZodTypeAny = z.ZodTypeAny, OutputSchema extends z.ZodTypeAny = z.ZodTypeAny> extends BaseActionDefinition<InputSchema, OutputSchema> {
  huiHints?: HuiRenderingHints;
}

// --- Standard MCP Types (Might need if not importing from @mcp/server) ---

/**
 * Represents the result of an action invocation.
 */
export type ActionResult<Output> = 
  | { ok: true; output: Output }
  | { ok: false; error: string };

/**
 * Type definition for an action handler function.
 */
export type ActionHandler<Input, Output> = (input: Input) => Promise<Output>; 