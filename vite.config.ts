import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages で https://hanann87.github.io/lifestyle/ に公開するため
  base: '/lifestyle/',
  plugins: [react()],
})
