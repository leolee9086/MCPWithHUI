<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { HuiMcpClient } from '@mcpwithhui/hui/client'; // Use client export path
import type { HuiToolInformation, Implementation } from '@mcpwithhui/hui/shared'; // Use shared export path
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'; // Import transport
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

// No longer need local interface definitions for HuiHints, etc.

const tools = ref<HuiToolInformation[]>([]);
const error = ref<string | null>(null);
const isLoading = ref<boolean>(true);

// Use a relative path for the MCP endpoint
const MCP_POST_ENDPOINT_URL = 'http://localhost:8080/mcp?apiKey=test-key'; 
const MCP_SSE_ENDPOINT_URL = 'http://localhost:8080/sse?apiKey=test-key'; // 根据服务器SSE配置

let client: HuiMcpClient | null = null;
let transport: StreamableHTTPClientTransport | SSEClientTransport | null = null;

async function fetchTools() {
  isLoading.value = true;
  error.value = null;
  tools.value = []; // Clear previous tools

  // 先尝试关闭之前的连接，无论它们是什么类型
  await client?.close(); 
  // transport 的 close 方法也需要能处理两种类型，或者在赋值时就确保类型正确
  // @ts-ignore 因为 transport 类型是联合类型，直接调用 close 可能TS不认，但运行时应该OK，或者分别处理
  transport?.close(); 

  const clientInfo: Implementation = {
    name: 'HuiAppClient', 
    version: '0.1.0'
  };
  
  // 创建一次 client 实例
  client = new HuiMcpClient(clientInfo);

  try {
    // 尝试 StreamableHTTPClientTransport (POST)
    console.log(`Attempting to connect using StreamableHTTPClientTransport at ${MCP_POST_ENDPOINT_URL}...`);
    transport = new StreamableHTTPClientTransport(MCP_POST_ENDPOINT_URL);
    await client.connect(transport);
    console.log("Connected using StreamableHTTPClientTransport (POST).");

  } catch (httpError: any) {
    console.warn("StreamableHTTPClientTransport (POST) connection failed:", httpError);
    // 根据官方示例，检查是否是4xx错误，或者简单点，只要有错就尝试SSE
    // 这里我们简化，只要第一次失败就尝试SSE

    console.log(`Falling back to SSEClientTransport at ${MCP_SSE_ENDPOINT_URL}...`);
    try {
      // 确保 client 实例仍然是同一个，或者如果需要，重新创建（但官方示例是复用client）
      // 关闭可能在第一次尝试中部分打开的 transport
      // @ts-ignore
      transport?.close();

      transport = new SSEClientTransport(new URL(MCP_SSE_ENDPOINT_URL)); // SSEClientTransport 需要 URL 对象
      await client.connect(transport); // client 实例是复用的
      console.log("Connected using SSEClientTransport.");

    } catch (sseError: any) {
      console.error('SSEClientTransport connection also failed:', sseError);
      let errorMessage = 'An unknown error occurred after trying both POST and SSE.';
      if (sseError instanceof Error) {
        errorMessage = sseError.message;
      } else if (typeof sseError === 'string') {
        errorMessage = sseError;
      }
      // 在错误信息中可以体现尝试了两种方式
      error.value = `Failed to communicate with MCP server. Attempted POST to ${MCP_POST_ENDPOINT_URL} (Error: ${httpError.message || 'Unknown HTTP error'}) and SSE to ${MCP_SSE_ENDPOINT_URL} (Error: ${errorMessage}). Please ensure the server is running and supports MCP.`;
      client = null; 
      transport = null; 
      isLoading.value = false;
      return; // 尝试SSE也失败了，直接返回
    }
  }

  // 如果任一连接成功，继续获取工具
  try {
    console.log('Fetching tools with HUI hints...');
    const huiTools = await client.listToolsWithHui();
    console.log('Received tools:', huiTools);
    tools.value = huiTools;
  } catch (fetchError: any) {
    console.error('Failed to fetch tools after successful connection:', fetchError);
    let errorMessage = 'An unknown error occurred while fetching tools.';
    if (fetchError instanceof Error) {
      errorMessage = fetchError.message;
    } else if (typeof fetchError === 'string') {
      errorMessage = fetchError;
    }
    error.value = `Successfully connected to MCP server, but failed to fetch tools: ${errorMessage}.`;
    // 保持 client 和 transport 的状态，因为连接是成功的
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  fetchTools();
});

onUnmounted(() => {
  // Clean up connection when component is unmounted
  console.log('Closing MCP client connection...');
  client?.close();
  transport?.close();
});
</script>

<template>
  <div class="tool-list-container">
    <h2>Available HUI Tools</h2>
    <button @click="fetchTools" :disabled="isLoading" class="refresh-button">
      {{ isLoading ? 'Loading...' : 'Refresh Tools' }}
    </button>
    <div v-if="isLoading" class="loading-indicator">Loading tools... Connecting to MCP server...</div>
    <div v-if="error" class="error-message">
      <p><strong>Error:</strong> {{ error }}</p>
    </div>
    <div v-if="!isLoading && !error && tools.length === 0" class="no-tools-message">
      No tools found or unable to connect to the server.
    </div>
    <ul v-if="!isLoading && !error && tools.length > 0" class="tools-list">
      <li v-for="tool in tools" :key="tool.name" class="tool-item">
        <div class="tool-header">
          <!-- Display label from hints, fallback to name -->
          <h3>{{ tool.huiHints?.label || tool.name }}</h3> 
          <!-- Display description from hints, fallback to tool's description -->
          <p class="tool-description">{{ tool.huiHints?.description || tool.description || 'No description available.' }}</p>
        </div>
        <!-- Keep the existing input hints rendering logic -->
        <div v-if="tool.huiHints?.inputHints && Object.keys(tool.huiHints.inputHints).length > 0" class="input-hints-section">
          <h4>Input Parameters:</h4>
          <ul class="input-hints-list">
            <li v-for="(hint, paramName) in tool.huiHints.inputHints" :key="paramName" class="input-hint-item">
              <strong class="param-name">{{ hint.label || paramName }}:</strong>
              <ul class="hint-details">
                <li><strong>Type:</strong> <span class="hint-value">{{ hint.inputType }}</span></li>
                <li v-if="hint.required !== undefined"><strong>Required:</strong> <span class="hint-value">{{ hint.required ? 'Yes' : 'No' }}</span></li>
                <li v-if="hint.placeholder"><strong>Placeholder:</strong> <span class="hint-value">"{{ hint.placeholder }}"</span></li>
                <li v-if="hint.defaultValue !== undefined"><strong>Default:</strong> <span class="hint-value">{{ JSON.stringify(hint.defaultValue) }}</span></li>
                <li v-if="hint.options && hint.options.length > 0">
                  <strong>Options:</strong>
                  <ul class="hint-options">
                    <li v-for="option in hint.options" :key="JSON.stringify(option.value)">
                      {{ option.label }} (value: <code>{{ JSON.stringify(option.value) }}</code>)
                    </li>
                  </ul>
                </li>
                 <li v-if="typeof hint.min === 'number'"><strong>Min:</strong> <span class="hint-value">{{ hint.min }}</span></li>
                 <li v-if="typeof hint.max === 'number'"><strong>Max:</strong> <span class="hint-value">{{ hint.max }}</span></li>
                 <li v-if="typeof hint.step === 'number'"><strong>Step:</strong> <span class="hint-value">{{ hint.step }}</span></li>
              </ul>
            </li>
          </ul>
        </div>
        <div v-else class="no-inputs-message">
          <!-- Check if inputSchema exists and has properties before saying no inputs -->
          <p v-if="!tool.inputSchema || !tool.inputSchema.properties || Object.keys(tool.inputSchema.properties).length === 0">This tool does not require any input parameters.</p>
          <p v-else>Input parameters defined (no HUI hints available).</p>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.tool-list-container {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  padding: 25px;
  max-width: 900px;
  margin: 20px auto;
  background-color: #ffffff;
  border-radius: 10px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

h2 {
  text-align: center;
  color: #2c3e50;
  margin-bottom: 25px;
  font-weight: 600;
}

.refresh-button {
  display: block;
  margin: 0 auto 25px auto;
  padding: 12px 25px;
  background-color: #3498db;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1em;
  transition: background-color 0.2s ease-in-out, box-shadow 0.2s ease;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.refresh-button:disabled {
  background-color: #bdc3c7;
  cursor: not-allowed;
  box-shadow: none;
}

.refresh-button:hover:not(:disabled) {
  background-color: #2980b9;
  box-shadow: 0 4px 8px rgba(0,0,0,0.15);
}

.loading-indicator,
.no-tools-message {
  text-align: center;
  color: #7f8c8d;
  margin-top: 35px;
  font-size: 1.1em;
}

.error-message {
  background-color: #fff2f2;
  color: #d63031;
  border: 1px solid #ffcccc;
  padding: 18px;
  border-radius: 6px;
  margin-bottom: 25px;
  line-height: 1.6;
}
.error-message code {
  background-color: #fce4e4;
  padding: 2px 5px;
  border-radius: 3px;
  font-family: monospace;
}

.tools-list {
  list-style: none;
  padding: 0;
}

.tool-item {
  background-color: #f8f9fa;
  border: 1px solid #e9ecef;
  padding: 20px;
  margin-bottom: 15px;
  border-radius: 8px;
  transition: box-shadow 0.2s ease-in-out;
}

.tool-item:hover {
  box-shadow: 0 5px 15px rgba(0,0,0,0.07);
}

.tool-header h3 {
  margin-top: 0;
  margin-bottom: 8px;
  color: #2980b9;
  font-size: 1.4em;
  font-weight: 600;
}

.tool-description {
  margin-bottom: 15px;
  font-size: 1em;
  color: #555;
  line-height: 1.6;
}

.input-hints-section {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px dashed #ced4da;
}

.input-hints-section h4 {
  margin-top: 0;
  margin-bottom: 12px;
  color: #34495e;
  font-size: 1.1em;
  font-weight: 600;
}

.input-hints-list {
  list-style: none;
  padding-left: 0;
}

.input-hint-item {
  margin-bottom: 15px;
}

.param-name {
  display: block;
  margin-bottom: 5px;
  color: #2c3e50;
  font-weight: 600;
}

.hint-details {
  list-style: none;
  padding-left: 15px;
  font-size: 0.95em;
  color: #666;
}

.hint-details li {
  margin-bottom: 3px;
}

.hint-value {
  font-weight: normal;
  font-family: monospace;
  background-color: #ecf0f1;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.9em;
}

.hint-options {
  list-style: disc;
  padding-left: 20px;
  margin-top: 5px;
}

.hint-options li {
  margin-bottom: 2px;
}

.no-inputs-message {
  margin-top: 15px;
  font-style: italic;
  color: #7f8c8d;
}
</style> 