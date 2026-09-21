import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
// @ts-expect-error — plugin em JavaScript puro, sem tipos próprios
import { songsLibrary } from './tools/songs-plugin.mjs'

// A versão mostrada no rodapé do menu sai daqui, e não de uma constante
// no componente: duas cópias do número acabam divergindo.
const { version } = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
)

export default defineConfig({
  plugins: [react(), songsLibrary()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
