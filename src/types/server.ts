/** Serveur affiché dans la liste ; `channelIds` sert à agréger les non-lus par serveur. */
export type ServerSummary = {
  id: string;
  name: string;
  memberCount: number;
  channelIds: string[];
  unreadCount: number;
  /** Date du dernier message de ses salons (tri du plus actif au moins actif) ; absent sans message. */
  lastActivity?: string | null;
};
