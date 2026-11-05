// Estado compartido de las salas.
// - Si hay credenciales de Upstash / Vercel KV usa Redis vía REST (sin dependencias).
// - Si no, usa memoria del proceso (ideal en local o para una demo con una sola instancia).

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
  createdAt: number;
  open: string[]; // retos desbloqueados por el facilitador
}

export interface RoomState {
  room: Room;
  teams: Team[];
  scores: Record<string, Record<string, number>>; // teamId -> scoreKey -> mejor puntaje
}

const TTL_SECONDS = 60 * 60 * 48;

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export const backend: "redis" | "memoria" = REST_URL && REST_TOKEN ? "redis" : "memoria";

// ---------- Backend Redis (Upstash REST) ----------
async function redis(commands: (string | number)[][]): Promise<unknown[]> {
  const res = await fetch(`${REST_URL.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands.map((c) => c.map(String))),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis respondió ${res.status}`);
  const data = (await res.json()) as { result?: unknown; error?: string }[];
  return data.map((d) => {
    if (d.error) throw new Error(d.error);
    return d.result;
  });
}

function hashToObject(arr: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(arr)) return out;
  for (let i = 0; i < arr.length; i += 2) out[String(arr[i])] = String(arr[i + 1]);
  return out;
}

// ---------- Backend memoria ----------
interface MemRoom {
  room: Room;
  adminKey: string;
  teams: Map<string, Team>;
  scores: Map<string, number>; // `${teamId}|${scoreKey}`
}
const g = globalThis as unknown as { __rooms?: Map<string, MemRoom> };
const mem = (g.__rooms ??= new Map<string, MemRoom>());

// ---------- API pública ----------
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(len = 4) {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}
function randomId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export async function createRoom(): Promise<{ room: Room; adminKey: string }> {
  const adminKey = randomId() + randomId();
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const room: Room = { code, createdAt: Date.now(), open: [...CHALLENGE_IDS] };
    if (backend === "memoria") {
      if (mem.has(code)) continue;
      mem.set(code, { room, adminKey, teams: new Map(), scores: new Map() });
      return { room, adminKey };
    }
    const [ok] = await redis([["SET", `sala:${code}:meta`, JSON.stringify({ room, adminKey }), "NX", "EX", TTL_SECONDS]]);
    if (ok === "OK") return { room, adminKey };
  }
  throw new Error("No se pudo generar un código de sala");
}

async function getMeta(code: string): Promise<{ room: Room; adminKey: string } | null> {
  if (backend === "memoria") {
    const r = mem.get(code);
    return r ? { room: r.room, adminKey: r.adminKey } : null;
  }
  const [raw] = await redis([["GET", `sala:${code}:meta`]]);
  return raw ? JSON.parse(String(raw)) : null;
}

export async function getState(code: string): Promise<RoomState | null> {
  if (backend === "memoria") {
    const r = mem.get(code);
    if (!r) return null;
    const scores: RoomState["scores"] = {};
    for (const [k, v] of r.scores) {
      const [teamId, key] = k.split("|");
      (scores[teamId] ??= {})[key] = v;
    }
    return { room: r.room, teams: [...r.teams.values()], scores };
  }
  const [meta, teamsRaw, scoresRaw] = await redis([
    ["GET", `sala:${code}:meta`],
    ["HGETALL", `sala:${code}:equipos`],
    ["HGETALL", `sala:${code}:puntajes`],
  ]);
  if (!meta) return null;
  const { room } = JSON.parse(String(meta)) as { room: Room };
  const teams = Object.values(hashToObject(teamsRaw)).map((t) => JSON.parse(t) as Team);
  const scores: RoomState["scores"] = {};
  for (const [k, v] of Object.entries(hashToObject(scoresRaw))) {
    const [teamId, key] = k.split("|");
    (scores[teamId] ??= {})[key] = Number(v);
  }
  return { room, teams, scores };
}

export async function joinRoom(code: string, name: string, mode: Mode): Promise<Team | null> {
  const meta = await getMeta(code);
  if (!meta) return null;
  const team: Team = { id: randomId(), name: name.slice(0, 40), mode, joinedAt: Date.now() };
  if (backend === "memoria") {
    mem.get(code)!.teams.set(team.id, team);
  } else {
    await redis([
      ["HSET", `sala:${code}:equipos`, team.id, JSON.stringify(team)],
      ["EXPIRE", `sala:${code}:equipos`, TTL_SECONDS],
    ]);
  }
  return team;
}

/** Guarda el puntaje si mejora el anterior. Devuelve el mejor puntaje. */
export async function submitScore(code: string, teamId: string, key: string, score: number): Promise<number | null> {
  const field = `${teamId}|${key}`;
  if (backend === "memoria") {
    const r = mem.get(code);
    if (!r || !r.teams.has(teamId)) return null;
    const best = Math.max(r.scores.get(field) ?? 0, score);
    r.scores.set(field, best);
    return best;
  }
  const [team] = await redis([["HEXISTS", `sala:${code}:equipos`, teamId]]);
  if (!team) return null;
  // Atómico: guarda el máximo en el servidor de Redis.
  const script =
    "local c=tonumber(redis.call('HGET',KEYS[1],ARGV[1]) or '0') local n=tonumber(ARGV[2]) if n>c then redis.call('HSET',KEYS[1],ARGV[1],n) c=n end redis.call('EXPIRE',KEYS[1],ARGV[3]) return c";
  const [best] = await redis([["EVAL", script, 1, `sala:${code}:puntajes`, field, score, TTL_SECONDS]]);
  return Number(best);
}

export async function setOpen(code: string, adminKey: string, open: string[]): Promise<boolean> {
  const meta = await getMeta(code);
  if (!meta || meta.adminKey !== adminKey) return false;
  const room = { ...meta.room, open: open.filter((o) => CHALLENGE_IDS.includes(o)) };
  if (backend === "memoria") mem.get(code)!.room = room;
  else await redis([["SET", `sala:${code}:meta`, JSON.stringify({ room, adminKey }), "EX", TTL_SECONDS]]);
  return true;
}

export async function removeTeam(code: string, adminKey: string, teamId: string): Promise<boolean> {
  const meta = await getMeta(code);
  if (!meta || meta.adminKey !== adminKey) return false;
  if (backend === "memoria") {
    const r = mem.get(code)!;
    r.teams.delete(teamId);
    for (const k of [...r.scores.keys()]) if (k.startsWith(teamId + "|")) r.scores.delete(k);
  } else {
    await redis([["HDEL", `sala:${code}:equipos`, teamId]]);
  }
  return true;
}
