import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

const MSW_PKGS = ['msw', '@mswjs', '@bundled-es-modules', 'headers-polyfill', 'outvariant', 'strict-event-emitter', 'is-node-process', '@open-draft', 'engine.io-parser', 'socket.io-parser', '@socket.io']
const REALTIME_PKGS = ['socket.io-client', 'engine.io-client']
const VENDOR_PKGS = ['react', 'react-dom', 'scheduler', '@tanstack']

const inPkg = (id: string, pkgs: string[]) => {
  const normalized = id.split(path.sep).join('/')
  return pkgs.some((p) => normalized.includes(`/node_modules/${p}/`))
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // MSW in its own chunk (modulepreloaded in parallel with the app). The Socket.IO client goes
        // into a lazy chunk that must only be evaluated after MSW patched WebSocket (see src/main.tsx);
        // the parsers it shares with @mswjs/socket.io-binding stay in the MSW chunk.
        manualChunks(id) {
          if (inPkg(id, MSW_PKGS)) return 'msw'
          if (inPkg(id, REALTIME_PKGS)) return 'realtime'
          if (inPkg(id, VENDOR_PKGS)) return 'vendor'
        },
      },
    },
  },
})
