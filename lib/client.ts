"use client";

import { useCallback, useEffect, useState } from "react";
import type { Mode, RoomState, Team } from "./store";

export type { Mode, RoomState, Team };

const teamKey = (code: string) => `ccb:equipo:${code}`;
const adminKeyKey = (code: string) => `ccb:admin:${code}`;
const modeKey = "ccb:modo";

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

export function getSavedTeam(code: string): Team | null {
  const raw = safeGet(teamKey(code));
  return raw ? (JSON.parse(raw) as Team) : null;
}
export function saveTeam(code: string, team: Team) {
  safeSet(teamKey(code), JSON.stringify(team));
}
export function getAdminKey(code: string) {
  return safeGet(adminKeyKey(code));
}
export function saveAdminKey(code: string, key: string) {
  safeSet(adminKeyKey(code), key);
}
export function getPracticeMode(): Mode {
  return safeGet(modeKey) === "dev" ? "dev" : "facil";
}
export function savePracticeMode(m: Mode) {
  safeSet(modeKey, m);
}

/** Consulta el estado de la sala cada `intervalMs` (polling: funciona en cualquier hosting). */
export function useRoomState(code: string | null, intervalMs = 2500) {
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!code) return;
    try {
      const res = await fetch(`/api/salas/${code}`, { cache: "no-store" });
      if (res.status === 404) {
        setError("Sala no encontrada. ¿El código es correcto? (En modo memoria, la sala se pierde si el servidor se reinicia.)");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setState(await res.json());
      setError(null);
    } catch {
      setError("Sin conexión con el servidor, reintentando…");
    }
  }, [code]);
  useEffect(() => {
    if (!code) return;
    refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [code, intervalMs, refresh]);
  return { state, error, refresh };
}

export class ScoreError extends Error {
  constructor(message: string, public retry: boolean) {
    super(message);
  }
}

/** Envía un puntaje. Reintenta 3 veces ante fallos de red o del servidor (5xx). */
export async function postScore(code: string, team: Team, key: string, score: number) {
  let last: ScoreError | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 600 * 2 ** attempt + Math.random() * 300));
    let res: Response;
    try {
      res = await fetch(`/api/salas/${encodeURIComponent(code)}/puntaje`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: team.id, team, key, score: Math.round(score) }),
        cache: "no-store",
      });
    } catch {
      last = new ScoreError("sin conexión con el servidor", true);
      continue;
    }
    if (res.ok) return (await res.json()) as { best: number };
    const msg = (await res.json().catch(() => ({}))).error || `error ${res.status}`;
    last = new ScoreError(msg, res.status >= 500);
    if (res.status < 500) break; // error de validación: reintentar no sirve
  }
  throw last!;
}

// Cola local de puntajes que no se pudieron enviar; se reintentan solos.
const pendingKey = (code: string) => `ccb:pendientes:${code}`;
type Pending = { key: string; score: number };
export function getPending(code: string): Pending[] {
  try {
    return JSON.parse(safeGet(pendingKey(code)) || "[]");
  } catch {
    return [];
  }
}
export function addPending(code: string, p: Pending) {
  const list = getPending(code).filter((x) => !(x.key === p.key && x.score <= p.score));
  if (!list.some((x) => x.key === p.key && x.score >= p.score)) list.push(p);
  safeSet(pendingKey(code), JSON.stringify(list));
}
export async function flushPending(code: string, team: Team) {
  const list = getPending(code);
  if (!list.length) return 0;
  const left: Pending[] = [];
  let sent = 0;
  for (const p of list) {
    try {
      await postScore(code, team, p.key, p.score);
      sent++;
    } catch (e) {
      if ((e as ScoreError).retry) left.push(p);
    }
  }
  safeSet(pendingKey(code), JSON.stringify(left));
  return sent;
}
