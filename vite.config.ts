import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ }],
        },
      },
    },
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'prompt', injectRegister: null,
    includeAssets: ['favicon.svg','icons/*.png'],
    manifest: { id:'/', name:'Minha Saúde', short_name:'Minha Saúde', description:'Sua rede pessoal de clínicas, hospitais e médicos.', start_url:'/', scope:'/', display:'standalone', background_color:'#F8FAFC', theme_color:'#0F766E', lang:'pt-BR',
      icons:[{src:'/icons/pwa-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/icons/pwa-512.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:'/icons/pwa-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}],
    },
    workbox: { cleanupOutdatedCaches:true, navigateFallback:'/index.html', globPatterns:['**/*.{js,css,html,png,svg,woff,woff2,webmanifest}'],
      runtimeCaching:[{urlPattern:/^https:\/\/[^/]+\.supabase\.co\//i,handler:'NetworkOnly',options:{fetchOptions:{cache:'no-store'}}}],
    },
    devOptions:{enabled:false},
  })],
})
