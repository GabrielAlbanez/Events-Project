"use client";
import React, { useState } from "react";
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
  Chip,
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

interface UserWithStatus extends UserType { online?: boolean }

interface UserTableProps {
  users: UserWithStatus[];
  setUsers: React.Dispatch<React.SetStateAction<UserWithStatus[]>>;
}

const columns = [
  { name: "Usuário", uid: "name" },
  { name: "Permissão", uid: "role" },
  { name: "Conexão", uid: "status" },
  { name: "Ações", uid: "actions" },
];

const roleLabels: Record<string, string> = { ADMIN: "Administrador", PROMOTER: "Promotor", BASIC: "Usuário" };

export const UserTable: React.FC<UserTableProps> = ({ users, setUsers }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOpenModalDelete, setIsOpenModalDelete] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [isPending, setIsPending] = useState(false);
  const socket = useSocket();

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
      const result = await deleteUser(selectedUser);
      if (result?.status !== "success") {
        toast.error(result?.message || "Não foi possível excluir o usuário.");
        return;
      }

      setUsers((prev) => prev.filter((user) => user.id !== selectedUser.id));
      handleCloseModalDelete();
      socket.emit("request-update-users");
      toast.success("Usuário excluído com sucesso.");
    } catch {
      toast.error("Não foi possível excluir o usuário.");
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

    setIsPending(true);
    try {
      const result = await alterRoleUser(user, roleSelect);
      if (result?.status !== "success") {
        toast.error(result?.message || "Não foi possível alterar a permissão.");
        return;
      }

      socket.emit("role-updated", { userId: user.id, newRole: roleSelect });

      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, role: roleSelect } : u))
      );
      toast.success("Permissão atualizada com sucesso.");
    } catch {
      toast.error("Não foi possível alterar a permissão.");
    } finally {
      setIsPending(false);
    }
  };

  const renderCell = (user: UserWithStatus, columnKey: string): React.ReactNode => {
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
          <Dropdown>
            <DropdownTrigger>
              <Button size="sm" variant="flat" isDisabled={user.role === "ADMIN" || isPending} aria-label={`Alterar permissão de ${user.name || user.email}`} endContent={user.role === "ADMIN" ? undefined : <ChevronDownIcon />}>
                {roleLabels[user.role] || user.role}
              </Button>
            </DropdownTrigger>
            <DropdownMenu aria-label={`Permissões para ${user.name || user.email}`}>
              {["ADMIN", "BASIC", "PROMOTER"].map((valor) => (
                <DropdownItem
                  key={valor}
                  isDisabled={user.role === valor}
                  onPress={() =>
                    user.role !== valor && alterRoleUserHandler(user, valor)
                  }
                >
                  {roleLabels[valor]}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
        );

      case "status":
        return (
          <Chip
            color={user.online ? "success" : "default"}
            variant="flat"
          >
            {user.online ? "Online" : "Offline"}
          </Chip>
        );

      case "actions":
        return (
          <div className="flex items-center gap-1">
            <Tooltip content="Ver eventos">
              <Button
                isIconOnly
                size="md"
                variant="light"
                aria-label={`Ver eventos de ${user.name || user.email}`}
                onPress={() => handleOpenModal(user)}
              >
                <CalendarSearch className="w-[1em]" />
              </Button>
            </Tooltip>
            <Tooltip content={user.role === "ADMIN" ? "Administradores não podem ser excluídos" : "Excluir usuário"}>
              <Button
                isIconOnly
                size="md"
                variant="light"
                aria-label={`Excluir ${user.name || user.email}`}
                isDisabled={user.role === "ADMIN"}
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
      <Table aria-label="Tabela de usuários" classNames={{ wrapper: "border border-border bg-card shadow-none overflow-x-auto", table: "min-w-[620px]" }}>
        <TableHeader columns={columns}>
          {(column) => (
            <TableColumn key={column.uid} align="start">
              {column.name}
            </TableColumn>
          )}
        </TableHeader>
        <TableBody items={users} emptyContent="Nenhum usuário corresponde aos filtros.">
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
          className="max-h-[90vh] overflow-y-auto"
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
                      key={event.id || index}
                      className="overflow-hidden rounded-xl border border-border bg-card"
                    >
                      <img
                        src={event.banner}
                        alt={event.nome}
                        className="h-36 w-full object-cover"
                      />
                      <h3 className="flex items-center gap-2 p-4 text-base font-semibold">
                        {event.nome}
                        {event.validate ? (
                          <CheckCircleIcon aria-label="Validado" className="h-5 w-5 shrink-0 text-primary" />
                        ) : (
                          <XCircleIcon aria-label="Pendente de validação" className="h-5 w-5 shrink-0 text-muted-foreground" />
                        )}
                      </h3>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-muted-foreground">
                  Nenhum evento registrado para este usuário.
                </p>
              )}
            </ModalBody>
            <ModalFooter>
              <Button onPress={handleCloseModal} variant="flat">
                Fechar
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}

      {/* Modal de Confirmação de Exclusão */}
      <Modal isOpen={isOpenModalDelete} onClose={handleCloseModalDelete}>
        <ModalContent>
          <ModalHeader>
            Excluir usuário
          </ModalHeader>
          <ModalBody>
            {selectedUser && (
              <div className="flex flex-col items-center justify-center gap-4 text-center">
                <img
                  src={
                    selectedUser.image
                      ? selectedUser.image
                      : determineDefaultAvatar(selectedUser.name)
                  }
                  alt={selectedUser.name}
                  className="h-20 w-20 rounded-full object-cover"
                />
                <p className="text-sm text-foreground">
                  Deseja excluir <strong>{selectedUser.name || selectedUser.email}</strong>? Esta ação não pode ser desfeita.
                </p>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
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
