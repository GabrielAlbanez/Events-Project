"use client";
import React, { useState, useEffect } from "react";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  User,
  Tooltip,
  Button,
  Chip, // 🔹 Componente para status ativo/inativo
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  DropdownTrigger,
  Dropdown,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";
import { CalendarSearch, CheckCircleIcon, XCircleIcon } from "lucide-react";
import { ChevronDownIcon, DeleteIcon } from "@/components/icons";
import { Evento, User as UserType } from "@/types";
import { determineDefaultAvatar } from "@/utils/avatarUtils";
import { toast } from "react-toastify";
import deleteUser from "@/app/(actions)/deleteUser/action";
import alterRoleUser from "@/app/(actions)/alterRoleUser/action";
import { useSocket } from "@/context/SocketContext";

interface UserTableProps {
  users: UserType[];
  setUsers: React.Dispatch<React.SetStateAction<UserType[]>>;
}

const columns = [
  { name: "ID", uid: "id" },
  { name: "Name", uid: "name" },
  { name: "Role", uid: "role" },
  { name: "Status", uid: "status" }, // 🔹 Nova coluna de status ativo/inativo
  { name: "Actions", uid: "actions" },
];

export const UserTable: React.FC<UserTableProps> = ({ users, setUsers }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOpenModalDelete, setIsOpenModalDelete] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [activeUsers, setActiveUsers] = useState<string[]>([]); // 🔹 Estado para armazenar usuários ativos

  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;

    socket.emit("request-active-users"); // 🔹 Solicita a lista de usuários ativos

    socket.on("active-users", (users: string[]) => {
      setActiveUsers(users);
    });

    return () => {
      socket.off("active-users");
    };
  }, [socket]);

  const isUserActive = (userId: string) => activeUsers.includes(userId);

  const handleOpenModal = (user: UserType) => {
    setSelectedUser(user);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedUser(null);
  };

  const handleOpenDeleteModal = (user: UserType) => {
    setSelectedUser(user);
    setIsOpenModalDelete(true);
  };

  const handleCloseModalDelete = () => {
    setIsOpenModalDelete(false);
    setSelectedUser(null);
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    if (selectedUser.role === "ADMIN") {
      toast.error("Este usuário não pode ser excluído.", { theme: "colored" });
      handleCloseModalDelete();
      return;
    }

    setIsPending(true);

    try {
      await toast.promise(deleteUser(selectedUser), {
        pending: "Excluindo usuário...",
        success: "Usuário deletado com sucesso!",
        error: "Erro ao deletar usuário.",
      });

      setUsers((prev) => prev.filter((user) => user.id !== selectedUser.id));
      handleCloseModalDelete();
    } catch (error) {
      console.error("Erro ao excluir usuário:", error);
    } finally {
      setIsPending(false);
    }
  };

  const alterRoleUserHandler = async (user: UserType, roleSelect: string) => {
    if (user.role === "ADMIN") {
      toast.error("Este usuário não pode ter seu papel alterado.", {
        theme: "colored",
      });
      return;
    }

    try {
      await toast.promise(alterRoleUser(user, roleSelect), {
        pending: "Alterando papel do usuário...",
        success: "Papel do usuário alterado com sucesso!",
        error: "Erro ao alterar papel do usuário.",
      });

      if (socket?.connected) {
        socket.emit("role-updated", { userId: user.id, newRole: roleSelect });
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, role: roleSelect } : u))
      );
    } catch (error) {
      console.error("Erro ao alterar papel do usuário:", error);
    }
  };

  const renderCell = (user: UserType, columnKey: string): React.ReactNode => {
    switch (columnKey) {
      case "name":
        return (
          <User
            avatarProps={{
              radius: "lg",
              src: user.image || determineDefaultAvatar(user.name),
            }}
            name={user.name}
            description={user.email}
          />
        );

      case "role":
        return (
          <Dropdown className="flex flex-col items-center justify-center">
            <DropdownTrigger>
              <Button endContent={<ChevronDownIcon />}>
                <p className="text-sm">{user.role}</p>
              </Button>
            </DropdownTrigger>
            <DropdownMenu>
              {["ADMIN", "BASIC", "PROMOTER"].map((valor) => (
                <DropdownItem
                  key={valor}
                  className={
                    user.role === valor ? "text-green-400 opacity-45" : ""
                  }
                  onPress={() =>
                    user.role !== valor && alterRoleUserHandler(user, valor)
                  }
                >
                  {valor}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
        );

      case "status":
        return (
          <Chip
            color={isUserActive(user.id) ? "success" : "danger"} // 🔹 Verde se ativo, vermelho se inativo
            variant="flat"
          >
            {isUserActive(user.id) ? "Active" : "Inactive"}
          </Chip>
        );

      case "actions":
        return (
          <div className="flex gap-2 items-center justify-center">
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
                onPress={() => handleOpenDeleteModal(user)}
                color="danger"
              >
                <DeleteIcon />
              </Button>
            </Tooltip>
          </div>
        );

      default:
        return user[columnKey as keyof UserType]?.toString() || "";
    }
  };

  return (
    <>
      <Table aria-label="Tabela de usuários">
        <TableHeader columns={columns}>
          {(column) => (
            <TableColumn key={column.uid} align="start">
              {column.name}
            </TableColumn>
          )}
        </TableHeader>
        <TableBody items={users}>
          {(item) => (
            <TableRow key={item.id}>
              {(columnKey) => (
                <TableCell>{renderCell(item, columnKey as string)}</TableCell>
              )}
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Modal de Eventos */}
      {selectedUser && (
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
                    src:
                      selectedUser.image ||
                      determineDefaultAvatar(selectedUser.name),
                    size: "lg",
                  }}
                  name={selectedUser.name}
                  description={selectedUser.email}
                />
              </div>
            </ModalHeader>
            <ModalBody>
              {selectedUser.Events && selectedUser.Events.length > 0 ? (
                <div className=" w-full grid grid-cols-1 gap-4">
                  {selectedUser.Events.map((event: Evento, index: number) => (
                    <div
                      key={index}
                      className="border rounded-lg p-4 shadow-md"
                    >
                      <img
                        src={event.banner}
                        alt={event.nome}
                        className="w-full h-32 object-cover rounded-t-md mb-2"
                      />
                      <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
                        {event.nome}
                        {event.validate ? (
                          <CheckCircleIcon className="w-5 h-5 text-green-500" />
                        ) : (
                          <XCircleIcon className="w-5 h-5 text-red-500" />
                        )}
                      </h3>
                    </div>
                  ))}
                </div>
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
      )}

      {/* Modal de Confirmação de Exclusão */}
      <Modal isOpen={isOpenModalDelete} onClose={handleCloseModalDelete}>
        <ModalContent>
          <ModalHeader className="flex justify-center items-center">
            Confirmação de Exclusão
          </ModalHeader>
          <ModalBody>
            {selectedUser && (
              <div className="flex flex-col items-center justify-center gap-4 ">
                <img
                  src={
                    selectedUser.image
                      ? selectedUser.image
                      : determineDefaultAvatar(selectedUser.name)
                  }
                  alt={selectedUser.name}
                  className="rounded-full w-32 h-32 object-cover"
                />
                <p className="text-lg">
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
    </>
  );
};
