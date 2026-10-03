/** Serveur affiché dans la liste ; `channelIds` sert à agréger les non-lus par serveur. */
export type ServerSummary = {
  id: string;
  name: string;
  memberCount: number;
  channelIds: string[];
  unreadCount: number;
};
