import sharp from 'sharp'
import { readFile, mkdir } from 'node:fs/promises'
const logo=await readFile('public/favicon.svg')
await mkdir('public/icons',{recursive:true})
for(const size of [192,512])await sharp(logo).resize(size,size).flatten({background:'#0F766E'}).png().toFile(`public/icons/pwa-${size}.png`)
await sharp(logo).resize(180,180).flatten({background:'#0F766E'}).png().toFile('public/icons/apple-touch-icon.png')
await sharp({create:{width:512,height:512,channels:4,background:'#0F766E'}}).composite([{input:await sharp(logo).resize(320,320).png().toBuffer(),left:96,top:96}]).png().toFile('public/icons/pwa-maskable-512.png')
console.log('Generated branded 192/512 PNG, maskable and Apple icons.')
