import type { PrismaClient } from "@prisma/client";
import webpush from "web-push";
import { eventInstant } from "../lib/eventTime.js";

export function startNotificationWorker(prisma:PrismaClient, emit:(userId:string,event:string)=>void, eventsChanged:()=>void) {
 let stopped=false, polling=false, running=false, lastCheck=new Date(), lastError=false;
 const publicKey=process.env.WEB_PUSH_PUBLIC_KEY, privateKey=process.env.WEB_PUSH_PRIVATE_KEY, subject=process.env.WEB_PUSH_SUBJECT;
 const pushEnabled=Boolean(publicKey&&privateKey&&subject);
 if(pushEnabled)webpush.setVapidDetails(subject!,publicKey!,privateKey!);
 async function poll(){
  if(stopped||polling)return;polling=true;
  try{
   const until=new Date();
   const entries=await prisma.notification.findMany({where:{createdAt:{gte:lastCheck,lte:until}},select:{userId:true}});
   lastCheck=until;
   for(const id of Array.from(new Set(entries.map(item=>item.userId))))emit(id,"notification-updated");
   lastError=false;
  }catch{if(!lastError)console.error("Notification delivery temporarily unavailable.");lastError=true;}
  finally{polling=false;}
 }
 async function scheduled(){
  if(stopped||running)return;running=true;
  try{
   const now=new Date();
   const favorites=await prisma.favorite.findMany({where:{reminderMinutes:{not:null},reminderSentAt:null,event:{status:"PUBLISHED",dataInicio:{gte:new Date(now.getTime()-86400000).toISOString().slice(0,10)}}},include:{event:{select:{id:true,nome:true,dataInicio:true,startTime:true,timezone:true}}},orderBy:{event:{dataInicio:"asc"}},take:500});
   for(const favorite of favorites){
    const start=eventInstant(favorite.event.dataInicio,favorite.event.startTime,favorite.event.timezone);
    if(!start||start<=now||start.getTime()-(favorite.reminderMinutes??0)*60000>now.getTime())continue;
    await prisma.$transaction(async tx=>{
     const claimed=await tx.favorite.updateMany({where:{userId:favorite.userId,eventId:favorite.eventId,reminderSentAt:null,reminderMinutes:favorite.reminderMinutes},data:{reminderSentAt:now}});
     if(claimed.count)await tx.notification.create({data:{userId:favorite.userId,title:"Seu evento está chegando",message:favorite.event.nome+" começa em breve. Confira data e local.",href:"/eventos/"+favorite.eventId}});
    });
   }
   const published=await prisma.events.findMany({where:{status:"PUBLISHED",dataFim:{lte:new Date(now.getTime()+86400000).toISOString().slice(0,10)}},select:{id:true,nome:true,userId:true,dataFim:true,endTime:true,timezone:true},take:500});
   let changed=false;
   for(const event of published){
    const end=eventInstant(event.dataFim,event.endTime,event.timezone,"23:59");
    if(!end||end>now)continue;
    await prisma.$transaction(async tx=>{
     const result=await tx.events.updateMany({where:{id:event.id,status:"PUBLISHED"},data:{status:"ENDED"}});
     if(result.count){await tx.eventHistory.create({data:{eventId:event.id,eventName:event.nome,promoterId:event.userId,actorId:"system",actorName:"EventMap",action:"UPDATED",note:"Evento encerrado automaticamente após a data final."}});changed=true;}
    });
   }
   if(changed)eventsChanged();
   if(pushEnabled){
    const notices=await prisma.notification.findMany({where:{pushedAt:null,createdAt:{gte:new Date(now.getTime()-86400000)}},orderBy:{createdAt:"asc"},take:50,include:{user:{select:{subscriptions:true}}}});
    for(const notice of notices){
     let retry=false;
     for(const subscription of notice.user.subscriptions){
      try{
       await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},JSON.stringify({id:notice.id,userId:notice.userId,title:notice.title,message:notice.message,href:notice.href}),{TTL:3600,timeout:5000});
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
 const pollingTimer=setInterval(()=>{void poll();},5000);
 const scheduleTimer=setInterval(()=>{void scheduled();},60000);
 void scheduled();
 return ()=>{stopped=true;clearInterval(pollingTimer);clearInterval(scheduleTimer);};
}
