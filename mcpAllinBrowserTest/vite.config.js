import { defineConfig } from 'vite';

export default defineConfig({
  // server: {
  //   // open: true, // Automatically open in browser
  //   fs: {
  //     // Allow serving files from one level up (to reach packages/hui if needed directly for some reason)
  //     // strict: false, // Be careful with this in real projects
  //     allow: ['..']
  //   }
  // },
  optimizeDeps: {
    include: [
      // We list .js files here because that's what will be published or linked from the local package
      // Vite will then correctly process these, even if they were originally .ts
      '@mcpwithhui/hui/client',
      '@mcpwithhui/hui/server',
      '@mcpwithhui/hui/shared',
      // Below are the specific transport files we created and built
      // Vite should pick these up if test-transports.js imports them directly with .js extension
      // from a path Vite can resolve (e.g. node_modules/@mcpwithhui/hui/dist/browser/...)
      // However, our test-transports.js currently imports from './libs/...'
      // So, the key is that the local `file:../packages/hui` symlink works and that `hui` package has correct exports.
      
      // If we were importing directly from the hui package's dist like:
      // import { BroadcastChannelClientTransport } from '@mcpwithhui/hui/dist/browser/mcp-hui-broadcastchannel-client.esm.js';
      // then we might list them here. But since we added `@mcpwithhui/hui` as a dependency and will adjust
      // test-transports.js to import from there, listing the main package exports above is more idiomatic.
    ],
    // esbuildOptions: {
    //   // If encountering issues with specific .js files from dependencies not being treated as ESM:
    //   // loader: {
    //   //   '.js': 'jsx' // or 'ts' if it helps, though 'jsx' is common for forcing esm processing
    //   // }
    // }
  },
  resolve: {
    alias: {
      // If we still have trouble with Vite finding the local package's files,
      // we can create a more explicit alias, though `npm install` with `file:` should handle this.
      // '@mcpwithhui/hui': path.resolve(__dirname, '../packages/hui/dist') // Adjust path as needed
    }
  }
}); 