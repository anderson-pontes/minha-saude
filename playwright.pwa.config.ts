import { defineConfig } from '@playwright/test'
export default defineConfig({testDir:'./tests-pwa',outputDir:'./test-results/pwa',workers:1,use:{baseURL:'http://127.0.0.1:4176',headless:true},projects:[{name:'edge',use:{channel:'msedge'}},{name:'chrome',use:{channel:'chrome'}}],
 webServer:{command:'node scripts/pwa-preview-server.mjs',url:'http://127.0.0.1:4176',reuseExistingServer:false},
})
