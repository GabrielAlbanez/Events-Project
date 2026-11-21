import prisma from "@/lib/prisma";
import type { User } from "@/types";
import { Role } from "@prisma/client";
import type { ResolveAdminId } from "@/lib/services/authContext";
import { getAdminUsersPage } from "@/lib/services/adminPagination";

export async function getAllUsers(resolveAdminId: ResolveAdminId) {
  try {
    if (!await resolveAdminId()) {
      return { status: "error", message: "Acesso negado." };
    }
    return await getAdminUsersPage(resolveAdminId);
  } catch {
    return { status: "error", message: "Error fetching users" };
  }
}

export async function deleteUser(user: User, resolveAdminId: ResolveAdminId) {
  const adminId = await resolveAdminId();
  if (!adminId) {
    return { status: "error", message: "Você não tem permissão para excluir usuários." };
  }
  const id = user?.id;

  if (!id) {
    return {
      status: "error",
      message: "Aconteceu um erro ao logar",
    };
  }

  if (id === adminId) {
    return { status: "error", message: "Você não pode excluir sua própria conta." };
  }

  const exisgingUser = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, _count: { select: { Events: true, friendsOwned: true, ticketsBought: true, ticketsSold: true } } },
  });

  if (!exisgingUser) {
    return {
      status: "error",
      message: "Usuário não encontrado",
    };
  }

  if (exisgingUser.role === "ADMIN") {
    return { status: "error", message: "Este usuário não pode ser excluído." };
  }

  // Events and friends rooms cascade on user deletion and would wipe other people's
  // registrations, chats and memberships. Those accounts must be suspended instead.
  const blocker = deletionBlocker(exisgingUser._count?.Events ?? 0, exisgingUser._count?.friendsOwned ?? 0);
  if (blocker) return { status: "error", message: blocker };
  // Ticket orders are financial records (ON DELETE RESTRICT on buyer and seller): keep the account, suspend it instead.
  if ((exisgingUser._count?.ticketsBought ?? 0) + (exisgingUser._count?.ticketsSold ?? 0) > 0) {
    return { status: "error", message: ticketHistoryBlocker };
  }

  const deletedUser = await prisma.$transaction(async tx => {
    const deleted = await tx.user.deleteMany({
      // Re-checked atomically: an event created after the check above blocks the delete.
      where: { id, role: { not: "ADMIN" }, Events: { none: {} }, friendsOwned: { none: {} }, ticketsBought: { none: {} }, ticketsSold: { none: {} } },
    });
    if (deleted.count > 0) {
      // The signal has no user foreign key, so it survives the account deletion.
      // Commit both operations together so every successful deletion revokes sockets.
      await tx.communitySignal.create({ data: { room: `user:${id}` } });
    }
    return deleted;
  });

  if (deletedUser.count > 0) {
    return {
      status: "success",
      message: "Usuário deletado com sucesso",
    };
  }
  return { status: "error", message: "Este usuário não pode ser excluído agora. Atualize a lista e tente novamente." };
}

export const ticketHistoryBlocker = "Esta conta tem histórico de compra ou venda de ingressos, que precisa ser mantido como registro financeiro. Suspenda a conta em vez de excluí-la.";

/** Explains why a hard delete would destroy data owned by other people, or null when safe. */
export function deletionBlocker(ownedEvents: number, ownedRooms: number): string | null {
  const parts: string[] = [];
  if (ownedEvents > 0) parts.push(ownedEvents === 1 ? "1 evento publicado" : `${ownedEvents} eventos publicados`);
  if (ownedRooms > 0) parts.push(ownedRooms === 1 ? "1 sala de amigos" : `${ownedRooms} salas de amigos`);
  if (!parts.length) return null;
  return `Esta conta possui ${parts.join(" e ")}. Excluí-la apagaria também inscrições, conversas e participações de outras pessoas. Suspenda a conta ou remova esse conteúdo antes de excluir.`;
}

export async function alterRoleUser(user: User, roleSelect : string, resolveAdminId: ResolveAdminId) {
  const adminId = await resolveAdminId();
  if (!adminId) {
    return { status: "error", message: "Você não tem permissão para alterar usuários." };
  }
  if (!user?.id || !Object.values(Role).includes(roleSelect as Role)) {
    return { status: "error", message: "Dados de usuário inválidos." };
  }
  const userId = user.id;
  const role = roleSelect as Role;
  // Loaded on demand so deleteUser/getAllUsers (and their isolated tests) do not pull the
  // organizer and notification modules.
  const [{ createNotifications }, { organizerPromotionNotice }] = role === "PROMOTER"
    ? await Promise.all([import("@/lib/notifications/create"), import("@/lib/organizer/service")])
    : [{ createNotifications: null }, { organizerPromotionNotice: null }];
  const outcome = await prisma.$transaction(async tx => {
    const target = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!target || target.role === "ADMIN") return "blocked" as const;
    if (target.role === role) return "unchanged" as const;
    // Conditional on the role just read, so concurrent changes cannot be audited wrongly.
    const changed = await tx.user.updateMany({
      where: { id: userId, role: target.role },
      data: { role },
    });
    if (changed.count === 0) return "blocked" as const;
    // Existing admin audit trail (no foreign key: it survives account removal).
    await tx.userSuspensionAudit.create({
      data: { actorId: adminId, userId, action: "ROLE_CHANGE", reason: `${target.role} -> ${role}` },
    });
    // Same transaction: the organizer notice exists only if the promotion committed.
    if (createNotifications && organizerPromotionNotice) await createNotifications(tx, [organizerPromotionNotice(userId)]);
    return "changed" as const;
  });

  if (outcome === "blocked") {
    return { status: "error", message: "Este usuário não pode ter seu papel alterado." };
  }
  return {
    status: "success",
    message: outcome === "unchanged" ? "O usuário já possui esse papel." : "Role do usuario alterado com sucesso",
  };
}
