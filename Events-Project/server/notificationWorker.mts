import { notificationPushPayload } from "../lib/notifications/push.js";
import { createNotification, createNotifications } from "../lib/notifications/create.js";
import { notificationCopy } from "../lib/notifications/catalog.js";
import type { PrismaClient } from "@prisma/client";
import webpush from "web-push";
import { eventInstant } from "../lib/eventTime.js";

export function startNotificationWorker(prisma:PrismaClient, emit:(userId:string,event:string)=>void, eventsChanged:()=>void) {
 let stopped=false, polling=false, running=false, lastCheck=new Date(), lastError=false;
 const overlapMs = 60_000;
 const sent = new Map<string, number>();
 const publicKey=process.env.WEB_PUSH_PUBLIC_KEY, privateKey=process.env.WEB_PUSH_PRIVATE_KEY, subject=process.env.WEB_PUSH_SUBJECT;
 let pushEnabled=false;
 if(publicKey&&privateKey&&subject){
  try{webpush.setVapidDetails(subject,publicKey,privateKey);pushEnabled=true;console.info("External push enabled.");}
  catch{console.error("External push disabled: invalid configuration.");}
 }
 async function poll(){
  if(stopped||polling)return;polling=true;
  try{
   const until=new Date();
   // PostgreSQL now() reflects transaction start. A notice can become visible
   // after the cursor passed its timestamp, so revisit a bounded window.
   const since = new Date(lastCheck.getTime() - overlapMs);
   const entries=await prisma.notification.findMany({where:{createdAt:{gte:since,lte:until}},select:{id:true,userId:true,createdAt:true}});
   const fresh = entries.filter(entry => !sent.has(entry.id));
   new Set(fresh.map(item=>item.userId)).forEach(id=>emit(id,"notification-updated"));
   for(const entry of fresh) sent.set(entry.id, entry.createdAt.getTime());
   sent.forEach((createdAt,id)=>{if(createdAt < since.getTime()) sent.delete(id);});
   lastCheck=until;
   lastError=false;
  }catch{if(!lastError)console.error("Notification delivery temporarily unavailable.");lastError=true;}
  finally{polling=false;}
 }
 async function scheduled(){
  if(stopped||running)return;running=true;
  try{
   const now=new Date();
   let favoriteCursor:{userId:string;eventId:string}|undefined;
   while(!stopped){
   const favorites=await prisma.favorite.findMany({where:{reminderMinutes:{not:null},reminderSentAt:null,event:{status:"PUBLISHED",dataInicio:{gte:new Date(now.getTime()-86400000).toISOString().slice(0,10),lte:new Date(now.getTime()+2*86400000).toISOString().slice(0,10)}},...(favoriteCursor?{OR:[{userId:{gt:favoriteCursor.userId}},{userId:favoriteCursor.userId,eventId:{gt:favoriteCursor.eventId}}]}:{})},include:{event:{select:{id:true,nome:true,dataInicio:true,startTime:true,timezone:true}}},orderBy:[{userId:"asc"},{eventId:"asc"}],take:500});
   if(!favorites.length)break;
   for(const favorite of favorites){
    const start=eventInstant(favorite.event.dataInicio,favorite.event.startTime,favorite.event.timezone);
    if(!start||start<=now||start.getTime()-(favorite.reminderMinutes??0)*60000>now.getTime())continue;
    await prisma.$transaction(async tx=>{
     const claimed=await tx.favorite.updateMany({where:{userId:favorite.userId,eventId:favorite.eventId,reminderSentAt:null,reminderMinutes:favorite.reminderMinutes},data:{reminderSentAt:now}});
     if(claimed.count)await createNotification(tx, notificationCopy({ ...{userId:favorite.userId,title:"Seu evento está chegando",message:favorite.event.nome+" começa em breve. Confira data e local.",href:"/eventos/"+favorite.eventId}, type: "EVENT_REMINDER" }));
    });
   }
   const lastFavorite=favorites[favorites.length-1];
   favoriteCursor={userId:lastFavorite.userId,eventId:lastFavorite.eventId};
   if(favorites.length<500)break;
   }
   // Isolated so a reminder failure never blocks lifecycle updates or push delivery.
   try{await remindRegistrants(now);}catch{console.error("Registration reminders temporarily unavailable.");}
   let changed=false,eventCursor:string|undefined;
   while(!stopped){
   const published=await prisma.events.findMany({where:{status:"PUBLISHED",dataFim:{lte:new Date(now.getTime()+86400000).toISOString().slice(0,10)},...(eventCursor?{id:{gt:eventCursor}}:{})},select:{id:true,nome:true,userId:true,dataFim:true,endTime:true,timezone:true},orderBy:{id:"asc"},take:500});
   if(!published.length)break;
   for(const event of published){
    const end=eventInstant(event.dataFim,event.endTime,event.timezone,"23:59");
    if(!end||end>now)continue;
    await prisma.$transaction(async tx=>{
     const result=await tx.events.updateMany({where:{id:event.id,status:"PUBLISHED",dataFim:event.dataFim,endTime:event.endTime,timezone:event.timezone},data:{status:"ENDED"}});
     if(result.count){await tx.eventHistory.create({data:{eventId:event.id,eventName:event.nome,promoterId:event.userId,actorId:"system",actorName:"EventMap",action:"UPDATED",note:"Evento encerrado automaticamente após a data final."}});changed=true;}
    });
   }
   eventCursor=published[published.length-1].id;
   if(published.length<500)break;
   }
   if(changed)eventsChanged();
   if(pushEnabled){
    const notices=await prisma.notification.findMany({where:{pushedAt:null,createdAt:{gte:new Date(now.getTime()-86400000)}},orderBy:{createdAt:"asc"},take:50,include:{user:{select:{subscriptions:true}}}});
    for(const notice of notices){
     let retry=false;
     for(const subscription of notice.user.subscriptions){
      try{
       await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},JSON.stringify(notificationPushPayload(notice)),{TTL:3600,timeout:5000});
      }catch(error){
       const status=typeof error==="object"&&error!==null&&"statusCode" in error?Number(error.statusCode):0;
       if(status===404||status===410)await prisma.pushSubscription.deleteMany({where:{id:subscription.id}});else retry=true;
      }
     }
     if(!retry)await prisma.notification.updateMany({where:{id:notice.id,pushedAt:null},data:{pushedAt:new Date()}});
    }
   }
  }catch{console.error("Scheduled event updates temporarily unavailable.");}
  finally{running=false;}
 }
 // Confirmed attendees get a reminder one day before the start (AI O-01). There is no
 // per-registration column, so a Notification groupKey bound to the start instant keeps it
 // idempotent and re-arms it when the schedule changes. Favorites with their own reminder win.
 async function remindRegistrants(now:Date){
  let cursor:string|undefined;
  while(!stopped){
   const registrations=await prisma.eventRegistration.findMany({where:{status:"CONFIRMED",event:{status:"PUBLISHED",dataInicio:{gte:new Date(now.getTime()-86400000).toISOString().slice(0,10),lte:new Date(now.getTime()+2*86400000).toISOString().slice(0,10)}},...(cursor?{id:{gt:cursor}}:{})},select:{id:true,userId:true,eventId:true,createdAt:true,event:{select:{nome:true,dataInicio:true,startTime:true,timezone:true}}},orderBy:{id:"asc"},take:500});
   if(!registrations.length)break;
   const due=registrations.flatMap(registration=>{
    const start=eventInstant(registration.event.dataInicio,registration.event.startTime,registration.event.timezone);
    return start&&registrationReminderDue(start,registration.createdAt,now)?[{...registration,groupKey:registrationReminderKey(registration.id,start)}]:[];
   });
   if(due.length){
    const [favorites,existing]=await Promise.all([
     prisma.favorite.findMany({where:{reminderMinutes:{not:null},OR:due.map(entry=>({userId:entry.userId,eventId:entry.eventId}))},select:{userId:true,eventId:true}}),
     prisma.notification.findMany({where:{userId:{in:Array.from(new Set(due.map(entry=>entry.userId)))},groupKey:{in:due.map(entry=>entry.groupKey)},createdAt:{gte:new Date(now.getTime()-3*86400000)}},select:{groupKey:true}}),
    ]);
    const favored=new Set(favorites.map(favorite=>favorite.userId+":"+favorite.eventId));
    const sentKeys=new Set(existing.map(notice=>notice.groupKey));
    const fresh=due.filter(entry=>!favored.has(entry.userId+":"+entry.eventId)&&!sentKeys.has(entry.groupKey));
    if(fresh.length)await createNotifications(prisma,fresh.map(entry=>notificationCopy({userId:entry.userId,title:"Seu evento está chegando",message:entry.event.nome+" começa em breve. Sua presença está confirmada.",href:"/eventos/"+entry.eventId,type:"EVENT_REMINDER" as const,groupKey:entry.groupKey})));
   }
   cursor=registrations[registrations.length-1].id;
   if(registrations.length<500)break;
  }
 }
 const pollingTimer=setInterval(()=>{void poll();},5000);
 const scheduleTimer=setInterval(()=>{void scheduled();},60000);
 void scheduled();
 return ()=>{stopped=true;clearInterval(pollingTimer);clearInterval(scheduleTimer);};
}
export const registrationReminderLeadMs=1440*60000;
/** Due inside the 24h window before start, unless the person registered inside that window. */
export function registrationReminderDue(start:Date,registeredAt:Date,now:Date):boolean{
 const opensAt=start.getTime()-registrationReminderLeadMs;
 return start.getTime()>now.getTime()&&opensAt<=now.getTime()&&registeredAt.getTime()<opensAt;
}
export function registrationReminderKey(registrationId:string,start:Date):string{
 return "registration-reminder:"+registrationId+":"+start.toISOString();
}
