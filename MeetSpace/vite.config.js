import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/livekit-client')) {
            return 'livekit-vendor';
          }
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router-dom/')
          ) {
            return 'react-vendor';
          }
          if (
            id.includes('node_modules/lucide-react') ||
            id.includes('node_modules/axios') ||
            id.includes('node_modules/socket.io-client')
          ) {
            return 'ui-vendor';
          }
        },
      },
    },
  },
});
