import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
  },
  worker: {
    format: 'es',
  },
  build: {
    modulePreload: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'sql-editor',
              test: /node_modules[/](?:@codemirror|@lezer)[/]/,
              maxSize: 400_000,
            },
          ],
        },
      },
    },
  },
})
