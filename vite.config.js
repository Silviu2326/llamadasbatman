import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VENDRAVA_')
  const apiTarget = env.VENDRAVA_API_URL || 'http://127.0.0.1:3000'
  return {
    plugins: [react()],
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    server: {
      host: '127.0.0.1',
      proxy: {
        '/api': apiTarget,
        '/health': apiTarget,
      },
    },
  }
})
