export type TabId = "servers" | "games" | "favorites" | "recent";

export interface ServerData {
  id: string;
  maxPlayers: number;
  playing: number;
  playerTokens: string[];
  fps: number;
  ping: number | null;
  name: string | null;
  vipServerId: number | null;
  accessCode: string | null;
}

export interface ServersResponse {
  data: ServerData[];
  nextPageCursor: string | null;
}

export interface PlaceDetails {
  placeId: number;
  universeId: number;
  name: string;
  description: string;
  sourceName: string;
  sourceDescription: string;
  url: string;
}

export interface GameEntry {
  placeId: number;
  name: string;
  playerCount: number;
  likeRatio: number | null;
  iconUrl: string | null;
  universeId?: number;
}

export interface FavoriteGame {
  placeId: number;
  name: string;
  iconUrl: string | null;
  addedAt: number;
  privateServer?: string;
}

export interface RecentGame {
  placeId: number;
  name: string;
  iconUrl: string | null;
  lastPlayed: number;
}

export interface ServerRegion {
  region: string;
  loading: boolean;
}

const STORAGE_KEY_FAVORITES = "ram_favorite_games";
const STORAGE_KEY_RECENT = "ram_recent_games";

export function loadFavorites(): FavoriteGame[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_FAVORITES) || "[]");
  } catch {
    return [];
  }
}

export function saveFavorites(favorites: FavoriteGame[]) {
  localStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(favorites));
}

export function loadRecentGames(): RecentGame[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_RECENT) || "[]");
  } catch {
    return [];
  }
}

export function saveRecentGames(games: RecentGame[]) {
  localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(games));
}

export function addRecentGame(game: RecentGame, maxCount: number) {
  const existing = loadRecentGames().filter((g) => g.placeId !== game.placeId);
  existing.unshift({ ...game, lastPlayed: Date.now() });
  saveRecentGames(existing.slice(0, maxCount));
}
