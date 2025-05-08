import { z } from 'zod';
import {
    HuiRenderingHints as ImportedHuiRenderingHints, 
    HuiActionDefinition as ImportedHuiActionDefinition, 
    HuiInputHint
} from '@mcpwithhui/hui/shared'; 
import { HuiMcpServer } from '@mcpwithhui/hui/server'; 
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'; 

// Define current HUI types that include new fields, extending imported ones
interface CurrentHuiRenderingHints extends ImportedHuiRenderingHints {
    category?: string;
    tags?: string[];
    keywords?: string[];
    outputDescription?: string;
    // Ensure all other fields from ImportedHuiRenderingHints are implicitly included
    // No need to redefine: label?, description?, group?, icon?, inputHints?
}

// Extend BaseActionDefinition if it's available or redefine necessary parts for CurrentHuiActionDefinition
// Assuming BaseActionDefinition is part of ImportedHuiActionDefinition structure
interface CurrentHuiActionDefinition<InputSchema extends z.ZodTypeAny = z.ZodTypeAny, OutputSchema extends z.ZodTypeAny = z.ZodTypeAny> extends ImportedHuiActionDefinition<InputSchema, OutputSchema> {
    huiHints?: CurrentHuiRenderingHints; // Override huiHints with the current version
    // Ensure all other fields from ImportedHuiActionDefinition are implicitly included
}


// --- findSuitableTools Meta-Tool ---

export const findSuitableToolsInputRawShape = {
    taskDescription: z.string().min(1, "任务描述不能为空。").describe("用自然语言详细描述希望完成的任务或需要的功能。这是最主要的匹配依据。"),
    desiredCategory: z.string().optional().describe("期望工具所属的类别 (例如：Siyuan笔记操作, 文件系统, 代码辅助)。如果提供，将优先在该类别下查找。"),
    requiredTags: z.array(z.string()).optional().describe("工具必须拥有的标签列表。如果提供多个，则工具需同时拥有所有这些标签。"),
    preferredTags: z.array(z.string()).optional().describe("偏好的标签列表。拥有这些标签的工具将被认为更相关（用于提升排序得分）。"),
    requiredInputParams: z.array(z.string()).optional().describe("工具必须接受的参数名称列表。"),
    preferredInputParams: z.array(z.string()).optional().describe("偏好的工具输入参数名称列表（用于提升排序得分）。"),
    desiredOutputKeyword: z.string().optional().describe("描述期望工具输出的内容或格式的关键词 (例如：markdown, file_path, id_list, json_object)。用于匹配工具的输出描述。"),
    resultLimit: z.number().int().positive().optional().default(5).describe("返回最相关工具的最大数量，默认为5，建议不超过10。")
};

export const findSuitableToolsInputSchema = z.object(findSuitableToolsInputRawShape);

export const findSuitableToolsHuiHints: CurrentHuiRenderingHints = { // Use CurrentHuiRenderingHints
    label: "查找适用工具 (元工具)",
    description: "根据任务描述、类别、标签、参数或期望输出，智能查找最适合的可用工具。",
    category: "元工具", 
    tags: ["工具发现", "智能路由", "AI辅助", "元编程"],
    keywords: ["find tool", "search tool", "discover function", "intelligent routing", "查找工具", "搜索工具", "发现函数", "智能路由"], 
    outputDescription: "返回一个包含已排序的推荐工具列表的对象，每个工具包含其名称、描述、参数摘要等详细信息。",
    inputHints: {
        taskDescription: { label: "任务描述", inputType: "textarea", placeholder: "例如：我需要读取一个JSON文件并将其内容写入思源日记...", required: true },
        desiredCategory: { label: "期望类别 (可选)", inputType: "text", placeholder: "例如：Siyuan笔记操作", required: false },
        requiredTags: { label: "必需标签 (可选, 多个用英文逗号分隔)", inputType: "text", placeholder: "例如：siyuan,写入", required: false },
        preferredTags: { label: "偏好标签 (可选, 多个用英文逗号分隔)", inputType: "text", placeholder: "例如：markdown,异步", required: false },
        requiredInputParams: { label: "必需参数名 (可选, 多个用英文逗号分隔)", inputType: "text", placeholder: "例如：filePath,content", required: false },
        preferredInputParams: { label: "偏好参数名 (可选, 多个用英文逗号分隔)", inputType: "text", placeholder: "例如：noteId", required: false },
        desiredOutputKeyword: { label: "期望输出关键词 (可选)", inputType: "text", placeholder: "例如：json_string, boolean_flag", required: false },
        resultLimit: { label: "结果数量上限 (可选)", inputType: "number", placeholder: "默认5", required: false }
    }
};

// Define the expected output structure based on our design document
interface FoundToolInfo {
    toolName: string;
    relevanceScore: number;
    category?: string;
    tags?: string[];
    huiLabel: string;
    huiDescription: string;
    toolEngineDescription: string; 
    outputDescription?: string;
    inputParamsSummary: Array<{
        name: string;
        huiLabel: string;
        typeAndRuleDescription: string; 
        semanticDescription: string;    
        isOptional: boolean;           
        defaultValue?: any;            
    }>;
    potentialIssuesOrNotes?: string[];
}

interface FindSuitableToolsOutput {
    foundTools: FoundToolInfo[];
    querySummary: {
        taskDescriptionUsed: string;
        filtersApplied: string[];
    };
    message?: string;
}

// Define a type for the handler's output structure
interface FindToolsHandlerOutput {
    content: Array<({ type: 'text'; text: string } & Record<string, unknown>)>;
    [key: string]: any; // Index signature for compatibility
}

// Helper function to process string or string array inputs
const processArrayArg = (input?: string | string[]): string[] | undefined => {
    if (Array.isArray(input)) {
        return input.map(s => String(s).trim().toLowerCase()).filter(s => s);
    }
    if (typeof input === 'string') {
        return input.split(',').map(s => s.trim().toLowerCase()).filter(s => s);
    }
    return undefined;
};

export async function findSuitableToolsHandler(
    args: z.infer<typeof findSuitableToolsInputSchema>,
    extra: any
): Promise<FindToolsHandlerOutput> {
    console.log("[findSuitableToolsHandler] Received args:", args);

    if (!extra || !extra.server || !(extra.server instanceof HuiMcpServer)) {
        console.error("[findSuitableToolsHandler] HuiMcpServer instance not found or not of correct type in extra.server context.");
        throw new McpError(ErrorCode.InternalError, "HuiMcpServer instance not available to findSuitableToolsHandler.");
    }
    const huiMcpServer = extra.server as HuiMcpServer;

    const allToolDefinitions: ImportedHuiActionDefinition<any,any>[] = huiMcpServer.listHuiTools(); // Type from import
    console.log(`[findSuitableToolsHandler] Found ${allToolDefinitions.length} registered tools.`);

    // --- 1. Preprocess query inputs ---
    const taskDescription = args.taskDescription.toLowerCase();
    // const parseStringArray = (input?: string): string[] | undefined => // Original function, now replaced by processArrayArg for relevant fields
    //     input ? input.split(',').map(s => s.trim().toLowerCase()).filter(s => s) : undefined;

    const desiredCategory = args.desiredCategory?.toLowerCase();
    const requiredTags = processArrayArg(args.requiredTags);
    const preferredTags = processArrayArg(args.preferredTags);
    const requiredInputParams = processArrayArg(args.requiredInputParams);
    const preferredInputParams = processArrayArg(args.preferredInputParams);
    const desiredOutputKeyword = args.desiredOutputKeyword?.toLowerCase();
    const resultLimit = args.resultLimit || 5;

    const filtersApplied: string[] = [];
    if(desiredCategory) filtersApplied.push(`Category: ${args.desiredCategory}`);
    if(requiredTags?.length) filtersApplied.push(`Required Tags: ${args.requiredTags}`);
    // ... add other filters to summary

    // --- Placeholder for filtering and scoring logic ---
    const dummyFoundTools: FoundToolInfo[] = allToolDefinitions.slice(0, resultLimit).map(def => {
        const currentDef = def as CurrentHuiActionDefinition<any, any>; // Cast to current definition
        return {
            toolName: currentDef.name,
            relevanceScore: Math.random(), 
            category: currentDef.huiHints?.category || 'Uncategorized',
            tags: currentDef.huiHints?.tags || [],
            huiLabel: currentDef.huiHints?.label || currentDef.name,
            huiDescription: currentDef.huiHints?.description || currentDef.description || '无HUI描述信息',
            toolEngineDescription: currentDef.description || '无基础描述信息',
            outputDescription: currentDef.huiHints?.outputDescription || 'N/A',
            inputParamsSummary: currentDef.inputSchema?.shape ? Object.entries(currentDef.inputSchema.shape).map(([key, val]: [string, any]) => ({
                name: key,
                huiLabel: currentDef.huiHints?.inputHints?.[key]?.label || key,
                typeAndRuleDescription: `${val.constructor.name} ${val._def?.typeName || ''}`.trim(), 
                semanticDescription: val._def?.description || 'N/A',
                isOptional: val.isOptional(),
                defaultValue: val._def?.defaultValue?.() 
            })) : [],
            potentialIssuesOrNotes: []
        };
    });

    const output: FindSuitableToolsOutput = {
        foundTools: dummyFoundTools.sort((a,b) => b.relevanceScore - a.relevanceScore),
        querySummary: {
            taskDescriptionUsed: args.taskDescription,
            filtersApplied
        },
        message: `Dummy search complete. Found ${dummyFoundTools.length} tools.`
    };

    return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }]
        // No [key: string]: any here, it's part of the interface, not the instance literal
    };
} 