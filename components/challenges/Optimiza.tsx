"use client";

import { useState } from "react";
import type { ChallengeProps } from "../Shell";
import { EXERCISES, type Exercise } from "@/lib/optimiza";
import { runInWorker, speedupScore, type RunResult } from "@/lib/runner";

interface Attempt {
  label: string;
  ms?: number;
  correct: boolean;
  error?: string;
  speedup?: number;
  score: number;
  queries?: number | null;
}

export default function Optimiza(props: ChallengeProps) {
  const [exId, setExId] = useState(EXERCISES[0].id);
  const ex = EXERCISES.find((e) => e.id === exId)!;
  return (
    <div className="challenge">
      <div className="tabs">
        {EXERCISES.map((e, i) => (
          <button key={e.id} className={e.id === exId ? "on" : ""} onClick={() => setExId(e.id)}>
            {i + 1}. {e.emoji} {e.title}
          </button>
        ))}
      </div>
      <ExerciseView key={ex.id + props.mode} ex={ex} {...props} />
    </div>
  );
}

function ExerciseView({ ex, mode, submit }: ChallengeProps & { ex: Exercise }) {
  const dev = mode === "dev";
  const [code, setCode] = useState(ex.slow);
  const [baseline, setBaseline] = useState<RunResult | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [hints, setHints] = useState(0);

  async function ensureBaseline() {
    if (baseline?.ok) return baseline;
    setBusy("Midiendo la versión original… (tarda unos segundos, es lenta a propósito)");
    const b = await runInWorker(ex.setup, ex.slow, 30000);
    setBaseline(b);
    return b;
  }

  async function measure(label: string, src: string) {
    try {
      const b = await ensureBaseline();
      if (!b.ok) {
        setBusy(null);
        return;
      }
      setBusy(`Midiendo: ${label}…`);
      const r = await runInWorker(ex.setup, src, 20000);
      let a: Attempt;
      if (!r.ok) a = { label, correct: false, error: r.error, score: 0 };
      else {
        const correct = r.outputs!.every((o, i) => o === b.outputs![i]);
        const { speedup, score } = speedupScore(b.median!, r.median!, ex.target);
        a = { label, ms: r.median, correct, speedup, score: correct ? score : 0, queries: r.queries };
      }
      setAttempts((xs) => [a, ...xs].slice(0, 10));
      if (a.correct) submit(`optimiza:${ex.id}`, a.score);
    } finally {
      setBusy(null);
    }
  }

  const best = attempts.filter((a) => a.correct).reduce((m, a) => Math.max(m, a.score), 0);
  const last = attempts[0];
  const maxMs = Math.max(baseline?.median || 0, ...attempts.map((a) => a.ms || 0), 1);

  return (
    <div>
      <div className="card">
        <h3>
          {ex.emoji} {ex.title}
        </h3>
        <p>{dev ? ex.dev : ex.facil}</p>
        <p className="muted small">
          Puntaje: 0 si el resultado cambia. Si es correcto, sube con la aceleración medida (×{ex.target} = 1000 puntos). Se miden 3 corridas con datos
          distintos y se toma la mediana.
        </p>
      </div>

      <div className="grid2">
        <div className="card">
          {dev ? (
            <>
              <div className="rowBetween">
                <h3>Editor</h3>
                <div className="row">
                  <button className="link" onClick={() => setCode(ex.slow)}>
                    ↺ Restaurar original
                  </button>
                </div>
              </div>
              <textarea
                className="editor"
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const t = e.currentTarget;
                    const { selectionStart: s, selectionEnd: en } = t;
                    const v = code.slice(0, s) + "  " + code.slice(en);
                    setCode(v);
                    requestAnimationFrame(() => (t.selectionStart = t.selectionEnd = s + 2));
                  }
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") measure("Mi versión", code);
                }}
                rows={Math.max(14, code.split("\n").length + 1)}
              />
              <div className="row">
                <button className="primary" disabled={!!busy} onClick={() => measure(`Mi versión #${attempts.length + 1}`, code)}>
                  ⏱️ Ejecutar y medir <small>(Ctrl/⌘+Enter)</small>
                </button>
                {hints < ex.hints.length && (
                  <button className="secondary" onClick={() => setHints(hints + 1)}>
                    💡 Pista ({hints}/{ex.hints.length})
                  </button>
                )}
              </div>
              {hints > 0 && (
                <ol className="hints">
                  {ex.hints.slice(0, hints).map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ol>
              )}
            </>
          ) : (
            <>
              <h3>Elige un arreglo y mídelo</h3>
              <div className="patches">
                {ex.patches.map((p) => (
                  <div key={p.label} className="patch">
                    <strong>{p.label}</strong>
                    <p className="small">{p.explain}</p>
                    <details>
                      <summary className="small">Ver el código</summary>
                      <pre className="code small">{p.code}</pre>
                    </details>
                    <button className="secondary" disabled={!!busy} onClick={() => measure(p.label, p.code)}>
                      ⏱️ Probar este arreglo
                    </button>
                  </div>
                ))}
              </div>
              <details>
                <summary className="small">Ver el código original (lento)</summary>
                <pre className="code small">{ex.slow}</pre>
              </details>
            </>
          )}
        </div>

        <div className="card">
          <h3>Mediciones</h3>
          {busy && <p className="busy">⏳ {busy}</p>}
          {baseline && !baseline.ok && <p className="error">La versión original falló: {baseline.error}</p>}
          {!baseline && !busy && <p className="muted">Aún no mides nada. La primera medición también mide la versión original.</p>}
          {baseline?.ok && (
            <div className="bars">
              <Bar label={`Original${baseline.queries != null ? ` · ${baseline.queries} consultas` : ""}`} ms={baseline.median!} max={maxMs} kind="base" />
              {attempts.map((a, i) => (
                <Bar
                  key={i}
                  label={`${a.label}${a.queries != null ? ` · ${a.queries} consultas` : ""}`}
                  ms={a.ms}
                  max={maxMs}
                  kind={a.correct ? "ok" : "ko"}
                  extra={
                    a.error
                      ? `❌ ${a.error}`
                      : a.correct
                        ? `×${a.speedup!.toFixed(1)} · ${a.score} pts`
                        : "❌ Resultado distinto: 0 pts (¡rápido pero incorrecto!)"
                  }
                />
              ))}
            </div>
          )}
          {last && (
            <p className="lesson">
              {last.correct && last.score >= 800 ? "🎉 " : ""}
              {last.correct ? (last.score >= 800 ? ex.lesson : "Mejoró, pero hay una idea que gana mucho más. ¿Puedes encontrarla?") : "Recuerda: optimizar sin mantener el resultado correcto no cuenta."}
            </p>
          )}
          {best > 0 && <p className="muted small">Mejor puntaje en este ejercicio (sesión actual): {best}</p>}
        </div>
      </div>
    </div>
  );
}

function Bar({ label, ms, max, kind, extra }: { label: string; ms?: number; max: number; kind: string; extra?: string }) {
  return (
    <div className={`barRow ${kind}`}>
      <div className="barLabel">
        <span>{label}</span>
        <span className="mono">{ms != null ? `${ms.toFixed(1)} ms` : "—"}</span>
      </div>
      <div className="barTrack">
        <div style={{ width: `${ms != null ? Math.max(0.5, (ms / max) * 100) : 0}%` }} />
      </div>
      {extra && <div className="small">{extra}</div>}
    </div>
  );
}
