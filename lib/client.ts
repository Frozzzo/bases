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

export async function postScore(code: string, teamId: string, key: string, score: number) {
  const res = await fetch(`/api/salas/${code}/puntaje`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamId, key, score: Math.round(score) }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Error al enviar");
  return (await res.json()) as { best: number };
}
