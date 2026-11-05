"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { CHALLENGES } from "@/lib/challenges";
import { addPending, flushPending, getPending, getPracticeMode, getSavedTeam, postScore, savePracticeMode, type Mode, type ScoreError, type Team } from "@/lib/client";
import { Ranking } from "./Ranking";

export interface ChallengeProps {
  mode: Mode;
  /** Envía un puntaje 0..1000 para la clave dada ("reto" o "reto:sub"). */
  submit: (key: string, score: number) => Promise<void>;
  /** Código de sala, o null en modo práctica. */
  code: string | null;
}

/** Para retos tipo cuestionario: en una sala solo cuenta el primer intento. */
export function lockKey(code: string | null, key: string) {
  return code ? `ccb:hecho:${code}:${key}` : null;
}
export function isLocked(code: string | null, key: string): string | null {
  const k = lockKey(code, key);
  if (!k) return null;
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
export function setLocked(code: string | null, key: string, value: string) {
  const k = lockKey(code, key);
  if (!k) return;
  try {
    localStorage.setItem(k, value);
  } catch {}
}

interface Toast {
  id: number;
  text: string;
}

export function ChallengeShell({
  code,
  challengeId,
  children,
}: {
  code: string | null;
  challengeId: string;
  children: (p: ChallengeProps) => ReactNode;
}) {
  const info = CHALLENGES.find((c) => c.id === challengeId)!;
  const [team, setTeam] = useState<Team | null>(null);
  const [mode, setMode] = useState<Mode>("facil");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ready, setReady] = useState(false);

  const [pending, setPending] = useState(0);
  // Reintenta en segundo plano los puntajes que quedaron pendientes.
  useEffect(() => {
    if (!code || !team) return;
    const tick = async () => {
      if (!getPending(code).length) return setPending(0);
      const sent = await flushPending(code, team);
      setPending(getPending(code).length);
      if (sent) toast(`Se enviaron ${sent} puntaje(s) pendiente(s) ✅`);
    };
    tick();
    const id = setInterval(tick, 8000);
    return () => clearInterval(id);
  }, [code, team]);

  useEffect(() => {
    if (code) {
      const t = getSavedTeam(code);
      setTeam(t);
      if (t) setMode(t.mode);
    } else setMode(getPracticeMode());
    setReady(true);
  }, [code]);

  const toast = (text: string) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, text }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 4000);
  };

  const submit = async (key: string, score: number) => {
    const s = Math.max(0, Math.min(1000, Math.round(score)));
    if (!code || !team) {
      toast(`Puntaje: ${s} (modo práctica, no se guarda)`);
      return;
    }
    try {
      const { best } = await postScore(code, team, key, s);
      toast(best > s ? `Puntaje: ${s}. Tu mejor marca sigue siendo ${best}.` : s > 0 ? `¡Puntaje enviado: ${s}! 🎉` : "Puntaje: 0. ¡Prueba otra estrategia!");
    } catch (e) {
      const err = e as ScoreError;
      if (err.retry) {
        addPending(code, { key, score: s });
        setPending(getPending(code).length);
        toast(`No se pudo enviar (${err.message}). Quedó guardado y se reenviará solo.`);
      } else toast(`No se pudo enviar el puntaje: ${err.message}`);
    }
  };

  const back = code ? `/sala/${code}` : "/practica";

  return (
    <div className="page">
      <header className="topbar">
        <Link href={back} className="back">
          ← {code ? `Sala ${code}` : "Práctica"}
        </Link>
        <h1>
          {info.emoji} {info.title}
        </h1>
        <div className="modeToggle" role="group" aria-label="Modo">
          {(["facil", "dev"] as Mode[]).map((m) => (
            <button
              key={m}
              className={mode === m ? "on" : ""}
              onClick={() => {
                setMode(m);
                if (!code) savePracticeMode(m);
              }}
            >
              {m === "facil" ? "🌱 Fácil" : "🧑‍💻 Dev"}
            </button>
          ))}
        </div>
      </header>
      {code && ready && !team && (
        <div className="banner warn">
          No estás unido a la sala {code} desde este navegador. <Link href={`/?sala=${code}`}>Únete aquí</Link> para que tus puntajes cuenten.
        </div>
      )}
      {pending > 0 && (
        <div className="banner warn">⏳ {pending} puntaje(s) pendiente(s) de enviar. Se reintentan solos cada pocos segundos.</div>
      )}
      <div className={code ? "withSide" : ""}>
        <main>{ready && children({ mode, submit, code })}</main>
        {code && (
          <aside className="side">
            <Ranking code={code} compact highlight={team?.id} />
          </aside>
        )}
      </div>
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
