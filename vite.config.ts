import { defineConfig, loadEnv } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { fileURLToPath, URL } from 'node:url'

const frontendRoot = fileURLToPath(new URL('./Frontend', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, frontendRoot, '')
  const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || env.VITE_API_PROXY_TARGET || 'http://localhost:5000'
  const demandRevenueApiTarget = process.env.VITE_DEMAND_REVENUE_API_PROXY_TARGET || env.VITE_DEMAND_REVENUE_API_PROXY_TARGET || 'http://localhost:5000'

  return {
    root: frontendRoot,
    envDir: frontendRoot,
    server: {
      proxy: {
        '/api/demands/revenue-rates': { target: demandRevenueApiTarget, changeOrigin: true },
        '/api': { target: apiProxyTarget, changeOrigin: true },
      },
    },
    preview: {
      proxy: {
        '/api/demands/revenue-rates': { target: demandRevenueApiTarget, changeOrigin: true },
        '/api': { target: apiProxyTarget, changeOrigin: true },
      },
    },
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] }),
    ],
  }
})
