import { Client } from "pg";
import type { Server, Socket } from "socket.io";

const profileImageChannel = "eventmap_profile_image_updated";
const userRoleChannel = "eventmap_user_role_updated";
const validUserId = /^[A-Za-z0-9_-]{1,128}$/;
const validRoles = new Set(["BASIC", "PROMOTER", "ADMIN"]);

export function startProfileImageRealtime(
  connectionString: string | undefined,
  getSocketServer: () => Server,
): () => void {
  if (!connectionString) throw new Error("DATABASE_URL is required for profile image realtime updates.");

  let stopped = false;
  let current: Client | null = null;
  let retry: NodeJS.Timeout | null = null;

  const scheduleRetry = (): void => {
    if (stopped || retry) return;
    retry = setTimeout(() => {
      retry = null;
      void connect();
    }, 5_000);
    retry.unref();
  };

  const disconnect = (client: Client): void => {
    if (current !== client) return;
    current = null;
    void client.end().catch(() => {});
    scheduleRetry();
  };

  const connect = async (): Promise<void> => {
    if (stopped || current) return;
    const client = new Client({ connectionString, connectionTimeoutMillis: 5_000 });
    current = client;
    client.on("notification", (notice) => {
      if (notice.channel === profileImageChannel && notice.payload && validUserId.test(notice.payload)) {
        try {
          getSocketServer().to(`user:${notice.payload}`).emit("profile-image-updated", { userId: notice.payload });
        } catch {
          console.error("Unable to deliver a profile image update.");
        }
        return;
      }
      if (notice.channel !== userRoleChannel || !notice.payload || !validUserId.test(notice.payload)) return;
      void client.query('SELECT role FROM "User" WHERE id = $1', [notice.payload]).then(result => {
        if (current !== client) return;
        const role = result.rows[0]?.role;
        if (typeof role !== "string" || !validRoles.has(role)) return;
        const io = getSocketServer();
        for (const socket of Array.from(io.sockets.sockets.values())) {
          const target = socket as Socket & { data: { userId?: string; effectiveRole?: string } };
          if (target.data.userId !== notice.payload) continue;
          target.data.effectiveRole = role;
          if (role === "ADMIN") void target.join("admins");
          else void target.leave("admins");
          target.emit("role-mudar", { newRole: role });
        }
      }).catch(error => {
        console.error("Unable to verify a notified user role:", error instanceof Error ? error.message : "unknown error");
      });
    });
    client.on("error", () => {
      console.error("Profile image PostgreSQL listener disconnected; retrying.");
      disconnect(client);
    });
    client.on("end", () => disconnect(client));

    try {
      await client.connect();
      if (stopped || current !== client) {
        await client.end();
        return;
      }
      await client.query(`LISTEN ${profileImageChannel}`);
      await client.query(`LISTEN ${userRoleChannel}`);
      if (!stopped && current === client) console.info("Listening for shared account updates.");
    } catch {
      console.error("Unable to start the profile image PostgreSQL listener; retrying.");
      disconnect(client);
    }
  };

  void connect();
  return () => {
    stopped = true;
    if (retry) clearTimeout(retry);
    retry = null;
    const client = current;
    current = null;
    if (client) void client.end().catch(() => {});
  };
}
