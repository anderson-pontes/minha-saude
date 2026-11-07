import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
const handlers={},shown=[],opened=[],navigated=[]
const self={location:{origin:'https://app.example'},addEventListener:(name,handler)=>handlers[name]=handler,registration:{showNotification:async(title,options)=>shown.push({title,options})},clients:{matchAll:async()=>[],openWindow:async(url)=>opened.push(url)}}
vm.runInNewContext(readFileSync('public/push-events.js','utf8'),{self,URL})
const id='11111111-1111-4111-8111-111111111111',tag='22222222-2222-4222-8222-222222222222'
let pending
handlers.push({data:{json:()=>({appointment:id,tag,title:'Sensitive medical title'})},waitUntil:p=>pending=p});await pending
assert.equal(shown.length,1);assert(!JSON.stringify(shown).includes('Sensitive'));assert.equal(shown[0].options.tag,tag);assert.equal(shown[0].options.renotify,false)
handlers.notificationclick({notification:{data:{url:'/agenda/'+id},close(){}},waitUntil:p=>pending=p});await pending
assert.equal(opened[0],'https://app.example/agenda/'+id)
self.clients.matchAll=async()=>[{url:'https://app.example/',navigate:async url=>navigated.push(url),focus:async()=>{}}]
handlers.notificationclick({notification:{data:{url:'/agenda/'+id},close(){}},waitUntil:p=>pending=p});await pending;assert.equal(navigated.length,1)
handlers.notificationclick({notification:{data:{url:'https://evil.example'},close(){}},waitUntil:()=>assert.fail('External notification URL must be rejected')})
console.log('PASS service worker: generic privacy-preserving push, deduplication tag, same-origin deep link, existing-window focus, external URL rejection.')
