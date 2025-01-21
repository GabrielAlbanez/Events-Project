"use client";
import React, { useState, useEffect, useTransition } from "react";
import { useSession } from "next-auth/react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { FilterBar } from "@/components/MyComponents/FilterBar";
import { UserTable } from "@/components/MyComponents/UserTable";
import { User as UserType } from "@/types";
import { ToastContainer, toast } from "react-toastify";

const AdminPage: React.FC = () => {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterValue, setFilterValue] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isPending, startTransition] = useTransition();

  const fetchUsers = async () => {
    try {
      const res = await axios.get("/api/dataAllUser");
      console.log("Fetched Users:", res.data);
      const data = res.data as { data: UserType[] };
      setUsers(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar os dados. Tente novamente mais tarde.");
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
  }, [session, status, router]);

  const handleFilterChange = (value: string) => setFilterValue(value);

  const handleStatusChange = (status: string) => setStatusFilter(status);

  const filteredUsers = users.filter((user) => {
    if (statusFilter !== "all" && user.role !== statusFilter) return false;
    if (
      filterValue &&
      !user.name.toLowerCase().includes(filterValue.toLowerCase())
    )
      return false;
    return true;
  });

  if (loading) return <p>Carregando...</p>;
  if (error) return <p>{error}</p>;

  console.log("Filtered Users:", filteredUsers);

  return (
    <div className="overflow-x-auto  w-full h-full px-12 flex flex-col items-center justify-start pt-12">
      <ToastContainer position="bottom-right" autoClose={5000} />
      <FilterBar
        filterValue={filterValue}
        onFilterChange={handleFilterChange}
        onStatusChange={handleStatusChange}
      />
      <UserTable
        users={filteredUsers}
        setUsers={setUsers}
        onOpenModal={(user : UserType) => console.log("Open Modal", user)}
        onOpenDeleteModal={(user : UserType) => console.log("Open Delete Modal", user)}
      />
    </div>
  );
};

export default AdminPage;
