import { defineConfig } from 'vite'

export default defineConfig({
  base: '/',
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/photos': 'http://localhost:8000',
      '/thumbs': 'http://localhost:8000',
    },
  },
})
