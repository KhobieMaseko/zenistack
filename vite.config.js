import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('react-dom') || id.includes('react/'))
            return 'vendor-react';
          if (id.includes('framer-motion'))
            return 'vendor-motion';
          if (id.includes('pdf-lib') || id.includes('jspdf'))
            return 'vendor-pdf';
        },
      },
    },
  },
})
