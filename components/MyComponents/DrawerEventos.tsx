"use client";
import { Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerFooter, Button } from "@heroui/react";
import Link from "next/link";
import { useMediaQuery } from "@/hooks/use-media-query";
import EventPublicActions from "./EventPublicActions";
type Props={evento:{id?:string;nome:string;banner:string;carrossel:string[];descricao:string;intialDate:string;finishDate:string;linkParaCompra:string;lat:number;lng:number};onClose:()=>void;onTraceRoute:()=>void;isRouteTracing:boolean};
export default function DrawerEventos({evento,onClose,onTraceRoute,isRouteTracing}:Props){
 const desktop=useMediaQuery('(min-width: 768px)');
 return <Drawer isOpen={Boolean(evento)} onOpenChange={open=>{if(!open)onClose();}} placement={desktop?'right':'bottom'} size="lg" backdrop="blur"><DrawerContent><DrawerHeader className="break-words">{evento.nome}</DrawerHeader><DrawerBody>{evento.banner && <img src={evento.banner} alt="" className="aspect-video w-full rounded-xl object-cover" />}<p className="text-sm font-semibold text-primary">{evento.intialDate} — {evento.finishDate}</p><p className="whitespace-pre-wrap break-words leading-7">{evento.descricao}</p>{evento.id && <EventPublicActions eventId={evento.id} ticketUrl={evento.linkParaCompra} />}{evento.carrossel.length>0 && <div className="grid grid-cols-2 gap-3">{evento.carrossel.map((image,index)=><img key={image+index} src={image} loading="lazy" alt={'Foto '+(index+1)+' de '+evento.nome} className="aspect-square rounded-xl object-cover" />)}</div>}</DrawerBody><DrawerFooter className="flex flex-wrap gap-2">{evento.id && <Button as={Link} href={'/eventos/'+evento.id} variant="light" color="primary">Página do evento</Button>}<Button onPress={onTraceRoute} color="primary" isDisabled={isRouteTracing}>{isRouteTracing?'Calculando rota...':'Traçar rota'}</Button><Button onPress={onClose} variant="light">Fechar</Button></DrawerFooter></DrawerContent></Drawer>;
}
