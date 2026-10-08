import { api } from './api';
interface ProfileSession { refresh(): Promise<void>; signOut(): Promise<void> }
export async function saveProfileChanges(input: Parameters<typeof api.updateProfile>[0], session: ProfileSession): Promise<'updated' | 'signed-out'> {
  await api.updateProfile(input);
  if (input.newPassword) {
    await session.signOut();
    return 'signed-out';
  }
  await session.refresh();
  return 'updated';
}
