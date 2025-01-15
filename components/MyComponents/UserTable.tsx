"use client";
import React, { use, useState } from "react";
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
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  DropdownTrigger,
  Dropdown,
  DropdownMenu,
  DropdownItem,
} from "@nextui-org/react";
import { CalendarSearch } from "lucide-react";
import { ChevronDownIcon, DeleteIcon } from "@/components/icons";
import { User as UserType } from "@/types";
import { determineDefaultAvatar } from "@/utils/avatarUtils";
import axios from "axios";
import { toast } from "react-toastify";
import deleteUser from "@/app/(actions)/deleteUser/action";

interface UserTableProps {
  users: UserType[];
  setUsers: React.Dispatch<React.SetStateAction<UserType[]>>;
  onOpenModal: (user: UserType) => void;
  onOpenDeleteModal: (user: UserType) => void;
}

const columns = [
  { name: "id", uid: "id" },
  { name: "Name", uid: "name" },
  { name: "Role", uid: "role" },
  { name: "Actions", uid: "actions" },
];

export const UserTable: React.FC<UserTableProps> = ({ users, setUsers }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOpenModalDelete, setIsOpenModalDelete] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [isPending, setIsPending] = useState(false);

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
      toast.error("Este usuário não pode ser excluído.", {
        theme: "colored",
      });
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
      handleCloseModalDelete();
    } finally {
      setIsPending(false);
    }
  };

  const valuesDropwdown = ["ADMIN", "BASIC", "PROMOTER", "GUEST"];

  const renderCell = (user: UserType, columnKey: string) => {
    const cellValue = user[columnKey as keyof UserType];
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
              {valuesDropwdown.map((valor) => (
                <DropdownItem onPress={() => console.log(valor)} key={valor}>
                  {user.role === valor ? (
                    <p className="text-green-400">{valor}</p>
                  ) : (
                    <p>{valor}</p>
                  )}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
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
        return cellValue;
    }
  };

  return (
    <>
      <Table aria-label="Tabela de usuários">
        <TableHeader columns={columns}>
          {(column) => (
            <TableColumn
              key={column.uid}
              align={
                column.uid === "role" || column.uid === "actions"
                  ? "center"
                  : "start"
              }
            >
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

      {/* Modal de Confirmação de Exclusão */}
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
                  className="rounded-full w-32 h-32"
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
