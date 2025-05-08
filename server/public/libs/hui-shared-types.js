// Import ListToolsResultSchema as a value to access its shape
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
// 织: 定义 HUI 元工具的约定名称
export const HUI_META_TOOL_NAME = 'listHuiDefinitions';
// This accesses the Zod schema for a single tool object within the 'tools' array of ListToolsResultSchema
const SingleToolSchemaForShared = ListToolsResultSchema.shape.tools.element;
