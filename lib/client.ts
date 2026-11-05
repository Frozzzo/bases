"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Mode, RoomState, SyncBody, Team } from "./store";
import { CHALLENGE_IDS } from "./challenges";

export type { Mode, RoomState, Team };

// ---------- localStorage ----------
function safeGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {}
}
function getJSON<T>(k: string, fallback: T): T {
  try {
    const raw = safeGet(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const K = {
  team: (c: string) => `ccb:equipo:${c}`,
  scores: (c: string) => `ccb:puntajes:${c}`,
  host: (c: string) => `ccb:anfitrion:${c}`,
  snap: (c: string) => `ccb:copia:${c}`,
  mode: "ccb:modo",
};

export function getSavedTeam(code: string): Team | null {
  return getJSON<Team | null>(K.team(code), null);
}
export function saveTeam(code: string, team: Team) {
  safeSet(K.team(code), JSON.stringify(team));
}
export function getPracticeMode(): Mode {
  return safeGet(K.mode) === "dev" ? "dev" : "facil";
}
export function savePracticeMode(m: Mode) {
  safeSet(K.mode, m);
}

// ---------- Identificadores ----------
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function rand(n: number, alphabet: string) {
  const a = new Uint32Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => alphabet[x % alphabet.length]).join("");
}
export function newRoomCode() {
  return rand(4, ALPHABET);
}
export function newTeam(name: string, mode: Mode): Team {
  return { id: rand(12, "abcdefghijklmnopqrstuvwxyz0123456789"), name: name.trim().slice(0, 40), mode, joinedAt: Date.now() };
}

// ---------- Puntajes del equipo (la verdad vive en este navegador) ----------
export function getLocalScores(code: string): Record<string, number> {
  return getJSON(K.scores(code), {});
}
/** Guarda el puntaje si mejora el anterior y devuelve el mejor. */
export function saveLocalBest(code: string, key: string, score: number) {
  const s = getLocalScores(code);
  s[key] = Math.max(s[key] ?? 0, score);
  safeSet(K.scores(code), JSON.stringify(s));
  return s[key];
}

// ---------- Facilitador ----------
export interface HostConfig {
  adminKey: string;
  open: string[];
  openAt: number;
  removed: string[];
}
export function getHost(code: string): HostConfig | null {
  return getJSON<HostConfig | null>(K.host(code), null);
}
export function createHostedRoom(): string {
  const code = newRoomCode();
  const host: HostConfig = { adminKey: rand(24, "abcdefghijklmnopqrstuvwxyz0123456789"), open: [...CHALLENGE_IDS], openAt: Date.now(), removed: [] };
  safeSet(K.host(code), JSON.stringify(host));
  return code;
}
export function updateHost(code: string, patch: Partial<HostConfig>) {
  const h = getHost(code);
  if (!h) return;
  safeSet(K.host(code), JSON.stringify({ ...h, ...patch }));
  syncNow(code);
}

// ---------- Sincronización (una por sala y por pestaña) ----------
interface SyncStore {
  state: RoomState | null;
  error: string | null;
  lastOk: number;
  listeners: Set<() => void>;
  timer?: ReturnType<typeof setTimeout>;
  inflight?: Promise<void>;
  interval: number;
}
const stores = new Map<string, SyncStore>();

function buildBody(code: string): SyncBody {
  const body: SyncBody = {};
  const team = getSavedTeam(code);
  if (team) body.team = { ...team, scores: getLocalScores(code) };
  const host = getHost(code);
  if (host) {
    const snap = getJSON<RoomState | null>(K.snap(code), null);
    body.host = { ...host, snapshot: snap ? { teams: snap.teams, scores: snap.scores } : undefined };
  }
  return body;
}

function mergeSnapshot(code: string, st: RoomState) {
  // El facilitador guarda la unión de todo lo que ha visto: es la copia de respaldo de la sala.
  if (!getHost(code)) return st;
  const prev = getJSON<RoomState | null>(K.snap(code), null);
  if (prev) {
    const removed = new Set(st.removed);
    const teams = new Map(prev.teams.filter((t) => !removed.has(t.id)).map((t) => [t.id, t]));
    for (const t of st.teams) teams.set(t.id, t);
    const scores: RoomState["scores"] = {};
    for (const id of teams.keys()) {
      const a = prev.scores[id] || {},
        b = st.scores[id] || {};
      scores[id] = { ...a };
      for (const [k, v] of Object.entries(b)) scores[id][k] = Math.max(scores[id][k] ?? 0, v);
    }
    st = { ...st, teams: [...teams.values()], scores };
  }
  safeSet(K.snap(code), JSON.stringify(st));
  return st;
}

async function doSync(code: string) {
  const s = stores.get(code);
  if (!s) return;
  if (s.inflight) return s.inflight;
  s.inflight = (async () => {
    try {
      const res = await fetch(`/api/salas/${encodeURIComponent(code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(code)),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(String(res.status));
      s.state = mergeSnapshot(code, (await res.json()) as RoomState);
      s.error = null;
      s.lastOk = Date.now();
    } catch {
      s.error = "Sin conexión con el servidor. Tus puntajes están guardados en este navegador y se enviarán al reconectar.";
    } finally {
      s.inflight = undefined;
      s.listeners.forEach((l) => l());
    }
  })();
  return s.inflight;
}

function schedule(code: string) {
  const s = stores.get(code);
  if (!s || !s.listeners.size) return;
  clearTimeout(s.timer);
  s.timer = setTimeout(async () => {
    if (document.visibilityState === "visible" || getHost(code)) await doSync(code);
    schedule(code);
  }, s.interval);
}

/** Fuerza una sincronización inmediata (p. ej. al obtener un puntaje). */
export function syncNow(code: string) {
  return doSync(code);
}

/** Estado de la sala, sincronizado cada `intervalMs`. */
export function useRoomState(code: string | null, intervalMs = 2500) {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!code) return () => {};
      let s = stores.get(code);
      if (!s) stores.set(code, (s = { state: null, error: null, lastOk: 0, listeners: new Set(), interval: intervalMs }));
      s.interval = Math.min(s.interval, intervalMs);
      s.listeners.add(cb);
      if (s.listeners.size === 1) {
        doSync(code);
        schedule(code);
      }
      return () => {
        s!.listeners.delete(cb);
        if (!s!.listeners.size) clearTimeout(s!.timer);
      };
    },
    [code, intervalMs]
  );
  useSyncExternalStore(
    subscribe,
    () => {
      const s = code ? stores.get(code) : undefined;
      return s ? `${s.lastOk}|${s.error}` : "";
    },
    () => ""
  );
  const s = code ? stores.get(code) : undefined;
  return { state: s?.state ?? null, error: s?.error ?? null, refresh: () => (code ? doSync(code) : undefined) };
}
