/** Rôle effectif de l'utilisateur dans un serveur (`monRole` de l'API Room-Service). */
export type ServerRole = 'membre' | 'moderateur' | 'proprietaire' | 'admin';

const RANK: Record<ServerRole, number> = { membre: 1, moderateur: 2, proprietaire: 3, admin: 4 };

/**
 * Modérer = supprimer les messages des autres membres (comme `peutModerer` côté Room-Service et sur le Web) :
 * modérateur, propriétaire du serveur ou administrateur. Sert seulement à proposer l'action ; l'API vérifie
 * toujours le droit (403 sinon).
 */
export function canModerate(role: unknown): boolean {
  return typeof role === 'string' && role in RANK && RANK[role as ServerRole] >= RANK.moderateur;
}
