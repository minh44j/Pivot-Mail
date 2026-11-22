import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    // iconv-lite (used by the Outlook .msg reader in the preview page) needs Node's stream module; the browser stand-in
    // decodes with TextDecoder. See src/preview/iconvShim.ts.
    alias: { 'iconv-lite': resolve(import.meta.dirname, 'src/preview/iconvShim.ts') },
  },
  build: {
    rollupOptions: {
      // The app, and the sealed attachment preview page (Word, Excel, PowerPoint, mail, ZIP, TIFF).
      input: { main: resolve(import.meta.dirname, 'index.html'), preview: resolve(import.meta.dirname, 'preview.html') },
    },
  },
})
