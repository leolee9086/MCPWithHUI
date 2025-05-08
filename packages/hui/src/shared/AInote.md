# 这个区段由开发者编写,未经允许禁止AI修改

## 修改记录

### 2025-05-08 织

**主要类型修复：**

1.  **`McpToolInformation` 类型定义修正**：
    *   导入了 `zod`。
    *   从 `@modelcontextprotocol/sdk/types.js` 导入了 `ListToolsResultSchema` (作为运行时值)。
    *   通过 `ListToolsResultSchema.shape.tools.element` 提取了 SDK 中单个工具的 Zod Schema。
    *   使用 `z.infer` 从该 Schema 推断出 `McpToolInformation` TypeScript 类型。这确保了 `McpToolInformation` 拥有 SDK 定义的工具应有的所有属性（包括 `name`），解决了之前 `HuiToolInformation extends McpToolInformation` 时 `name` 属性缺失的问题。 