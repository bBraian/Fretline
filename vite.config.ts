import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
// @ts-expect-error — plugin em JavaScript puro, sem tipos próprios
import { songsLibrary } from './tools/songs-plugin.mjs'

export default defineConfig({
  plugins: [react(), songsLibrary()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
