"use client";
import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { FilterBar } from "@/components/MyComponents/FilterBar";
import { UserTable } from "@/components/MyComponents/UserTable";
import { User as UserType } from "@/types";
import { ToastContainer } from "react-toastify";
import { useSocket } from "@/context/SocketContext"; // 📌 Importando o contexto do WebSocket

const AdminPage: React.FC = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const socket = useSocket(); // 📡 WebSocket Context

  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterValue, setFilterValue] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // 📡 Buscar usuários iniciais da API
  const fetchUsers = async () => {
    try {
      const res = await axios.get("/api/dataAllUser");
      const data = res.data as { data: UserType[] };
      setUsers(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar os dados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status !== "loading" && session?.user?.role === "ADMIN") {
      fetchUsers();
    } else if (status !== "loading") {
      router.push("/login");
    }
  }, [session, status, router,socket]);

  // 📡 Atualização em tempo real via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleUpdateUsers = (updatedUsers: UserType[]) => {
      console.log("📡 Atualização via WebSocket:", updatedUsers);
      setUsers(updatedUsers); // Atualiza a lista de usuários
    };

    socket.on("update-users", handleUpdateUsers);

    return () => {
      socket.off("update-users", handleUpdateUsers);
    };
  }, [socket]);

  // 🔍 Aplicar filtros de busca
  const filteredUsers = users.filter((user) => {
    if (statusFilter !== "all" && user.role !== statusFilter) return false;
    if (
      filterValue &&
      !user.name.toLowerCase().includes(filterValue.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  if (loading) return <p>Carregando...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div className="overflow-x-auto w-full h-full px-12 flex flex-col items-center justify-start pt-12">
      <ToastContainer position="bottom-right" autoClose={5000} />
      <FilterBar
        filterValue={filterValue}
        onFilterChange={setFilterValue}
        onStatusChange={setStatusFilter}
      />
      <UserTable
        users={filteredUsers}
        setUsers={setUsers}

      />
    </div>
  );
};

export default AdminPage;
