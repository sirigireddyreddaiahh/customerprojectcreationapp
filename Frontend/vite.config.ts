import { defineConfig, loadEnv } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || env.VITE_API_PROXY_TARGET || 'http://localhost:5000'
  const demandRevenueApiTarget = process.env.VITE_DEMAND_REVENUE_API_PROXY_TARGET || env.VITE_DEMAND_REVENUE_API_PROXY_TARGET || 'http://localhost:5000'

  return {
  server: {
    proxy: {
      '/api/demands/revenue-rates': {
        target: demandRevenueApiTarget,
        changeOrigin: true,
      },
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    allowedHosts: [
      'localhost',
      'customer-project-frontend-old.cfapps.us10-001.hana.ondemand.com',
    ],
    proxy: {
      '/api/demands/revenue-rates': {
        target: demandRevenueApiTarget,
        changeOrigin: true,
      },
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  }
})
