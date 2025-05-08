<script setup lang="ts">
import { ref, onMounted } from 'vue';

interface HuiInputHintOption {
  label: string;
  value: any;
}

interface HuiInputHint {
  label: string;
  inputType: 'text' | 'textarea' | 'number' | 'checkbox' | 'select' | 'radio' | string; // string for future types
  required?: boolean;
  placeholder?: string;
  options?: HuiInputHintOption[];
  defaultValue?: any;
  min?: number;
  max?: number;
  step?: number;
  // ... other potential hint properties
}

interface HuiHints {
  label?: string;
  description?: string;
  inputHints?: Record<string, HuiInputHint>;
  // ... other rendering hints
}

interface HuiToolAction {
  name: string;
  description?: string; // Top-level description, might be superseded by huiHints.description
  huiHints?: HuiHints;
  inputSchema?: any; // Added to match backend response, type as any for now
  // rawShape?: any; // Could be useful later for validation or more detailed info
}

const tools = ref<HuiToolAction[]>([]);
const error = ref<string | null>(null);
const isLoading = ref<boolean>(true);

// 织: 默认服务器地址，后续可以考虑从配置或环境变量读取
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:8080';

async function fetchTools() {
  isLoading.value = true;
  error.value = null;
  try {
    const response = await fetch(`${SERVER_URL}/mcp-hui/getActions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test-key', // 织: 应当替换为更安全的认证方式或配置
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Server error: ${response.status} ${errorData.message || response.statusText}`);
    }

    const data = await response.json();
    if (data && data.actions && Array.isArray(data.actions)) {
      tools.value = data.actions;
    } else {
      throw new Error('Invalid response format from server');
    }
  } catch (err: any) {
    console.error('Failed to fetch tools:', err);
    error.value = err.message || 'An unknown error occurred while fetching tools.';
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  fetchTools();
});
</script>

<template>
  <div class="tool-list-container">
    <h2>Available HUI Tools</h2>
    <button @click="fetchTools" :disabled="isLoading" class="refresh-button">
      {{ isLoading ? 'Loading...' : 'Refresh Tools' }}
    </button>
    <div v-if="isLoading" class="loading-indicator">Loading tools... Please ensure the server is running.</div>
    <div v-if="error" class="error-message">
      <p><strong>Error fetching tools:</strong> {{ error }}</p>
      <p>Please check if the server at <code>{{ SERVER_URL }}</code> is running and reachable, and if the API key is correct.</p>
    </div>
    <div v-if="!isLoading && !error && tools.length === 0" class="no-tools-message">
      No tools found. The server might not have any tools registered or an issue occurred.
    </div>
    <ul v-if="!isLoading && !error && tools.length > 0" class="tools-list">
      <li v-for="tool in tools" :key="tool.name" class="tool-item">
        <div class="tool-header">
          <h3>{{ tool.huiHints?.label || tool.name }}</h3>
          <p class="tool-description">{{ tool.huiHints?.description || tool.description || 'No description available.' }}</p>
        </div>
        <div v-if="tool.huiHints?.inputHints && Object.keys(tool.huiHints.inputHints).length > 0" class="input-hints-section">
          <h4>Input Parameters:</h4>
          <ul class="input-hints-list">
            <li v-for="(hint, paramName) in tool.huiHints.inputHints" :key="paramName" class="input-hint-item">
              <strong class="param-name">{{ hint.label || paramName }}:</strong>
              <ul class="hint-details">
                <li><strong>Type:</strong> <span class="hint-value">{{ hint.inputType }}</span></li>
                <li v-if="hint.required !== undefined"><strong>Required:</strong> <span class="hint-value">{{ hint.required ? 'Yes' : 'No' }}</span></li>
                <li v-if="hint.placeholder"><strong>Placeholder:</strong> <span class="hint-value">"{{ hint.placeholder }}"</span></li>
                <li v-if="hint.defaultValue"><strong>Default:</strong> <span class="hint-value">{{ JSON.stringify(hint.defaultValue) }}</span></li>
                <li v-if="hint.options && hint.options.length > 0">
                  <strong>Options:</strong>
                  <ul class="hint-options">
                    <li v-for="option in hint.options" :key="option.value">
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
          <p>This tool does not require any input parameters.</p>
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
  padding-left: 0; /* Changed from 20px to 0 */
}

.input-hint-item {
  background-color: #ffffff;
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 5px;
  margin-bottom: 10px;
}

.param-name {
  color: #2c3e50;
  font-weight: bold;
  display: block;
  margin-bottom: 8px;
}

.hint-details {
  list-style: none;
  padding-left: 15px; /* Indent details */
  font-size: 0.9em;
  color: #495057;
}

.hint-details li {
  margin-bottom: 5px;
}

.hint-value {
  font-weight: normal;
  color: #1abc9c; /* A nice color for values */
}

.hint-value code, code {
  background-color: #ecf0f1;
  padding: 2px 4px;
  border-radius: 3px;
  font-family: 'Courier New', Courier, monospace;
  color: #e74c3c;
}

.hint-options {
  list-style: disc;
  padding-left: 20px;
  margin-top: 5px;
}

.no-inputs-message p {
  color: #7f8c8d;
  font-style: italic;
  margin-top: 10px;
}
</style> 