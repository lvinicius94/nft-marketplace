import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // MSW in its own chunk (modulepreloaded in parallel with the app); Socket.IO client in a
        // lazy chunk that must only be evaluated after MSW patched WebSocket (see src/main.tsx).
        manualChunks(id) {
          if (/node_modules[\/](msw|@mswjs|@bundled-es-modules|headers-polyfill|outvariant|strict-event-emitter|is-node-process|@open-draft|engine\.io-parser|socket\.io-parser|@socket\.io)[\/]/.test(id)) return 'msw'
          if (/node_modules[\/](socket\.io-client|engine\.io-client)[\/]/.test(id)) return 'realtime'
          if (/node_modules[\/](react|react-dom|scheduler|@tanstack)[\/]/.test(id)) return 'vendor'
        },
      },
    },
  },
})
