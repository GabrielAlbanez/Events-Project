"use client";
import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { FilterBar } from "@/components/MyComponents/FilterBar";
import { UserTable } from "@/components/MyComponents/UserTable";
import { User as UserType } from "@/types";
import { ToastContainer, toast } from "react-toastify";
import { useSocket } from "@/context/SocketContext";
import CustomLoading from "@/components/MyComponents/CustomLoading";

interface UserWithStatus extends UserType {
  online?: boolean;
}

const AdminPage: React.FC = () => {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const socket = useSocket();

  const [users, setUsers] = useState<UserWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterValue, setFilterValue] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // 📡 Buscar usuários iniciais da API
  const fetchUsers = async () => {
    try {
      const res = await axios.get("/api/dataAllUser");
      const data = res.data as { data: UserType[] };
      const usersWithStatus = Array.isArray(data.data)
        ? data.data.map((u) => ({ ...u, online: false }))
        : [];
      setUsers(usersWithStatus);
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar os dados.");
    } finally {
      setLoading(false);
    }
  };

  // 🔑 Verifica sessão e busca usuários
  useEffect(() => {
    if (status !== "loading" && session?.user?.role === "ADMIN") {
      fetchUsers();
    } else if (status !== "loading") {
      router.push("/login");
    }
  }, [session, status, router]);

  // 📡 WebSocket: usuários online + atualização de role + lista completa
  useEffect(() => {
    if (!socket || !session) return;

    // Atualiza lista completa de usuários
    const handleUpdateUsers = (updatedUsers: UserType[]) => {
      setUsers((prev) =>
        updatedUsers.map((u) => {
          const existing = prev.find((p) => p.id === u.id);
          return { ...u, online: existing?.online ?? false };
        })
      );
    };

    // Atualiza usuários online
    const handleActiveUsers = (activeUserIds: string[]) => {
      setUsers((prev) =>
        prev.map((user) => ({
          ...user,
          online: activeUserIds.includes(user.id),
        }))
      );
    };

    // Atualiza role do usuário
    const handleRoleChange = ({ newRole }: { newRole: string }) => {
      toast.success(`Sua role agora é ${newRole}`);
      update(); // Atualiza sessão
    };

    // Registrar eventos
    socket.on("update-users", handleUpdateUsers);
    socket.on("active-users", handleActiveUsers);
    socket.on("role-mudar", handleRoleChange);

    // Registra usuário no servidor
    socket.emit("register-user", session.user.id);

    // Solicita lista inicial de usuários online
    socket.emit("request-active-users");

    // Notifica servidor ao fechar a aba
    const handleBeforeUnload = () => {
      socket.emit("user-disconnected", session.user.id);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      socket.off("update-users", handleUpdateUsers);
      socket.off("active-users", handleActiveUsers);
      socket.off("role-mudar", handleRoleChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [socket, session, update]);

  // 🔍 Aplicar filtros de busca
  const filteredUsers = users.filter((user) => {
    if (statusFilter !== "all" && user.role !== statusFilter) return false;
    if (filterValue && !user.name.toLowerCase().includes(filterValue.toLowerCase()))
      return false;
    return true;
  });

  if (loading) return <CustomLoading />;
  if (error) return <p>{error}</p>;

  return (
    <div className="overflow-x-auto w-full h-full px-12 flex flex-col items-center justify-start pt-12">
      <ToastContainer position="bottom-right" autoClose={5000} />
      <FilterBar
        filterValue={filterValue}
        onFilterChange={setFilterValue}
        onStatusChange={setStatusFilter}
      />
      <UserTable users={filteredUsers} setUsers={setUsers} />
    </div>
  );
};

export default AdminPage;
