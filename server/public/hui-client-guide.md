# HUI-Enhanced MCP Service: Client Usage Guide

## 1. Introduction

Welcome! This service implements the Model Context Protocol (MCP) enhanced with Human-User Interface (HUI) Hints. HUI Hints provide extra metadata that allows clients (like AI agents or front-end applications) to generate more user-friendly and context-aware interfaces for interacting with the available tools.

## 2. Core Library

Interaction with this service is primarily managed through the `@mcpwithhui/hui` library.

*   **Package Name**: `@mcpwithhui/hui`
*   **Key Exports**:
    *   Client Core: `HuiMcpClient` (Import from `@mcpwithhui/hui/client`)
    *   Shared Types: `HuiToolInformation`, `HuiHints`, `HuiInputHint` (Import from `@mcpwithhui/hui/shared`)
    *   Vue Composable (Recommended for Vue apps): `useToolHuiRenderer` (Import from `@mcpwithhui/hui/vue` - *Note: Requires the package to provide this specific export*)

## 3. Programmatic Client Initialization (For Separate Clients)

If you are building your own client application (e.g., a different frontend, a Node.js script, an AI agent) that needs to interact with this MCP service programmatically, you should install the `@mcpwithhui/hui` package as a dependency and initialize the `HuiMcpClient` as follows:

```typescript
// Ensure '@mcpwithhui/hui' is installed in your project
import { HuiMcpClient } from '@mcpwithhui/hui/client';

// Server info might be discovered or configured
const serverInfo = { name: 'ExampleHuiServer', version: '0.1.0' }; 
// The MCP endpoint for this server instance
const serverEndpoint = 'http://localhost:3000/mcp'; 

const mcpClient = new HuiMcpClient(serverInfo, {
    transport: { type: 'http', url: serverEndpoint }
    // Other McpClient options...
});

// Now you can use mcpClient.listToolsWithHui(), mcpClient.callTool(), etc.

// For transports like WebSocket, you might need to connect explicitly:
// await mcpClient.connect(); 
```

## 4. Fetching Tools with HUI Hints

Use the `listToolsWithHui()` method to get a list of available tools, enriched with their HUI Hints:

```typescript
import type { HuiToolInformation } from '@mcpwithhui/hui/shared';

async function fetchTools() {
  try {
    // Make sure mcpClient is the initialized HuiMcpClient instance
    const tools: HuiToolInformation[] = await mcpClient.listToolsWithHui();
    console.log("Received tools with HUI hints:", tools);

    /*
    Each element in the 'tools' array will look like:
    {
      name: string;            // Tool's programmatic name
      description: string;     // Tool's description
      inputSchema: object;     // JSON Schema-like object for input parameters
      huiHints?: {
        label?: string;        // Display-friendly tool label
        description?: string;  // Longer description for UI
        category?: string;
        tags?: string[];
        icon?: string;
        inputHints?: {         // Hints for each input parameter
          [paramName: string]: {
            label?: string;
            inputType?: 'text' | 'textarea' | 'number' | 'checkbox' | 'select' | 'radio' | string;
            description?: string;
            required?: boolean;
            placeholder?: string;
            options?: Array<{ label: string; value: any }>;
            defaultValue?: any;
            min?: number;
            max?: number;
            step?: number;
            rows?: number;
          }
        };
        outputHints?: { ... }; // Future use
        // ... other hints
      };
    }
    */

    // Use this 'tools' array to render a list or selection UI.

  } catch (error) {
    console.error("Error fetching tools:", error);
  }
}

// Call this function when your client needs the tool list.
// fetchTools();
```

The `huiHints` field is crucial for building a dynamic and user-friendly interface.

## 5. Dynamic UI Rendering with HUI Hints

Here are suggested ways to use the fetched `HuiToolInformation` to render the tool's input form:

### Option A: Using the Vue Composable (Recommended for Vue)

If the `@mcpwithhui/hui/vue` module provides the `useToolHuiRenderer` composable, it simplifies UI creation significantly:

```typescript
// --- Using Vue Composable --- 
import { useToolHuiRenderer } from '@mcpwithhui/hui/vue'; // Adjust import path if needed
import { ref, computed } from 'vue';

// Assume mcpClient is your initialized HuiMcpClient instance
// Assume selectedToolName is a ref holding the name of the tool chosen by the user
const selectedToolName = ref('greet'); 

const { 
  isLoading, 
  toolInfo, 
  formData, 
  getParamDetails, // Helper to get component and props for a parameter
  callTool,       // Function to execute the tool call
  error 
} = useToolHuiRenderer(selectedToolName, mcpClient);

// --- Example Template Usage --- 
/*
<template>
  <div v-if="isLoading">Loading tool details...</div>
  <form v-else-if="toolInfo" @submit.prevent="callTool">
    <h2>{{ toolInfo.huiHints?.label || toolInfo.name }}</h2>
    <p v-if="toolInfo.huiHints?.description">{{ toolInfo.huiHints.description }}</p>
    
    <div v-for="paramName in Object.keys(toolInfo.inputSchema.properties)" :key="paramName" style="margin-bottom: 1rem;">
      <label :for="`input-${paramName}`" style="display: block; margin-bottom: 0.5rem;">
        {{ getParamDetails(paramName)?.label || paramName }}
      </label>
      <component 
        :is="getParamDetails(paramName)?.component || 'input'" 
        :id="`input-${paramName}`"
        v-model="formData[paramName]" 
        v-bind="getParamDetails(paramName)?.props || {}"
        style="width: 100%; padding: 0.5rem;"
      />
      <small v-if="getParamDetails(paramName)?.description" style="display: block; font-size: 0.8em; color: grey;">
        {{ getParamDetails(paramName)?.description }}
      </small>
    </div>
    
    <button type="submit" :disabled="isLoading">Execute</button>
    <div v-if="error" style="color: red; margin-top: 1rem;">Error: {{ error.message }}</div>
    
    <!-- Add logic here to display tool execution results -->
    
  </form>
  <div v-else>Select a tool or tool not found.</div>
</template>
*/
```

### Option B: Manual HUI Hint Processing (Framework-Agnostic Example)

If you're not using Vue or the composable isn't available, you can manually parse the `huiHints` to build your UI. Here's a conceptual example using plain JavaScript and DOM manipulation:

```javascript
// --- Manual HUI Hint Processing --- 

function renderToolForm(toolInfo, formData, formContainerElement) {
  formContainerElement.innerHTML = ''; // Clear previous form
  if (!toolInfo || !toolInfo.inputSchema || !toolInfo.inputSchema.properties) return;

  const form = document.createElement('form');

  // Add Title/Description from huiHints
  const title = document.createElement('h2');
  title.textContent = toolInfo.huiHints?.label || toolInfo.name;
  form.appendChild(title);
  if (toolInfo.huiHints?.description) { /* ... add description paragraph ... */ }

  // Create inputs for each parameter
  for (const paramName in toolInfo.inputSchema.properties) {
    const paramSchema = toolInfo.inputSchema.properties[paramName];
    const hint = toolInfo.huiHints?.inputHints?.[paramName] || {};
    
    const group = document.createElement('div');
    group.style.marginBottom = '1rem';

    const label = document.createElement('label');
    label.textContent = hint.label || paramName;
    label.style.display = 'block';
    label.style.marginBottom = '0.5rem';
    group.appendChild(label);

    let inputElement;
    // Determine inputType based on hint or fallback to schema type
    const inputType = hint.inputType || 
                      (paramSchema.type === 'boolean' ? 'checkbox' : 
                      (paramSchema.type === 'number' || paramSchema.type === 'integer' ? 'number' : 'text'));

    // Create appropriate HTML element based on inputType
    if (inputType === 'textarea') {
      inputElement = document.createElement('textarea');
      if (hint.rows) inputElement.rows = hint.rows;
    } else if (inputType === 'select' && hint.options) {
      inputElement = document.createElement('select');
      hint.options.forEach(opt => { /* ... create and append <option> ... */ });
    } else if (inputType === 'checkbox') {
      inputElement = document.createElement('input');
      inputElement.type = 'checkbox';
      inputElement.checked = formData[paramName] ?? hint.defaultValue ?? false;
    } else { // Default to <input>
      inputElement = document.createElement('input');
      inputElement.type = inputType === 'number' ? 'number' : 'text'; // Handle other input types like password, date
      if (hint.min !== undefined) inputElement.min = String(hint.min);
      if (hint.max !== undefined) inputElement.max = String(hint.max);
      if (hint.step !== undefined) inputElement.step = String(hint.step);
      inputElement.value = formData[paramName] ?? hint.defaultValue ?? '';
    }
    
    inputElement.id = `input-${paramName}`;
    inputElement.name = paramName;
    if (hint.placeholder) inputElement.placeholder = hint.placeholder;
    inputElement.style.width = '100%';
    inputElement.style.padding = '0.5rem';

    // Basic data binding: Update formData object on input/change
    inputElement.addEventListener(inputElement.type === 'checkbox' ? 'change' : 'input', (e) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      let value = inputElement.type === 'checkbox' ? (target as HTMLInputElement).checked : target.value;
      // Attempt to convert back to number if schema expects it
      if (paramSchema.type === 'number' || paramSchema.type === 'integer') {
        const num = parseFloat(value as string);
        value = isNaN(num) ? value : num; // Keep original if parsing fails
      } 
      formData[paramName] = value;
      console.log('Form data updated:', formData);
    });

    group.appendChild(inputElement);

    if (hint.description) { /* ... add description element ... */ }

    form.appendChild(group);
  }

  // Add Submit Button
  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.textContent = 'Execute';
  form.appendChild(submitButton);

  // Handle Form Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log('Executing tool with data:', formData);
    try {
      // Ensure data types match schema before calling (e.g., convert numbers)
      const args = { ...formData }; 
      // ... (add type conversion logic based on paramSchema.type) ... 
      // const result = await mcpClient.callTool(toolInfo.name, args);
      // console.log('Tool result:', result);
      // Display result... 
    } catch (callError) {
      console.error('Tool call failed:', callError);
      // Display error...
    }
  });

  formContainerElement.appendChild(form);
}

/* Example Usage:
const greetToolInfo = tools.find(t => t.name === 'greet');
const formDataForGreet = { name: 'World' }; // Initial data potentially from hints.defaultValue
const container = document.getElementById('tool-form-container');
if (greetToolInfo && container) {
  renderToolForm(greetToolInfo, formDataForGreet, container);
}
*/
```

## 6. Fetching Detailed Type Definitions (Optional)

For advanced use cases like strict client-side validation or code generation, you can fetch the detailed input schema for a specific tool using the `getToolTypeDefinition` meta-tool.

```typescript
async function getToolSchema(toolName: string) {
  try {
    const params = { toolName: toolName, format: 'json-schema' }; // Or 'typescript-declaration'
    const result = await mcpClient.callTool({ name: 'getToolTypeDefinition', arguments: params }, undefined);

    if (result?.content?.[0]?.type === 'text') {
      const definitionResult = JSON.parse(result.content[0].text);
      console.log(`JSON Schema for ${toolName}:`, definitionResult.definition);
      return definitionResult.definition;
    } else {
      console.warn('Could not retrieve valid schema from getToolTypeDefinition');
      return null;
    }
  } catch (error) {
    console.error(`Error fetching schema for ${toolName}:`, error);
    return null;
  }
}

// Example:
// const greetSchema = await getToolSchema('greet');
```

## 7. Pre-built Web Interface (Hosted by this Server)

This server instance also hosts a pre-built web interface, allowing users to interact with the tools directly through their browser.

*   **Access**: You can typically access this UI by navigating to the server's root URL (e.g., `http://localhost:3000/`) in your web browser.
*   **Functionality**: The web interface served at the root path **internally uses the `HuiMcpClient`** (similar to the setup described in Section 3) to automatically connect to the `/mcp` endpoint of this server. It fetches the tools and dynamically renders the user interface based on the provided HUI Hints (as outlined in Section 5).
*   **Note for AI Agents**: If you are an AI agent needing programmatic access to the tools, using the method described in Section 3 (installing the package and initializing `HuiMcpClient`) is the recommended approach for reliable API interaction. The hosted web UI is primarily designed for direct human use.

---
Happy HUI Building! 