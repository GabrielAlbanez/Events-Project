"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { profileMediaUrl } from "@/lib/profileMediaUrl";
import { ProfileAvatar } from "@/components/MyComponents/ProfileAvatar";
import { toast } from "react-toastify";
import deleteUser from "@/app/(actions)/deleteUser/action";
import alterRoleUser from "@/app/(actions)/alterRoleUser/action";
import { useSession } from "next-auth/react";
import { useSocket } from "@/context/SocketContext";

interface UserWithStatus extends UserType { online?: boolean; suspendedAt?: string | null; suspendedUntil?: string | null; suspensionReason?: string | null }
const isSuspended = (user: UserWithStatus) => Boolean(user.suspendedAt && (!user.suspendedUntil || new Date(user.suspendedUntil).getTime() > Date.now()));

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
  const [enteringUserId, setEnteringUserId] = useState<string | null>(null);
  const [accessUser, setAccessUser] = useState<UserWithStatus | null>(null);
  const [accessAction, setAccessAction] = useState<"impersonate" | "suspend" | "resume">("impersonate");
  const [accessReason, setAccessReason] = useState("");
  const [accessUntil, setAccessUntil] = useState("");
  const [accessError, setAccessError] = useState("");
  const [accessPending, setAccessPending] = useState(false);
  const socket = useSocket();

  const { data: session } = useSession();
  const [userEvents, setUserEvents] = useState<Evento[]>([]);
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState("");
  const [eventsMore, setEventsMore] = useState(false);
  const eventsRequest = useRef<AbortController | null>(null);
  const identity = useRef(session?.user?.id);
  identity.current = session?.user?.id;
  const loadEvents = useCallback(async (page: number) => {
    if (!selectedUser || !isModalOpen) return;
    eventsRequest.current?.abort();
    const controller = new AbortController(); eventsRequest.current = controller;
    const account = identity.current;
    setEventsLoading(true); setEventsError("");
    try {
      const response = await fetch(`/api/admin/users/${selectedUser.id}/events?page=${page}`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error();
      const result: { events: Evento[]; hasMore: boolean } = await response.json();
      if (controller.signal.aborted || account !== identity.current) return;
      setUserEvents(previous => page === 1 ? result.events : [...previous, ...result.events.filter(event => !previous.some(item => item.id === event.id))]);
      setEventsMore(result.hasMore); setEventsPage(page);
    } catch { if (!controller.signal.aborted && account === identity.current) setEventsError("Não foi possível carregar os eventos desta conta."); }
    finally { if (!controller.signal.aborted && account === identity.current) setEventsLoading(false); }
  }, [selectedUser, isModalOpen]);
  useEffect(() => {
    setUserEvents([]); setEventsPage(1); setEventsMore(false); setEventsError("");
    if (isModalOpen) void loadEvents(1);
    return () => eventsRequest.current?.abort();
  }, [isModalOpen, loadEvents, session?.user?.id]);

  const handleOpenModal = (user: UserType) => {
    setSelectedUser(user);
    setIsModalOpen(true);
  };

  const enterAsUser = async (user: UserType, reason: string) => {
    if (enteringUserId || session?.user?.role !== "ADMIN" || user.role === "ADMIN" || user.id === session.user.id) return;
    setEnteringUserId(user.id);
    setAccessError("");
    try {
      const response = await fetch("/api/admin/impersonation/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, reason }),
      });
      const result: { ok?: boolean; error?: string } = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Não foi possível entrar nesta conta.");
      // A full navigation discards cached data and reconnects with the new signed session.
      window.location.assign("/");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Não foi possível entrar nesta conta.";
      setAccessError(message);
      toast.error(message);
      setEnteringUserId(null);
    }
  };

  const openAccess = (user: UserWithStatus, action: typeof accessAction) => {
    setAccessUser(user); setAccessAction(action); setAccessReason(""); setAccessUntil(""); setAccessError("");
  };
  const confirmAccess = async () => {
    if (!accessUser || accessPending) return;
    const reason = accessReason.trim();
    if (reason.length < 5 || reason.length > 500) { setAccessError("Descreva o motivo em 5 a 500 caracteres."); return; }
    if (accessAction === "impersonate") { await enterAsUser(accessUser, reason); return; }
    const until = accessUntil ? new Date(accessUntil) : null;
    if (until && (!Number.isFinite(until.getTime()) || until.getTime() <= Date.now())) { setAccessError("Escolha uma data futura."); return; }
    setAccessPending(true); setAccessError("");
    try {
      const response = await fetch(`/api/admin/users/${accessUser.id}/suspension`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: accessAction, reason, until: accessAction === "suspend" ? until?.toISOString() ?? null : null }) });
      const result: { error?: string; suspension?: { suspendedAt: string | null; suspendedUntil: string | null; suspensionReason: string | null; active: boolean } } = await response.json();
      if (!response.ok || !result.suspension) throw new Error(result.error || "Não foi possível atualizar o acesso.");
      const suspension = result.suspension;
      setUsers(previous => previous.map(user => user.id === accessUser.id ? { ...user, ...suspension, online: suspension.active ? false : user.online } : user));
      setAccessUser(null); socket.emit("request-update-users");
      toast.success(accessAction === "suspend" ? "Conta suspensa. As sessões serão encerradas." : "Acesso restaurado. A pessoa poderá entrar novamente.");
    } catch (error: unknown) { setAccessError(error instanceof Error ? error.message : "Não foi possível atualizar o acesso."); }
    finally { setAccessPending(false); }
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
    if (isPending) return;
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

  const renderCell = (user: UserWithStatus, columnKey: string, mobile = false): React.ReactNode => {
    switch (columnKey) {
      case "name":
        return (
          <User
            avatarProps={{
              radius: "lg",
              src: profileMediaUrl(user.image) || determineDefaultAvatar(user.name),
              showFallback: true,
              fallback: <ProfileAvatar name={user.name} size={40} className="h-full w-full rounded-lg" />,
              imgProps: { referrerPolicy: "no-referrer" },
            }}
            name={user.name}
            description={user.email}
          />
        );

      case "role":
        return (
          <Dropdown>
            <DropdownTrigger>
              <Button size={mobile ? "md" : "sm"} variant="flat" isDisabled={user.role === "ADMIN" || isPending} aria-label={`Alterar permissão de ${user.name || user.email}`} endContent={user.role === "ADMIN" ? undefined : <ChevronDownIcon />}>
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
            color={isSuspended(user) ? "warning" : user.online ? "success" : "default"}
            variant="flat"
          >
            {isSuspended(user) ? "Suspenso" : user.online ? "Online" : "Offline"}
          </Chip>
        );

      case "actions":
        return (
          <div className={mobile ? "grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2" : "flex flex-wrap items-center gap-1"}>
            {session?.user?.role === "ADMIN" && user.role !== "ADMIN" && user.id !== session.user.id && (
              <Button size={mobile ? "md" : "sm"} variant="flat" color="primary" aria-label={`Entrar como ${user.name || user.email}`} isDisabled={isPending || enteringUserId !== null} isLoading={enteringUserId === user.id} onPress={() => openAccess(user, "impersonate")}>
                Entrar como
              </Button>
            )}
            {session?.user?.role === "ADMIN" && user.role !== "ADMIN" && user.id !== session.user.id && <Button size={mobile ? "md" : "sm"} variant="flat" color={isSuspended(user) ? "success" : "warning"} isDisabled={isPending || accessPending} onPress={() => openAccess(user, isSuspended(user) ? "resume" : "suspend")}>{isSuspended(user) ? "Restaurar acesso" : "Suspender"}</Button>}
            <Tooltip content="Ver eventos">
              <Button
                isIconOnly={!mobile}
                size="md"
                variant="light"
                aria-label={`Ver eventos de ${user.name || user.email}`}
                onPress={() => handleOpenModal(user)}
              >
                <CalendarSearch className="h-4 w-4 shrink-0" />
                {mobile && "Ver eventos"}
              </Button>
            </Tooltip>
            <Tooltip content={user.role === "ADMIN" ? "Administradores não podem ser excluídos" : "Excluir usuário"}>
              <Button
                isIconOnly={!mobile}
                size="md"
                variant="light"
                aria-label={`Excluir ${user.name || user.email}`}
                isDisabled={isPending || user.role === "ADMIN"}
                onPress={() => handleOpenDeleteModal(user)}
                color="danger"
              >
                <DeleteIcon />
                {mobile && "Excluir usuário"}
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
      <div className="grid min-w-0 gap-4 lg:hidden" role="list" aria-label="Lista de usuários">
        {users.length === 0 && <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Nenhum usuário corresponde aos filtros.</p>}
        {users.map(user => (
          <article key={user.id} role="listitem" className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-none">
            <div className="flex min-w-0 items-start gap-3">
              <ProfileAvatar src={user.image || determineDefaultAvatar(user.name)} name={user.name} size={48} className="h-12 w-12 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <h3 className="break-words text-sm font-semibold text-foreground">{user.name || "Conta sem nome"}</h3>
                <p className="mt-1 break-all text-xs text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-3 border-t border-border pt-4">
              <div className="min-w-0"><dt className="mb-2 text-xs font-medium text-muted-foreground">Permissão</dt><dd>{renderCell(user, "role", true)}</dd></div>
              <div className="min-w-0"><dt className="mb-2 text-xs font-medium text-muted-foreground">Conexão</dt><dd>{renderCell(user, "status", true)}</dd></div>
            </dl>
            <div className="mt-4 border-t border-border pt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Ações da conta</p>
              {renderCell(user, "actions", true)}
            </div>
          </article>
        ))}
      </div>
      <div className="hidden min-w-0 lg:block">
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
      </div>

      <Modal classNames={{ backdrop: "z-[100]", wrapper: "z-[110]" }} isOpen={Boolean(accessUser)} isDismissable={!accessPending && !enteringUserId} onClose={() => { if (!accessPending && !enteringUserId) setAccessUser(null); }}>
        <ModalContent><ModalHeader>{accessAction === "impersonate" ? "Entrar como usuário" : accessAction === "suspend" ? "Suspender acesso" : "Restaurar acesso"}</ModalHeader><ModalBody>
          <p className="text-sm text-muted-foreground">{accessUser?.name || accessUser?.email}: {accessAction === "impersonate" ? "a conta ficará temporariamente indisponível para seu titular. A justificativa será registrada na auditoria." : accessAction === "suspend" ? "as sessões serão encerradas, preservando a conta e seus eventos." : "a pessoa poderá fazer um novo login. As sessões anteriores continuarão inválidas."}</p>
          <label className="grid gap-2 text-sm font-medium" htmlFor="admin-access-reason">Justificativa<textarea id="admin-access-reason" aria-describedby="admin-access-reason-hint" autoFocus value={accessReason} onChange={event => setAccessReason(event.target.value)} minLength={5} maxLength={500} rows={3} className="rounded-xl border border-input bg-background p-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /><span id="admin-access-reason-hint" className="text-xs font-normal text-muted-foreground">Escreva uma justificativa de 5 a 500 caracteres para habilitar a confirmação. {accessReason.trim().length}/500 caracteres.</span></label>
          {accessAction === "suspend" && <label htmlFor="admin-access-until" className="grid gap-2 text-sm font-medium">Suspender até (opcional)<input id="admin-access-until" type="datetime-local" value={accessUntil} onChange={event => setAccessUntil(event.target.value)} className="rounded-xl border border-input bg-background p-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /><span className="text-xs font-normal text-muted-foreground">Deixe vazio para suspender até a restauração manual. Máximo de um ano.</span></label>}
          {accessError && <p role="alert" className="text-sm text-destructive">{accessError}</p>}
        </ModalBody><ModalFooter><Button variant="flat" isDisabled={accessPending || Boolean(enteringUserId)} onPress={() => setAccessUser(null)}>Cancelar</Button><Button color={accessAction === "suspend" ? "warning" : "primary"} isLoading={accessPending || Boolean(enteringUserId)} isDisabled={accessReason.trim().length < 5 || accessReason.trim().length > 500} onPress={() => void confirmAccess()}>{accessAction === "impersonate" ? "Entrar na visualização" : accessAction === "suspend" ? "Confirmar suspensão" : "Restaurar acesso"}</Button></ModalFooter></ModalContent>
      </Modal>

      {/* Modal de Eventos */}
      {selectedUser && (
        <Modal
          classNames={{ backdrop: "z-[100]", wrapper: "z-[110]" }}
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
                      profileMediaUrl(selectedUser.image) ||
                      determineDefaultAvatar(selectedUser.name),
                    size: "lg",
                    showFallback: true,
                    fallback: <ProfileAvatar name={selectedUser.name} size={56} className="h-full w-full rounded-full" />,
                    imgProps: { referrerPolicy: "no-referrer" },
                  }}
                  name={selectedUser.name}
                  description={selectedUser.email}
                />
              </div>
            </ModalHeader>
            <ModalBody>
              {userEvents.length > 0 ? (
                <div className=" w-full grid grid-cols-1 gap-4">
                  {userEvents.map((event: Evento, index: number) => (
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
                  {eventsLoading ? "Carregando eventos..." : eventsError ? "" : "Nenhum evento registrado para este usuário."}
                </p>
              )}
              {eventsError && <div role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm"><p>{eventsError}</p><Button variant="flat" className="mt-2" onPress={() => void loadEvents(userEvents.length ? eventsPage + 1 : 1)}>Tentar novamente</Button></div>}
              {eventsMore && <Button variant="flat" isDisabled={eventsLoading} onPress={() => void loadEvents(eventsPage + 1)}>{eventsLoading ? "Carregando..." : "Carregar mais eventos"}</Button>}
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
      <Modal classNames={{ backdrop: "z-[100]", wrapper: "z-[110]" }} isOpen={isOpenModalDelete} onClose={handleCloseModalDelete}>
        <ModalContent>
          <ModalHeader>
            Excluir usuário
          </ModalHeader>
          <ModalBody>
            {selectedUser && (
              <div className="flex flex-col items-center justify-center gap-4 text-center">
                <ProfileAvatar
                  src={
                    selectedUser.image
                      ? selectedUser.image
                      : determineDefaultAvatar(selectedUser.name)
                  }
                  name={selectedUser.name}
                  size={80}
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
