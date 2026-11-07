import {rpc} from './rpc'
export function pushSupport(){return typeof Notification!=='undefined'&&'serviceWorker' in navigator&&'PushManager' in window}
export async function enableDevicePush(){
 if(!pushSupport())throw new Error('Este navegador não suporta Web Push. A central de notificações continua disponível.')
 const key=import.meta.env.VITE_VAPID_PUBLIC_KEY as string|undefined
 if(!key)throw new Error('Os lembretes push ainda não estão configurados neste ambiente.')
 const permission=await Notification.requestPermission()
 if(permission!=='granted')throw new Error('Permissão negada. Você pode habilitá-la nas configurações do navegador. Os lembretes internos continuam ativos.')
 const registration=await navigator.serviceWorker.ready
 const subscription=await registration.pushManager.getSubscription()??await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key})
 try{await rpc('agenda_subscription',{p_data:{...subscription.toJSON(),dispositivo:navigator.userAgent.slice(0,100)},p_remove:false});await rpc('agenda_preferences',{p_data:{push_ativo:true}})}catch(error){await subscription.unsubscribe();throw error}
}
export async function disableDevicePush(){
 if(!pushSupport())return
 const registration=await navigator.serviceWorker.getRegistration()
 const subscription=await registration?.pushManager.getSubscription()
 if(subscription){try{await rpc('agenda_subscription',{p_data:subscription.toJSON(),p_remove:true},{timeoutMs:3000})}finally{await subscription.unsubscribe()}}
 const notifications=await registration?.getNotifications();notifications?.forEach(n=>n.close())
}
