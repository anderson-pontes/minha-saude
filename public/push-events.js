/* Imported by the existing Workbox service worker. No second worker is registered. */
self.addEventListener('push', event => {
 let payload
 try { payload=event.data?.json() } catch { return }
 if(!payload || !/^[0-9a-f-]{36}$/i.test(payload.appointment??''))return
 event.waitUntil(self.registration.showNotification('Minha Saúde',{
  body:'Você possui um compromisso de saúde. Toque para conferir a data e o horário na agenda.',
  icon:'/icons/pwa-192.png',badge:'/icons/pwa-192.png',tag:String(payload.tag??payload.appointment),renotify:false,
  data:{url:'/agenda/'+payload.appointment},
 }))
})
self.addEventListener('notificationclick', event => {
 event.notification.close()
 const path=event.notification.data?.url
 if(typeof path!=='string'||!/^\/agenda\/[0-9a-f-]{36}$/i.test(path))return
 const target=new URL(path,self.location.origin).href
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{
  for(const client of windows){if(new URL(client.url).origin===self.location.origin){await client.navigate(target);await client.focus();return}}
  await self.clients.openWindow(target)
 }))
})
