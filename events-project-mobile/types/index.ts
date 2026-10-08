export * from './eventChat';
export * from './partyConnections';
export * from './community';
export * from './activity';
export type Role = 'BASIC' | 'PROMOTER' | 'ADMIN';
export type EventStatus = 'DRAFT' | 'PENDING' | 'CHANGES_REQUESTED' | 'PUBLISHED' | 'CANCELLED' | 'ENDED';
export interface PublicPerson { id: string; name: string | null; image: string | null }
export interface Impersonation { id: string; adminId: string; adminName: string; userName: string; expiresAt: string }
export interface User extends PublicPerson { impersonation?: Impersonation; email: string | null; role: Role; provider?: string; bio?: string; contactUrl?: string; suspendedAt?: string | null; suspendedUntil?: string | null; suspensionReason?: string | null }
export interface Evento { id: string; nome: string; banner: string; carrossel: string[]; descricao: string; dataInicio: string; dataFim: string; endereco: string; linkParaCompra: string; user: PublicPerson | null; userId?: string | null; validator: PublicPerson | null; validate: boolean; status?: EventStatus; category?: string; isFree?: boolean; priceCents?: number; capacity?: number | null; lat?: number | null; lng?: number | null; startTime?: string | null; endTime?: string | null; timezone?: string; reviewNote?: string | null; views?: number; ticketClicks?: number; favoriteCount?: number }
export interface NotificationDTO { id: string; title: string; message: string; href: string; readAt: string | null; createdAt: string }
export interface LoginResult { token: string; expiresAt: string; user: User; impersonation?: Impersonation }
export interface Registration { id: string; status: 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED' | 'CHECKED_IN'; checkedInAt?: string | null }
export interface EventInput { nome: string; banner: string; carrossel: string[]; descricao: string; dataInicio: string; dataFim: string; endereco: string; linkParaCompra: string; category: string; isFree: boolean; priceCents: number; capacity?: number | null; lat?: number | null; lng?: number | null; startTime?: string | null; endTime?: string | null; timezone?: string; status?: EventStatus }
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export interface MediaAsset { uri: string; fileName?: string | null; mimeType?: string | null; fileSize?: number }

