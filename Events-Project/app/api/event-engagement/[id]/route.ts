import { NextRequest, NextResponse } from "next/server";
import { isAllowedRequestOrigin } from "@/lib/publicUrl";
import prisma from "@/lib/prisma";
export async function POST(request:NextRequest,{params}:{params:{id:string}}){
 try {
 if(!isAllowedRequestOrigin(request))return NextResponse.json({success:false},{status:403});
 const body:unknown=await request.json();
 if(!body||typeof body!=="object"||!("action" in body)||!["view","ticket"].includes(String(body.action)))return NextResponse.json({success:false},{status:400});
 const action=body.action as "view"|"ticket";
 const event=await prisma.events.findFirst({where:{id:params.id,status:{in:["PUBLISHED","CANCELLED","ENDED"]}},select:{id:true}});
 if(!event)return NextResponse.json({success:false},{status:404});
 const cookieName="eventmap_metric_"+params.id.replace(/[^a-zA-Z0-9]/g,"");
 const previous=request.cookies.get(cookieName)?.value;
 const [lastView,lastTicket]=(previous??"0:0").split(":").map(Number);
 const now=Date.now(),last=action==="view"?lastView:lastTicket;
 const response=NextResponse.json({success:true});
 if(Number.isFinite(last)&&now-last<(action==="view"?3600000:60000))return response;
 const delta=action==="view"?{views:{increment:1}}:{ticketClicks:{increment:1}};
 const day=new Date().toISOString().slice(0,10);
 await prisma.$transaction([
 prisma.events.update({where:{id:event.id},data:delta}),
 prisma.eventMetric.upsert({where:{eventId_day:{eventId:event.id,day}},create:{eventId:event.id,day,views:action==="view"?1:0,ticketClicks:action==="ticket"?1:0},update:delta})
 ]);
 response.cookies.set(cookieName,action==="view"?now+":"+lastTicket:lastView+":"+now,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:3600});
 return response;
 }catch{return NextResponse.json({success:false},{status:500});}
}
