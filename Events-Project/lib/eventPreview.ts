/** Quem vê um evento que ainda não está no ar (pendente, rascunho, em correção): admin ativo ou quem o criou. */
export interface PreviewViewer { id: string; role: string | null; suspended: boolean }

export function canPreviewEvent(viewer: PreviewViewer | null, event: { userId: string | null }): boolean {
  if (!viewer || viewer.suspended) return false;
  return viewer.role === "ADMIN" || (Boolean(event.userId) && viewer.id === event.userId);
}
