// Test-only localhost server for the built PWA. Never included in the deployed dist.
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
let version=1
const root=path.resolve('dist')
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2','.webmanifest':'application/manifest+json'}
http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname
 if(pathname==='/__test/version'&&req.method==='POST'){version++;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({version}));return}
 let file=path.resolve(root,'.'+decodeURIComponent(pathname))
 if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);res.end();return}
 if(!path.extname(file))file=path.join(root,'index.html')
 try{let body=await readFile(file);if(pathname==='/sw.js')body=Buffer.concat([body,Buffer.from(`\n// local-test-version:${version}\n`)])
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store',...(pathname==='/sw.js'?{'Service-Worker-Allowed':'/'}:{})});res.end(body)
 }catch{res.writeHead(404);res.end('Not found')}
}).listen(4176,'127.0.0.1',()=>console.log('Built PWA test server on localhost:4176'))
