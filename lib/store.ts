// Estado compartido de las salas.
// Orden de preferencia:
//  1. Upstash / Vercel KV por REST (KV_REST_API_URL + KV_REST_API_TOKEN, o UPSTASH_REDIS_REST_URL + _TOKEN).
//  2. Cualquier Redis por TCP (REDIS_URL, p. ej. la integración "Redis" del Marketplace de Vercel).
//  3. Memoria del proceso: solo sirve con UN servidor (local o `next start`). En Vercel cada
//     instancia serverless tiene su propia memoria, así que las salas no se comparten.
//
// Las escrituras de puntaje son "auto-reparables": traen los datos del equipo, y si la sala o el
// equipo no existen en este backend (reinicio, otra instancia, expiración) se vuelven a registrar
// en lugar de fallar.

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
const TCP_URL = process.env.REDIS_URL || process.env.KV_URL || "";

export const backendKind: "redis-rest" | "redis-tcp" | "memoria" =
  REST_URL && REST_TOKEN ? "redis-rest" : TCP_URL ? "redis-tcp" : "memoria";
export const backend: "redis" | "memoria" = backendKind === "memoria" ? "memoria" : "redis";

export const CODE_RE = /^[A-Z0-9]{4,6}$/;
export const TEAM_ID_RE = /^[a-z0-9]{6,24}$/;

type Cmd = (string | number)[];

// ---------- Backend Redis por REST (Upstash) ----------
async function restExec(commands: Cmd[]): Promise<unknown[]> {
  const res = await fetch(`${REST_URL.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands.map((c) => c.map(String))),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis (REST) respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { result?: unknown; error?: string }[];
  return data.map((d) => {
    if (d.error) throw new Error(d.error);
    return d.result;
  });
}

// ---------- Backend Redis por TCP (REDIS_URL) ----------
type TcpClient = { sendCommand: (args: string[]) => Promise<unknown>; isOpen: boolean; connect: () => Promise<unknown> };
const gt = globalThis as unknown as { __redisTcp?: Promise<TcpClient> };
async function tcpClient(): Promise<TcpClient> {
  if (!gt.__redisTcp) {
    gt.__redisTcp = (async () => {
      const { createClient } = await import("redis");
      const c = createClient({ url: TCP_URL, socket: { connectTimeout: 5000 } }) as unknown as TcpClient & {
        on: (ev: string, fn: (e: unknown) => void) => void;
      };
      c.on("error", (e) => console.error("[redis]", e));
      await c.connect();
      return c;
    })().catch((e) => {
      gt.__redisTcp = undefined;
      throw e;
    });
  }
  return gt.__redisTcp;
}
async function tcpExec(commands: Cmd[]): Promise<unknown[]> {
  const c = await tcpClient();
  return Promise.all(commands.map((cmd) => c.sendCommand(cmd.map(String))));
}

function redis(commands: Cmd[]) {
  return backendKind === "redis-rest" ? restExec(commands) : tcpExec(commands);
}

function hashToObject(arr: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(arr)) for (let i = 0; i < arr.length; i += 2) out[String(arr[i])] = String(arr[i + 1]);
  else if (arr && typeof arr === "object") for (const [k, v] of Object.entries(arr)) out[k] = String(v);
  return out;
}

// ---------- Backend memoria ----------
interface MemRoom {
  room: Room;
  adminKey: string;
  teams: Map<string, Team>;
  removed: Set<string>;
  scores: Map<string, number>; // `${teamId}|${scoreKey}`
}
const g = globalThis as unknown as { __rooms?: Map<string, MemRoom> };
const mem = (g.__rooms ??= new Map<string, MemRoom>());

// ---------- Utilidades ----------
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(len = 4) {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}
function randomId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
const k = (code: string, what: "meta" | "equipos" | "puntajes" | "eliminados") => `sala:${code}:${what}`;
const newRoom = (code: string): Room => ({ code, createdAt: Date.now(), open: [...CHALLENGE_IDS] });

// ---------- API pública ----------
export async function createRoom(): Promise<{ room: Room; adminKey: string }> {
  const adminKey = randomId() + randomId();
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const room = newRoom(code);
    if (backend === "memoria") {
      if (mem.has(code)) continue;
      mem.set(code, { room, adminKey, teams: new Map(), removed: new Set(), scores: new Map() });
      return { room, adminKey };
    }
    const [ok] = await redis([["SET", k(code, "meta"), JSON.stringify({ room, adminKey }), "NX", "EX", TTL_SECONDS]]);
    if (ok === "OK") return { room, adminKey };
  }
  throw new Error("No se pudo generar un código de sala");
}

async function getMeta(code: string): Promise<{ room: Room; adminKey: string } | null> {
  if (backend === "memoria") {
    const r = mem.get(code);
    return r ? { room: r.room, adminKey: r.adminKey } : null;
  }
  const [raw] = await redis([["GET", k(code, "meta")]]);
  return raw ? JSON.parse(String(raw)) : null;
}

/** Recrea una sala que este backend no conoce (reinicio, otra instancia o expiración). Sin clave de admin. */
async function ensureRoom(code: string) {
  if (backend === "memoria") {
    if (!mem.has(code)) mem.set(code, { room: newRoom(code), adminKey: "", teams: new Map(), removed: new Set(), scores: new Map() });
    return;
  }
  await redis([["SET", k(code, "meta"), JSON.stringify({ room: newRoom(code), adminKey: "" }), "NX", "EX", TTL_SECONDS]]);
}

export async function getState(code: string): Promise<RoomState | null> {
  if (backend === "memoria") {
    const r = mem.get(code);
    if (!r) return null;
    const scores: RoomState["scores"] = {};
    for (const [key, v] of r.scores) {
      const [teamId, sk] = key.split("|");
      (scores[teamId] ??= {})[sk] = v;
    }
    return { room: r.room, teams: [...r.teams.values()], scores };
  }
  const [meta, teamsRaw, scoresRaw] = await redis([
    ["GET", k(code, "meta")],
    ["HGETALL", k(code, "equipos")],
    ["HGETALL", k(code, "puntajes")],
  ]);
  if (!meta) return null;
  const { room } = JSON.parse(String(meta)) as { room: Room };
  const teams = Object.values(hashToObject(teamsRaw)).map((t) => JSON.parse(t) as Team);
  const scores: RoomState["scores"] = {};
  for (const [key, v] of Object.entries(hashToObject(scoresRaw))) {
    const [teamId, sk] = key.split("|");
    (scores[teamId] ??= {})[sk] = Number(v);
  }
  return { room, teams, scores };
}

export async function joinRoom(code: string, name: string, mode: Mode): Promise<Team | null> {
  // En modo memoria la sala puede vivir en otra instancia: la creamos aquí en vez de fallar.
  if (backend === "memoria") await ensureRoom(code);
  else if (!(await getMeta(code))) return null;
  const team: Team = { id: randomId(), name: name.slice(0, 40), mode, joinedAt: Date.now() };
  if (backend === "memoria") mem.get(code)!.teams.set(team.id, team);
  else
    await redis([
      ["HSET", k(code, "equipos"), team.id, JSON.stringify(team)],
      ["EXPIRE", k(code, "equipos"), TTL_SECONDS],
    ]);
  return team;
}

export type SubmitResult = { best: number } | { error: "eliminado" };

/** Guarda el puntaje si mejora el anterior y devuelve el mejor. Re-registra sala/equipo si faltan. */
export async function submitScore(code: string, team: Team, key: string, score: number): Promise<SubmitResult> {
  const field = `${team.id}|${key}`;
  await ensureRoom(code);
  if (backend === "memoria") {
    const r = mem.get(code)!;
    if (r.removed.has(team.id)) return { error: "eliminado" };
    if (!r.teams.has(team.id)) r.teams.set(team.id, team);
    const best = Math.max(r.scores.get(field) ?? 0, score);
    r.scores.set(field, best);
    return { best };
  }
  // Atómico en Redis: rechaza equipos eliminados, re-registra el equipo si falta y guarda el máximo.
  const script = `
if redis.call('SISMEMBER', KEYS[3], ARGV[4]) == 1 then return -1 end
redis.call('HSETNX', KEYS[2], ARGV[4], ARGV[5])
redis.call('EXPIRE', KEYS[2], ARGV[3])
local c = tonumber(redis.call('HGET', KEYS[1], ARGV[1]) or '0')
local n = tonumber(ARGV[2])
if n > c then redis.call('HSET', KEYS[1], ARGV[1], n) c = n end
redis.call('EXPIRE', KEYS[1], ARGV[3])
return c`;
  const [best] = await redis([
    ["EVAL", script, 3, k(code, "puntajes"), k(code, "equipos"), k(code, "eliminados"), field, score, TTL_SECONDS, team.id, JSON.stringify(team)],
  ]);
  return Number(best) < 0 ? { error: "eliminado" } : { best: Number(best) };
}

export async function setOpen(code: string, adminKey: string, open: string[]): Promise<boolean> {
  const meta = await getMeta(code);
  if (!meta || !meta.adminKey || meta.adminKey !== adminKey) return false;
  const room = { ...meta.room, open: open.filter((o) => CHALLENGE_IDS.includes(o)) };
  if (backend === "memoria") mem.get(code)!.room = room;
  else await redis([["SET", k(code, "meta"), JSON.stringify({ room, adminKey }), "EX", TTL_SECONDS]]);
  return true;
}

export async function removeTeam(code: string, adminKey: string, teamId: string): Promise<boolean> {
  const meta = await getMeta(code);
  if (!meta || !meta.adminKey || meta.adminKey !== adminKey) return false;
  if (backend === "memoria") {
    const r = mem.get(code)!;
    r.teams.delete(teamId);
    r.removed.add(teamId);
    for (const key of [...r.scores.keys()]) if (key.startsWith(teamId + "|")) r.scores.delete(key);
  } else {
    await redis([
      ["HDEL", k(code, "equipos"), teamId],
      ["SADD", k(code, "eliminados"), teamId],
      ["EXPIRE", k(code, "eliminados"), TTL_SECONDS],
    ]);
  }
  return true;
}

/** Comprueba que el backend responde (para /api/estado). */
export async function ping(): Promise<{ ok: boolean; error?: string }> {
  if (backend === "memoria") return { ok: true };
  try {
    const [r] = await redis([["PING"]]);
    return { ok: r === "PONG" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
