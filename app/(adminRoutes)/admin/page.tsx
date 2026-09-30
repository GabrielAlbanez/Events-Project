"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { UsersRound } from "lucide-react";
import { FilterBar } from "@/components/MyComponents/FilterBar";
import { UserTable } from "@/components/MyComponents/UserTable";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useSocket, useSocketStatus } from "@/context/SocketContext";
import { User as UserType } from "@/types";

interface UserWithStatus extends UserType { online?: boolean }

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const socket = useSocket();
  const socketConnected = useSocketStatus();
  const [users, setUsers] = useState<UserWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterValue, setFilterValue] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get<{ status: string; data?: UserType[] }>("/api/dataAllUser");
      if (response.data.status !== "success" || !Array.isArray(response.data.data)) throw new Error("Invalid response");
      const loadedUsers = response.data.data;
      setUsers((previous) => loadedUsers.map((user) => ({
        ...user,
        online: previous.find((item) => item.id === user.id)?.online ?? false,
      })));
    } catch {
      setError("Não foi possível carregar os usuários. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (session?.user?.role !== "ADMIN") {
      router.replace("/login");
      return;
    }
    void fetchUsers();
  }, [fetchUsers, router, session?.user?.role, status]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const handleUpdateUsers = () => void fetchUsers();
    const handleActiveUsers = (activeUserIds: string[]) => {
      setUsers((previous) => previous.map((user) => ({ ...user, online: activeUserIds.includes(user.id) })));
    };
    const handleConnect = () => {
      void fetchUsers();
      socket.emit("request-active-users");
    };
    const handleDisconnect = () => setUsers((previous) => previous.map((user) => ({ ...user, online: false })));
    socket.on("update-users", handleUpdateUsers);
    socket.on("active-users", handleActiveUsers);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    if (socket.connected) socket.emit("request-active-users");
    return () => {
      socket.off("update-users", handleUpdateUsers);
      socket.off("active-users", handleActiveUsers);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, [socket, session?.user?.id, fetchUsers]);

  const filteredUsers = useMemo(() => users.filter((user) => {
    if (roleFilter !== "all" && user.role !== roleFilter) return false;
    const query = filterValue.trim().toLocaleLowerCase("pt-BR");
    return !query || (user.name || "").toLocaleLowerCase("pt-BR").includes(query) || (user.email || "").toLocaleLowerCase("pt-BR").includes(query);
  }), [filterValue, roleFilter, users]);
  const countAdmin = users.filter((user) => user.role === "ADMIN").length;
  const countPromoters = users.filter((user) => user.role === "PROMOTER").length;

  if (status === "loading" || status !== "authenticated" || session?.user?.role !== "ADMIN") {
    return <main className="flex flex-1 items-center justify-center p-6"><p role="status" className="text-muted-foreground">Preparando painel de usuários...</p></main>;
  }

  return (
    <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex items-start gap-4"><SidebarTrigger className="mt-1 shrink-0" /><div><p className="mb-2 text-sm font-semibold uppercase tracking-widest text-primary">Administração</p><h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight sm:text-4xl"><UsersRound className="h-8 w-8 text-primary" aria-hidden="true" /> Usuários</h1><p className="mt-2 text-muted-foreground">Encontre contas, consulte eventos e gerencie permissões.</p></div></header>

        <div className="mb-6 grid gap-3 sm:grid-cols-3" aria-label="Resumo de usuários">
          <SummaryCard label="Usuários cadastrados" value={users.length} />
          <SummaryCard label="Administradores" value={countAdmin} />
          <SummaryCard label="Promotores" value={countPromoters} />
        </div>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6" aria-label="Lista de usuários">
          {!socketConnected && <p role="status" className="mb-4 rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">Conexão em tempo real indisponível. A lista pode estar desatualizada.</p>}
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-xl font-semibold">Lista de usuários</h2><p className="mt-1 text-sm text-muted-foreground">{loading ? "Carregando usuários..." : `${filteredUsers.length} de ${users.length} usuários`}</p></div><Button type="button" variant="outline" disabled={loading} onClick={() => void fetchUsers()}>Atualizar lista</Button></div>
          <FilterBar filterValue={filterValue} onFilterChange={setFilterValue} statusValue={roleFilter} onStatusChange={setRoleFilter} />
          {loading ? <div role="status" className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">Carregando usuários...</div> : error ? <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-8 text-center"><p className="text-sm text-foreground">{error}</p><Button type="button" className="mt-4" onClick={() => void fetchUsers()}>Tentar novamente</Button></div> : <UserTable users={filteredUsers} setUsers={setUsers} />}
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-primary">{value}</p></div>;
}
