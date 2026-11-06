/* No fetch handler: authenticated routes and APIs are never cached here. */
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
function safeHref(value) {
 if(typeof value!=="string" || !/^\/(?![\/\\])/.test(value) || /[\\\u0000-\u0020]/.test(value))return "/notificacoes";
 try { const decoded=decodeURIComponent(value);if(decoded.startsWith("//")||/[\\\u0000-\u001f]/.test(decoded))return "/notificacoes";const url=new URL(value,self.location.origin);return url.origin===self.location.origin?url.href:"/notificacoes";}catch{return "/notificacoes";}
}
self.addEventListener("push", function(event){
 let data;try{data=event.data.json();}catch{return;}
 if(!data||typeof data.userId!=="string"||typeof data.id!=="string")return;
 event.waitUntil((async()=>{
 let verified=false;
 try { const response=await fetch("/api/auth/session",{credentials:"same-origin",cache:"no-store"});if(response.ok){const session=await response.json();verified=session?.user?.id===data.userId;} }catch{}
 const href=verified?safeHref(data.href):"/notificacoes";
 return self.registration.showNotification(verified&&typeof data.title==="string"?data.title.slice(0,80):"EventMap",{body:verified&&typeof data.message==="string"?data.message.slice(0,160):"Você tem uma atualização",icon:"/branding/notification-icon.png",badge:"/branding/notification-badge.png",tag:verified?"eventmap:"+data.userId+":"+(data.type||"SYSTEM")+":"+href:"eventmap-generic",renotify:false,requireInteraction:verified&&data.priority==="high",actions:[{action:"open",title:"Abrir"},{action:"dismiss",title:"Dispensar"}],data:{href}});
 })());
});
self.addEventListener("notificationclick",function(event){
 event.notification.close();if(event.action==="dismiss")return;
 event.waitUntil((async()=>{
 const target=new URL(safeHref(event.notification.data?.href),self.location.origin).href;
 try {
 const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
 for(const client of clients)if(new URL(client.url).origin===self.location.origin){await client.navigate(target);await client.focus();return;}
 const opened=await self.clients.openWindow(target);if(opened)return;
 }catch{}
 return self.clients.openWindow(new URL("/notificacoes",self.location.origin).href);
 })());
});
