// network.ts - 网络操作相关工具

import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { HuiRenderingHints as ImportedHuiRenderingHints } from 'mcpwithhui-shared';

// 本地HUI渲染提示类型扩展
interface CurrentHuiRenderingHints extends ImportedHuiRenderingHints {
    category?: string;
    tags?: string[];
    keywords?: string[];
    outputDescription?: string;
}

// --- getWebpageContent Tool ---

export const getWebpageContentInputRawShape = {
    url: z.string().url('必须提供有效的URL'),
    timeout: z.number().int().positive().optional().default(15000).describe('请求超时时间（毫秒），默认15秒'),
};

export const getWebpageContentHuiHints: CurrentHuiRenderingHints = {
    label: '获取网页内容',
    description: '根据提供的URL获取网页的HTML原始内容。',
    category: '网络操作',
    tags: ['web', 'fetch', 'http', 'content', 'html'],
    outputDescription: '返回网页的HTML内容、HTTP状态码和可能的错误信息。',
    inputHints: {
        url: { label: '网页URL (必填)', inputType: 'text', required: true, placeholder: 'https://example.com' },
        timeout: { label: '超时时间(ms) (可选)', inputType: 'number', placeholder: '默认 15000' },
    }
};

export async function getWebpageContentHandler(
    args: { url: string; timeout?: number } 
): Promise<{ content: Array<{ type: 'text'; text: string } | { type: 'resource'; resource: { blob: string; uri: string; mimeType: string; text?: string } }> }> {
    const { url, timeout = 15000 } = args; 

    console.log(`[HUI Tool:getWebpageContent] 准备获取URL: ${url}，超时: ${timeout}ms`);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
            }
        });
        clearTimeout(timeoutId);

        const responseText = await response.text();
        const status = response.status;

        console.log(`[HUI Tool:getWebpageContent] URL: ${url}, 状态码: ${status}, 内容长度: ${responseText.length}`);

        const summaryTextResult = {
            url: url,
            status: status,
            contentLength: responseText.length,
            error: response.ok ? undefined : `请求失败，状态码: ${status}`,
            htmlPreview: responseText.substring(0, 200) + (responseText.length > 200 ? '... (内容已截断)' : '')
        };

        if (!response.ok) {
            return {
                content: [
                    { type: 'text', text: `获取 ${url} 内容失败，状态码: ${status}。预览及详情见Resource。` },
                    { type: 'resource', resource: { uri: "", blob: JSON.stringify(summaryTextResult, null, 2), mimeType: 'application/json', text: '错误详情' } }
                ]
            };
        }
        
        return {
            content: [
                { type: 'text', text: `成功获取 ${url} 的内容 (状态码: ${status}, 长度: ${responseText.length} 字符)。完整HTML内容见Resource。` },
                { type: 'resource', resource: { uri: "", blob: responseText, mimeType: 'text/html', text: `${url} 的HTML内容` } },
                { type: 'resource', resource: { uri: "", blob: JSON.stringify(summaryTextResult, null, 2), mimeType: 'application/json', text: '响应摘要' } }
            ]
        };

    } catch (error: any) {
        console.error(`[HUI Tool:getWebpageContent] 获取URL ${url} 时发生错误:`, error);
        const errorMessage = error.name === 'AbortError' ? '请求超时' : (error.message || '未知网络错误');
        const errorDetails = {
            url: url,
            status: 0, 
            error: errorMessage,
            htmlContent: null
        };
        return {
            content: [
                { type: 'text', text: `获取 ${url} 内容时出错: ${errorMessage}。详情见Resource。` },
                { type: 'resource', resource: { uri: "", blob: JSON.stringify(errorDetails, null, 2), mimeType: 'application/json', text: '错误详情' } }
            ]
        };
    }
} 