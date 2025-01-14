"use client";
import { useSession } from "next-auth/react";
import React, { useEffect, useState, useCallback, useTransition } from "react";
import "react-toastify/dist/ReactToastify.css";
import axios from "axios";

import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  User,
  Chip,
  Tooltip,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@nextui-org/react";
import {
  PlusIcon,
  SearchIcon,
  ChevronDownIcon,
  DeleteIcon,
} from "@/components/icons";
import { toast, ToastContainer } from "react-toastify";
import { useRouter } from "next/navigation";
import { CalendarSearch } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: string | null;
  image: string;
  role: string;
  Events: any[]; // Ajuste conforme a estrutura dos eventos
}

interface ApiResponse {
  status: string;
  data?: User[];
}

const defaultAvatarFemale =
  "https://cdnb.artstation.com/p/assets/images/images/042/809/195/large/mace-tan-mace-kayle-fanart-finaledit.jpg?1635490851";
const defaultAvatarMale = "https://pbs.twimg.com/media/Dtv9ICMWsAE-tz9.jpg";

const determineDefaultAvatar = (username: string) => {
  const isFemale = ["a", "e", "i", "y"].includes(
    username[username.length - 1].toLowerCase()
  );
  return isFemale ? defaultAvatarFemale : defaultAvatarMale;
};

const columns = [
  { name: "ID", uid: "id" },
  { name: "NAME", uid: "name" },
  { name: "EMAIL", uid: "email" },
  { name: "ROLE", uid: "role" },
  { name: "ACTIONS", uid: "actions" },
];

const Admin: React.FC = () => {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterValue, setFilterValue] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isOpenModalDelete, setIsOpenModalDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  const fetchUsers = async () => {
    try {
      const res = await axios.get<ApiResponse>("/api/dataAllUser");
      setUsers(res.data?.data || []);
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar os dados. Tente novamente mais tarde.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status !== "loading" && session?.user) {
      fetchUsers();
    } else if (status !== "loading" && session?.user?.role !== "ADMIN") {
      router.push("/login");
    }
  }, [session, status, router]);

  const handleStatusFilterChange = (key: string) => {
    console.log("key" , key)
    setStatusFilter(key);
  };

  const filteredUsers = users.filter((user) => {
    if (statusFilter !== "all" && user.role !== statusFilter) return false;
    if (
      filterValue &&
      !user.name.toLowerCase().includes(filterValue.toLowerCase())
    )
      return false;
    return true;
  });

  const handleCloseRegisterModal = () => setIsRegisterModalOpen(false);
  const handleOpenModalDelete = (user: User) => {
    setSelectedUser(user);
    setIsOpenModalDelete(true);
  };

  const handleCloseModalDelete = () => {
    setIsOpenModalDelete(false);
    setSelectedUser(null);
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    if (selectedUser?.role === "ADMIN") {
      toast.error("Este usuário não pode ser excluído.", {
        theme: "colored",
      });
      handleCloseModalDelete();
      return;

    }

    startTransition(() => {
      toast
        .promise(
          async () => await axios.delete(`/api/deleteUser/${selectedUser.id}`),
          {
            pending: "Excluindo usuário...",
            success: "Usuário excluído com sucesso!",
            error: "Erro ao excluir usuário.",
          }
        )
        .then(() => {
          setUsers((prev) =>
            prev.filter((user) => user.id !== selectedUser.id)
          );
          handleCloseModalDelete();
        })
        .catch((error) => {
          handleCloseModalDelete();
          console.error("Erro ao excluir usuário:", error);
        });
    });
  };

  const handleOpenModal = (user: User) => {
    setSelectedUser(user);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedUser(null);
  };

  const renderCell = useCallback((user: User, columnKey: string) => {
    const cellValue = user[columnKey as keyof User];
    switch (columnKey) {
      case "name":
        const avatarSrc = user?.image
          ? user.image
          : determineDefaultAvatar(user.name);
        return (
          <User
            avatarProps={{
              radius: "lg",
              src: avatarSrc,
            }}
            name={user.name}
            description={user.email}
          />
        );
      case "role":
        return <p className="capitalize">{user.role}</p>;

      case "actions":
        return (
          <div className="flex gap-2">
            <Tooltip content="Eventos">
              <Button
                isIconOnly
                size="sm"
                variant="light"
                onPress={() => handleOpenModal(user)}
              >
                <CalendarSearch className="w-[1em]" />
              </Button>
            </Tooltip>
            <Tooltip content="Excluir">
              <Button
                isIconOnly
                size="sm"
                variant="light"
                onPress={() => handleOpenModalDelete(user)}
                color="danger"
              >
                <DeleteIcon />
              </Button>
            </Tooltip>
          </div>
        );
      default:
        return cellValue;
    }
  }, []);

  const topContent = (
    <div className="flex rounded-xl flex-wrap justify-between items-center gap-4 px-4 py-4 border-default-200 border-[1px] mb-4">
      <Input
        placeholder="Search by name.."
        startContent={<SearchIcon />}
        value={filterValue}
        onChange={(e) => setFilterValue(e.target.value)}
        className="w-full md:w-1/2"
      />
      <Dropdown>
        <DropdownTrigger>
          <Button endContent={<ChevronDownIcon />}>Filter by Roles</Button>
        </DropdownTrigger>
        <DropdownMenu>
          <DropdownItem
            onClick={() => handleStatusFilterChange("all")}
            key="All"
          >
            All
          </DropdownItem>
          <DropdownItem
            onClick={() => handleStatusFilterChange("ADMIN")}
            key="Admin"
          >
            Admin
          </DropdownItem>
          <DropdownItem
            onClick={() => handleStatusFilterChange("PROMOTER")}
            key="promoter"
          >
            PROMOTER
          </DropdownItem>

          <DropdownItem
            onClick={() => handleStatusFilterChange("BASIC")}
            key="basic"
          >
            BASIC
          </DropdownItem>
          <DropdownItem
            onClick={() => handleStatusFilterChange("GUEST")}
            key="guest"
          >
            GUEST
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>
    </div>
  );

  if (loading) return <p>Carregando...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div className="overflow-x-auto w-full h-full flex flex-col  items-center justify-start pt-12">
      <ToastContainer position="bottom-right" autoClose={5000} />
      {topContent}
      <Table aria-label="Tabela de usuários">
        <TableHeader columns={columns}>
          {(column) => (
            <TableColumn
              key={column.uid}
              align={column.uid === "actions" ? "center" : "start"}
            >
              {column.name}
            </TableColumn>
          )}
        </TableHeader>
        <TableBody items={filteredUsers}>
          {(item) => (
            <TableRow key={item.id}>
              {(columnKey) => (
                <TableCell>{renderCell(item, columnKey as string)}</TableCell>
              )}
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Modals */}

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        className="max-h-screen overflow-y-auto"
      >
        <ModalContent>
          <ModalHeader>
            <div className="flex items-center gap-3">
              <User
                avatarProps={{
                  src: selectedUser?.image
                    ? selectedUser.image
                    : determineDefaultAvatar(selectedUser?.name || "User"),
                  size: "lg",
                }}
                name={selectedUser?.name}
                description={selectedUser?.email}
              />
            </div>
          </ModalHeader>
          <ModalBody>
            {selectedUser?.Events && selectedUser.Events.length > 0 ? (
              <Table aria-label="Tabela de Eventos do Usuário">
                <TableHeader>
                  <TableColumn>Data</TableColumn>
                  <TableColumn>Tipo</TableColumn>
                  <TableColumn>Pontos</TableColumn>
                </TableHeader>
                <TableBody>
                  {selectedUser.Events.map((event, index) => (
                    <TableRow key={index}>
                      <TableCell>{`${event.dia}/${event.mes}`}</TableCell>
                      <TableCell>{event.tipoEvento}</TableCell>
                      <TableCell>{event.pontos}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-gray-500">
                Nenhum evento registrado para este usuário.
              </p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button onPress={handleCloseModal} color="danger">
              Fechar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <Modal isOpen={isOpenModalDelete} onClose={handleCloseModalDelete}>
        <ModalContent>
          <ModalHeader className="flex justify-center items-center">
            Confirmação de Exclusão
          </ModalHeader>
          <ModalBody>
            {selectedUser && (
              <div className="flex flex-col items-center justify-center gap-4">
                <img
                  src={
                    selectedUser.image
                      ? selectedUser.image
                      : determineDefaultAvatar(selectedUser.name)
                  }
                  alt={selectedUser.name}
                  className="rounded-full w-24 h-24"
                />
                <p className="text-lg font-semibold">
                  Deseja excluir o usuário {selectedUser.name}?
                </p>
              </div>
            )}
          </ModalBody>
          <ModalFooter className="flex items-center justify-center">
            <Button
              onPress={handleCloseModalDelete}
              color="primary"
              variant="flat"
            >
              Cancelar
            </Button>
            <Button
              onPress={handleDeleteUser}
              color="danger"
              isDisabled={isPending}
            >
              {isPending ? "Excluindo..." : "Confirmar"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default Admin;
