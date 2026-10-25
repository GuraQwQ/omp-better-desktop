import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/.cache/**', '**/.codegraph/**', '**/.references/**', '**/.impeccable/**', '**/artifacts/**', '**/build/**', '**/test/**', '**/src-tauri/**'] },
  },
  clearScreen: false,
  build: { target: 'es2022', sourcemap: false },
});
