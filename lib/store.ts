// Estado compartido de las salas, SIN servicios externos.
//
// Idea: el servidor solo guarda una copia en memoria que se puede reconstruir en cualquier momento.
// La "verdad" vive en los navegadores:
//   - cada equipo guarda en su navegador sus mejores puntajes y los reenvía en cada sincronización;
//   - el panel del facilitador guarda la configuración (retos abiertos, equipos quitados) y una copia
//     de todo el ranking, y también la reenvía en cada sincronización.
// El servidor fusiona lo que recibe (unión de equipos, máximo por puntaje) y devuelve el resultado.
// Así da igual si Vercel reparte las peticiones entre varias instancias o reinicia una: en pocos
// segundos cada instancia vuelve a tener el ranking completo.

import { CHALLENGE_IDS } from "./challenges";

export type Mode = "facil" | "dev";

export interface Team {
  id: string;
  name: string;
  mode: Mode;
  joinedAt: number;
}

export interface Room {
  code: string;
  open: string[]; // retos desbloqueados por el facilitador
  hostSeenAt: number; // última vez que el panel del facilitador sincronizó (0 = nunca en esta instancia)
}

export interface RoomState {
  room: Room;
  teams: Team[];
  scores: Record<string, Record<string, number>>; // teamId -> scoreKey -> mejor puntaje
  removed: string[];
}

export interface SyncBody {
  team?: Team & { scores?: Record<string, number> };
  host?: {
    adminKey: string;
    open: string[];
    openAt: number; // momento en que el facilitador cambió los retos abiertos (gana el más reciente)
    removed: string[];
    snapshot?: { teams: Team[]; scores: Record<string, Record<string, number>> };
  };
}

export const CODE_RE = /^[A-Z0-9]{4,6}$/;
const ID_RE = /^[a-z0-9]{6,24}$/;
const KEY_RE = /^[a-z0-9:-]{1,40}$/;
const MAX_TEAMS = 200;
const IDLE_MS = 12 * 60 * 60 * 1000;

interface MemRoom {
  code: string;
  adminKey: string;
  open: string[];
  openAt: number;
  hostSeenAt: number;
  teams: Map<string, Team>;
  removed: Set<string>;
  scores: Map<string, Map<string, number>>;
  touched: number;
}

const g = globalThis as unknown as { __salas?: Map<string, MemRoom> };
const rooms = (g.__salas ??= new Map<string, MemRoom>());

function getRoom(code: string): MemRoom {
  let r = rooms.get(code);
  if (!r) {
    // Limpieza de salas viejas para no crecer sin límite (¡no queremos una fuga de memoria!).
    const now = Date.now();
    for (const [c, old] of rooms) if (now - old.touched > IDLE_MS) rooms.delete(c);
    r = {
      code,
      adminKey: "",
      open: [...CHALLENGE_IDS],
      openAt: 0,
      hostSeenAt: 0,
      teams: new Map(),
      removed: new Set(),
      scores: new Map(),
      touched: now,
    };
    rooms.set(code, r);
  }
  r.touched = Date.now();
  return r;
}

function cleanTeam(t: Partial<Team> | undefined): Team | null {
  if (!t || typeof t.id !== "string" || !ID_RE.test(t.id)) return null;
  return {
    id: t.id,
    name: String(t.name || "Equipo").trim().slice(0, 40) || "Equipo",
    mode: t.mode === "dev" ? "dev" : "facil",
    joinedAt: Number(t.joinedAt) || Date.now(),
  };
}

function mergeScores(r: MemRoom, teamId: string, scores: Record<string, unknown> | undefined) {
  if (!scores || typeof scores !== "object") return;
  let m = r.scores.get(teamId);
  if (!m) r.scores.set(teamId, (m = new Map()));
  for (const [k, v] of Object.entries(scores)) {
    const n = Math.round(Number(v));
    if (!KEY_RE.test(k) || !CHALLENGE_IDS.includes(k.split(":")[0]) || !Number.isFinite(n)) continue;
    const s = Math.max(0, Math.min(1000, n));
    if (s > (m.get(k) ?? -1)) m.set(k, s);
  }
}

function addTeam(r: MemRoom, t: Team) {
  if (r.removed.has(t.id)) return;
  if (!r.teams.has(t.id) && r.teams.size >= MAX_TEAMS) return;
  r.teams.set(t.id, t);
}

/** Fusiona lo que manda un navegador y devuelve el estado de la sala. */
export function sync(code: string, body: SyncBody): RoomState {
  const r = getRoom(code);
  const h = body.host;
  if (h && typeof h.adminKey === "string" && h.adminKey.length >= 8) {
    // El primer panel que sincroniza en esta instancia queda como dueño de la sala.
    if (!r.adminKey) r.adminKey = h.adminKey;
    if (r.adminKey === h.adminKey) {
      r.hostSeenAt = Date.now();
      if (Array.isArray(h.removed)) for (const id of h.removed) if (typeof id === "string") r.removed.add(id);
      for (const id of r.removed) {
        r.teams.delete(id);
        r.scores.delete(id);
      }
      if (Array.isArray(h.open) && Number(h.openAt) >= r.openAt) {
        r.open = h.open.filter((o) => CHALLENGE_IDS.includes(o));
        r.openAt = Number(h.openAt) || 0;
      }
      const snap = h.snapshot;
      if (snap && Array.isArray(snap.teams)) {
        for (const raw of snap.teams.slice(0, MAX_TEAMS)) {
          const t = cleanTeam(raw);
          if (!t || r.removed.has(t.id)) continue;
          addTeam(r, t);
          mergeScores(r, t.id, snap.scores?.[t.id]);
        }
      }
    }
  }
  const t = cleanTeam(body.team);
  if (t && !r.removed.has(t.id)) {
    addTeam(r, t);
    mergeScores(r, t.id, body.team?.scores);
  }
  return snapshot(r);
}

function snapshot(r: MemRoom): RoomState {
  const scores: RoomState["scores"] = {};
  for (const [id, m] of r.scores) if (r.teams.has(id)) scores[id] = Object.fromEntries(m);
  return {
    room: { code: r.code, open: r.open, hostSeenAt: r.hostSeenAt },
    teams: [...r.teams.values()],
    scores,
    removed: [...r.removed],
  };
}
