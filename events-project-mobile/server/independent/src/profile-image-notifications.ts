import { Client } from 'pg';

const profileImageChannel = 'eventmap_profile_image_updated';
const userRoleChannel = 'eventmap_user_role_updated';
const validUserId = /^[A-Za-z0-9_-]{1,128}$/;

export function listenForProfileImageChanges(
  connectionString: string,
  onChange: (userId: string) => void,
  onRoleChange?: (userId: string) => void,
): () => Promise<void> {
  let stopped = false;
  let active: Client | null = null;
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
    if (active !== client) return;
    active = null;
    void client.end().catch(() => {});
    scheduleRetry();
  };

  const connect = async (): Promise<void> => {
    if (stopped || active) return;
    const client = new Client({ connectionString, connectionTimeoutMillis: 5_000 });
    active = client;
    client.on('notification', notice => {
      if (notice.channel === profileImageChannel && notice.payload && validUserId.test(notice.payload)) {
        try {
          onChange(notice.payload);
        } catch {
          console.error('Unable to deliver a profile image update to mobile clients.');
        }
        return;
      }
      if (notice.channel === userRoleChannel && notice.payload && onRoleChange) {
        if (validUserId.test(notice.payload)) onRoleChange(notice.payload);
      }
    });
    client.on('error', () => {
      console.error('Profile image PostgreSQL listener disconnected; retrying.');
      disconnect(client);
    });
    client.on('end', () => disconnect(client));

    try {
      await client.connect();
      if (stopped || active !== client) {
        await client.end();
        return;
      }
      await client.query(`LISTEN ${profileImageChannel}`);
      await client.query(`LISTEN ${userRoleChannel}`);
      if (!stopped && active === client) console.info('Listening for shared account updates.');
    } catch {
      console.error('Unable to start the profile image PostgreSQL listener; retrying.');
      disconnect(client);
    }
  };

  void connect();
  return async () => {
    stopped = true;
    if (retry) clearTimeout(retry);
    retry = null;
    const client = active;
    active = null;
    if (client) await client.end().catch(() => {});
  };
}
