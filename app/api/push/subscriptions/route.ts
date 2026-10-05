import { NextRequest,NextResponse } from "next/server";
import { isAllowedRequestOrigin } from "@/lib/publicUrl";
import prisma from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { z } from "zod";
const subscriptionSchema=z.object({endpoint:z.string().url().max(2048),keys:z.object({p256dh:z.string().regex(/^[A-Za-z0-9_-]+$/).min(80).max(100),auth:z.string().regex(/^[A-Za-z0-9_-]+$/).min(20).max(30)})});
function validEndpoint(endpoint:string){const url=new URL(endpoint);return url.protocol==="https:"&&(url.hostname==="fcm.googleapis.com"||url.hostname==="updates.push.services.mozilla.com"||url.hostname==="web.push.apple.com"||url.hostname.endsWith(".notify.windows.com"));}
function validOrigin(request:NextRequest){return isAllowedRequestOrigin(request);}
export async function GET(request:NextRequest){
 const user=await getAuthenticatedUser(request);if(!user)return NextResponse.json({publicKey:null,subscribed:false},{status:401});
 const endpoint=request.nextUrl.searchParams.get("endpoint");
 const subscribed=Boolean(endpoint)&&(await prisma.pushSubscription.count({where:{userId:user.id,endpoint:endpoint!}}))>0;
 return NextResponse.json({publicKey:process.env.WEB_PUSH_PUBLIC_KEY&&process.env.WEB_PUSH_PRIVATE_KEY&&process.env.WEB_PUSH_SUBJECT?process.env.WEB_PUSH_PUBLIC_KEY:null,subscribed});
}
export async function POST(request:NextRequest){
 try{
 const user=await getAuthenticatedUser(request);if(!user||!validOrigin(request))return NextResponse.json({success:false,message:"Acesso negado."},{status:403});
 if(!process.env.WEB_PUSH_PUBLIC_KEY||!process.env.WEB_PUSH_PRIVATE_KEY||!process.env.WEB_PUSH_SUBJECT)return NextResponse.json({success:false,message:"Notificações externas ainda não foram configuradas."},{status:503});
 const parsed=subscriptionSchema.safeParse(await request.json());if(!parsed.success||!validEndpoint(parsed.data.endpoint))return NextResponse.json({success:false,message:"Inscrição inválida."},{status:400});
 const subscription=parsed.data;
 const existing=await prisma.pushSubscription.findUnique({where:{endpoint:subscription.endpoint},select:{userId:true}});
 if(!existing&&(await prisma.pushSubscription.count({where:{userId:user.id}}))>=5)return NextResponse.json({success:false,message:"Limite de dispositivos atingido."},{status:400});
 await prisma.pushSubscription.upsert({where:{endpoint:subscription.endpoint},create:{userId:user.id,endpoint:subscription.endpoint,...subscription.keys},update:{userId:user.id,...subscription.keys}});
 return NextResponse.json({success:true,message:"Notificações externas ativadas."});
 }catch{return NextResponse.json({success:false,message:"Não foi possível ativar notificações."},{status:500});}
}
export async function DELETE(request:NextRequest){
 const user=await getAuthenticatedUser(request);if(!user||!validOrigin(request))return NextResponse.json({success:false},{status:403});
 try{const body:unknown=await request.json();if(!body||typeof body!=="object"||!("endpoint" in body)||typeof body.endpoint!=="string")return NextResponse.json({success:false},{status:400});
 await prisma.pushSubscription.deleteMany({where:{userId:user.id,endpoint:body.endpoint}});
 return NextResponse.json({success:true});
 }catch{return NextResponse.json({success:false},{status:400});}
}
