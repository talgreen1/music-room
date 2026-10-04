import { defineConfig, loadEnv } from 'vite';
import { localRoomsPlugin } from './server/local-rooms';

export default defineConfig(({ mode }) => {
  if (mode === 'deployment') {
    const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
    const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_DATABASE_URL', 'VITE_FIREBASE_PROJECT_ID'];
    if (env.VITE_USE_FIREBASE_EMULATORS === 'true' || required.some(key => !env[key])) {
      throw new Error('Deployment requires complete cloud Firebase configuration and emulator mode disabled. Set .env.deployment.local before deploying.');
    }
  }
  return {
    plugins: [localRoomsPlugin({ ...loadEnv(mode, process.cwd(), ''), ...process.env } as Record<string, string>)],
    server: { host: '0.0.0.0', port: 5173, strictPort: true }
  };
});
