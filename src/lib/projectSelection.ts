type ProjectIdentity = {
  id: string;
};

const activeProjectStoragePrefix = "ai-comic-active-project-id";

export function getProjectLoadOrder<T extends ProjectIdentity>(projects: T[], preferredProjectId?: string | null): string[] {
  const orderedIds: string[] = [];
  if (preferredProjectId && projects.some((project) => project.id === preferredProjectId)) {
    orderedIds.push(preferredProjectId);
  }

  for (const project of projects) {
    if (!orderedIds.includes(project.id)) orderedIds.push(project.id);
  }

  return orderedIds;
}

export function readStoredActiveProjectId(userId: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage.getItem(storageKey(userId)) || undefined;
  } catch {
    return undefined;
  }
}

export function rememberActiveProjectId(userId: string, projectId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), projectId);
  } catch {
    // Ignore storage failures; project loading still falls back to server order.
  }
}

function storageKey(userId: string): string {
  return `${activeProjectStoragePrefix}:${userId}`;
}
