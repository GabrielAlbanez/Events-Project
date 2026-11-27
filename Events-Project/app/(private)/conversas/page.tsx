import type { Metadata } from "next";
import PartyInboxScreen from "@/components/MyComponents/PartyInbox";
export const metadata: Metadata = { title: "Conversas" };
export default function ConversationsPage() { return <PartyInboxScreen />; }
