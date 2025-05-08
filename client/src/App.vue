<template>
  <div id="app-container">
    <h1>MCP-HUI Tool Interface</h1>
    <ToolList />
  </div>
</template>

<script setup lang="ts">
import ToolList from './components/ToolList.vue';
</script>

<style scoped>
#app-container {
  max-width: 1000px;
  margin: 20px auto;
  padding: 20px;
  background-color: #f0f2f5;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

h1 {
  text-align: center;
  color: #2c3e50;
  margin-bottom: 30px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}
</style> 