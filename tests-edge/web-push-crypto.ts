import * as webpush from 'npm:web-push@4.0.0'
const sender=webpush.generateVAPIDKeys(),receiver=webpush.generateVAPIDKeys()
const auth=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')
const request=webpush.generateRequestDetails({endpoint:'https://fcm.googleapis.com/fcm/send/synthetic-test',keys:{p256dh:receiver.publicKey,auth}},JSON.stringify({appointment:'11111111-1111-4111-8111-111111111111',tag:'synthetic'}),{TTL:300,urgency:'normal',vapidDetails:{subject:'https://minha-saude-cyan.vercel.app',publicKey:sender.publicKey,privateKey:sender.privateKey}})
if(request.method!=='POST'||!request.body||request.headers['Content-Encoding']!=='aes128gcm')throw Error('Invalid encrypted Web Push request')
console.log('PASS Deno: VAPID signing and aes128gcm payload encryption; no external push request sent.')
