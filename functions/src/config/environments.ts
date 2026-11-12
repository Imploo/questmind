/**
 * The QuestMind environments a character may be imported from. Each has its own
 * Firebase project, so its own database and storage bucket.
 */
export interface QuestmindEnvironment {
  projectId: string;
  bucket: string;
  /** Custom domains, next to the project's own web.app / firebaseapp.com hosts. */
  domains: string[];
}

export const QUESTMIND_ENVIRONMENTS: QuestmindEnvironment[] = [
  { projectId: 'questmind-dnd', bucket: 'questmind-dnd.firebasestorage.app', domains: ['questmind.nl', 'www.questmind.nl'] },
  { projectId: 'questmind-beta', bucket: 'questmind-beta.firebasestorage.app', domains: [] },
];

/** The environment a Firebase project id belongs to, or null for a project that is not one of ours. */
export function environmentForProject(projectId: string | undefined): QuestmindEnvironment | null {
  return QUESTMIND_ENVIRONMENTS.find(environment => environment.projectId === projectId) ?? null;
}

/** The environment a host belongs to, or null for a host that is not one of ours. */
export function environmentForHost(host: string): QuestmindEnvironment | null {
  const hostname = host.trim().toLowerCase();
  return QUESTMIND_ENVIRONMENTS.find(environment => {
    if (environment.domains.includes(hostname)) return true;
    // <project>.web.app, <project>.firebaseapp.com and preview channels (<project>--<channel>.web.app)
    const pattern = new RegExp(`^${environment.projectId}(--[\\w-]+)?\\.(web\\.app|firebaseapp\\.com)$`);
    return pattern.test(hostname);
  }) ?? null;
}
