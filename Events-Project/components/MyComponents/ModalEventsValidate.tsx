"use client";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from "@heroui/react";
import Link from "next/link";
import { Evento } from "@/types";
import EventPublicActions from "./EventPublicActions";
interface Props { event: Evento | null; isOpen: boolean; onClose: () => void; role?: string | null; }
export default function ModalEventsValidate({event,isOpen,onClose}:Props) {
 if(!event)return null;
 return <Modal isOpen={isOpen} onOpenChange={open=>{if(!open)onClose();}} scrollBehavior="inside" size="2xl"><ModalContent><ModalHeader className="break-words">{event.nome}</ModalHeader><ModalBody>{event.banner && <img src={event.banner} alt="" className="aspect-video w-full rounded-xl object-cover" />}<p className="text-sm font-medium">{event.dataInicio}{event.startTime ? ' · '+event.startTime : ''} — {event.dataFim}</p><p className="text-sm text-muted-foreground">{event.endereco}</p><p className="whitespace-pre-wrap break-words leading-7">{event.descricao}</p>{event.user && <Link href={'/promotores/'+event.user.id} className="rounded-xl border p-4 font-semibold text-primary">Organizador: {event.user.name || 'Conhecer perfil'} →</Link>}{event.validate && <EventPublicActions eventId={event.id} ticketUrl={event.linkParaCompra} />}</ModalBody><ModalFooter><Button as={Link} href={'/eventos/'+event.id} variant="light" color="primary" isDisabled={!event.validate}>Abrir página do evento</Button><Button variant="light" onPress={onClose}>Fechar</Button></ModalFooter></ModalContent></Modal>;
}
