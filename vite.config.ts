import { defineConfig } from 'vite';
import { node } from '@liuli-util/vite-plugin-node';

export default defineConfig({
  plugins: [node()],
  build: {
    outDir: 'dist',
    lib: {
      entry: ['src/launcher.ts', 'src/index.ts'],
    },
    rollupOptions: {
      external: [
        '../node_modules/@quasar/app-vite/lib/utils/get-ctx.js',
        '../node_modules/@quasar/app-vite/lib/quasar-config-file.js',
        '__WILL_REPLACED_TO_REAL_PATH__',
      ],
    },
  },
});
