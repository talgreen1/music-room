import { defineConfig } from 'vite';
import { localRoomsPlugin } from './server/local-rooms';

export default defineConfig({
  plugins: [localRoomsPlugin()],
  server: { host: '0.0.0.0', port: 5173, strictPort: true }
});
