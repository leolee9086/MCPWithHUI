# 这个区段由开发者编写,未经允许禁止AI修改

## 2024-07-26: 更新 Zod 版本

- **修改内容**: 将 `package.json` 中的 `zod` 依赖从 `^3.0.0` 更新为 `3.24.1`。
- **原因**: 为了解决潜在的与 `@modelcontextprotocol/sdk` (v1.11.0) 的兼容性问题，该问题可能由 `instanceof ZodType` 检查因 Zod 版本不一致而失败导致。
- **参考**: [GitHub Issue modelcontextprotocol/typescript-sdk#451](https://github.com/modelcontextprotocol/typescript-sdk/issues/451) 