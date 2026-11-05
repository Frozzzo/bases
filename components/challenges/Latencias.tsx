"use client";

import { useEffect, useMemo, useState } from "react";
import { isLocked, setLocked, type ChallengeProps } from "../Shell";

interface Op {
  id: string;
  ns: number;
  facil: string;
  dev: string;
  devOnly?: boolean;
  note: string;
}

// Valores aproximados ("Latency numbers every programmer should know", actualizados a hardware ~2020+).
const OPS: Op[] = [
  { id: "l1", ns: 1, facil: "La CPU lee un dato que tiene en su bolsillo (caché L1)", dev: "Referencia a caché L1", note: "Está literalmente dentro del núcleo." },
  { id: "l2", ns: 4, facil: "", dev: "Referencia a caché L2", devOnly: true, note: "Un poco más lejos, aún dentro del chip." },
  { id: "mutex", ns: 17, facil: "", dev: "Lock/unlock de un mutex sin contención", devOnly: true, note: "Barato… hasta que hay contención." },
  { id: "ram", ns: 100, facil: "La CPU busca un dato en la memoria RAM", dev: "Referencia a memoria principal (RAM)", note: "~100 ciclos de reloj esperando." },
  { id: "zip", ns: 2_000, facil: "", dev: "Comprimir 1 KB con un compresor rápido (Snappy/LZ4)", devOnly: true, note: "Miles de instrucciones, pero todo en caché." },
  { id: "ssd", ns: 20_000, facil: "Leer un archivo pequeño de un disco SSD", dev: "Lectura aleatoria de 4 KB en SSD NVMe", note: "Entre 10 y 100 µs según el disco." },
  { id: "dc", ns: 500_000, facil: "Pedirle algo a otro servidor en el mismo edificio", dev: "Round trip dentro del mismo datacenter", note: "Red + kernel + serialización." },
  { id: "hdd", ns: 5_000_000, facil: "Un disco duro mecánico mueve su cabezal", dev: "Seek en disco duro (HDD)", note: "Física: un brazo que se mueve y un plato que gira." },
  { id: "region", ns: 30_000_000, facil: "", dev: "Round trip a otra región del mismo continente", devOnly: true, note: "La luz en fibra viaja a ~200 000 km/s." },
  { id: "world", ns: 150_000_000, facil: "Enviar un mensaje a otro continente y recibir respuesta", dev: "Round trip intercontinental (p. ej. California ↔ Países Bajos)", note: "No se puede optimizar la velocidad de la luz." },
];

const MAGS = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9];
function fmtNs(ns: number) {
  if (ns < 1e3) return `${ns} ns`;
  if (ns < 1e6) return `${+(ns / 1e3).toFixed(1)} µs`;
  if (ns < 1e9) return `${+(ns / 1e6).toFixed(1)} ms`;
  return `${+(ns / 1e9).toFixed(1)} s`;
}
function human(ns: number) {
  // Si 1 ns fuera 1 segundo…
  const s = ns;
  if (s < 60) return `${s} segundo${s === 1 ? "" : "s"}`;
  if (s < 3600) return `${Math.round(s / 60)} minutos`;
  if (s < 86400) return `${+(s / 3600).toFixed(1)} horas`;
  if (s < 86400 * 60) return `${+(s / 86400).toFixed(1)} días`;
  if (s < 86400 * 365) return `${+(s / (86400 * 30)).toFixed(1)} meses`;
  return `${+(s / (86400 * 365)).toFixed(1)} años`;
}
const HUMAN_EXAMPLE: Record<string, string> = {
  l1: "chasquear los dedos",
  l2: "tomar un sorbo de café",
  mutex: "atarse los zapatos",
  ram: "ir a la cocina por un vaso de agua",
  zip: "ver un capítulo de una serie",
  ssd: "una jornada laboral",
  dc: "unas vacaciones de una semana",
  hdd: "unas vacaciones de verano de dos meses",
  region: "casi un año",
  world: "estudiar una carrera universitaria completa",
};

function shuffle<T>(arr: T[], seed: number) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // Evita que salga ordenado de casualidad
  return a;
}

export default function Latencias({ mode, submit, code }: ChallengeProps) {
  const dev = mode === "dev";
  const ops = useMemo(() => OPS.filter((o) => dev || !o.devOnly), [dev]);
  const [order, setOrder] = useState<string[]>(() => shuffle(ops, 7).map((o) => o.id));
  const [guess, setGuess] = useState<Record<string, number>>({});
  const [result, setResult] = useState<null | { orderScore: number; estScore: number; total: number }>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [locked, setLockedState] = useState<string | null>(null);

  useEffect(() => {
    const l = isLocked(code, "latencias");
    if (l) {
      setLockedState(l);
      try {
        const saved = JSON.parse(l);
        if (saved.order) setOrder(saved.order.filter((id: string) => ops.some((o) => o.id === id)));
        if (saved.guess) setGuess(saved.guess);
        setResult(saved.result);
      } catch {}
    }
  }, [code, ops]);

  const byId = (id: string) => OPS.find((o) => o.id === id)!;

  function move(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const o = [...order];
    [o[i], o[j]] = [o[j], o[i]];
    setOrder(o);
  }
  function dropOn(target: string) {
    if (!dragging || dragging === target) return;
    const o = order.filter((x) => x !== dragging);
    o.splice(o.indexOf(target), 0, dragging);
    setOrder(o);
  }

  function check() {
    let good = 0,
      pairs = 0;
    for (let i = 0; i < order.length; i++)
      for (let j = i + 1; j < order.length; j++) {
        pairs++;
        if (byId(order[i]).ns < byId(order[j]).ns) good++;
      }
    const frac = good / pairs;
    const orderScore = Math.max(0, (frac - 0.5) / 0.5); // al azar ≈ 0
    let est = 0;
    if (dev) {
      for (const o of ops) {
        const g = guess[o.id];
        if (!g) continue;
        const d = Math.abs(Math.log10(g) - Math.log10(o.ns));
        est += Math.max(0, 1 - d / 2);
      }
      est /= ops.length;
    }
    const total = Math.round(dev ? 600 * orderScore + 400 * est : 1000 * orderScore);
    const r = { orderScore, estScore: est, total };
    setResult(r);
    setLocked(code, "latencias", JSON.stringify({ order, guess, result: r }));
    setLockedState("1");
    submit("latencias", total);
  }

  const sorted = [...ops].sort((a, b) => a.ns - b.ns);
  const done = !!result;

  return (
    <div className="challenge">
      <div className="intro">
        <p>
          {dev
            ? "Ordena de la más rápida (arriba) a la más lenta (abajo) y estima el orden de magnitud de cada operación. 60% del puntaje es el orden y 40% la estimación."
            : "Ordena estas acciones de la más rápida (arriba) a la más lenta (abajo). Arrastra las tarjetas o usa las flechas."}{" "}
          {code && <strong>En la sala solo cuenta el primer intento.</strong>}
        </p>
      </div>
      <div className="grid2">
        <div className="card">
          <h3>{done ? "Tu respuesta" : "Ordénalas"}</h3>
          <ol className="sortList">
            {order.map((id, i) => {
              const o = byId(id);
              const correctPos = sorted.findIndex((x) => x.id === id);
              return (
                <li
                  key={id}
                  draggable={!done}
                  onDragStart={() => setDragging(id)}
                  onDragEnd={() => setDragging(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dropOn(id)}
                  className={`sortItem ${dragging === id ? "dragging" : ""} ${done ? (correctPos === i ? "ok" : "ko") : ""}`}
                >
                  <span className="pos">{i + 1}</span>
                  <span className="opText">{dev ? o.dev : o.facil}</span>
                  {dev && (
                    <select
                      value={guess[id] || ""}
                      disabled={done}
                      onChange={(e) => setGuess({ ...guess, [id]: Number(e.target.value) })}
                      aria-label="Estimación"
                    >
                      <option value="">¿cuánto?</option>
                      {MAGS.map((m) => (
                        <option key={m} value={m}>
                          ~{fmtNs(m)}
                        </option>
                      ))}
                    </select>
                  )}
                  {!done && (
                    <span className="arrows">
                      <button onClick={() => move(i, -1)} aria-label="Subir">
                        ▲
                      </button>
                      <button onClick={() => move(i, 1)} aria-label="Bajar">
                        ▼
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          {!done && (
            <button className="primary" onClick={check} disabled={dev && ops.some((o) => !guess[o.id])}>
              {dev && ops.some((o) => !guess[o.id]) ? `Estima todas (${ops.filter((o) => guess[o.id]).length}/${ops.length})` : "✅ Comprobar"}
            </button>
          )}
          {done && result && (
            <div className="result">
              <h3>
                Puntaje: <span className="bigNum">{result.total}</span> / 1000
              </h3>
              <p className="muted small">
                Orden: {(result.orderScore * 100).toFixed(0)}%{dev && ` · Estimaciones: ${(result.estScore * 100).toFixed(0)}%`}
              </p>
              {!locked || !code ? (
                <button
                  className="secondary"
                  onClick={() => {
                    setResult(null);
                    setOrder(shuffle(ops, Date.now() % 1000).map((o) => o.id));
                    setGuess({});
                  }}
                >
                  Intentar de nuevo
                </button>
              ) : null}
            </div>
          )}
        </div>
        <div className="card">
          <h3>La respuesta a escala humana</h3>
          {!done ? (
            <p className="muted">Se revela al comprobar. 🤫</p>
          ) : (
            <>
              <p>
                Si <strong>1 nanosegundo fuera 1 segundo</strong>…
              </p>
              <ul className="scaleList">
                {sorted.map((o) => (
                  <li key={o.id}>
                    <div className="scaleHead">
                      <strong>{dev ? o.dev : o.facil}</strong>
                      <span className="mono">{fmtNs(o.ns)}</span>
                    </div>
                    <div className="logbar">
                      <div style={{ width: `${(Math.log10(o.ns) / Math.log10(2e8)) * 100 + 2}%` }} />
                    </div>
                    <div className="small">
                      ≈ {human(o.ns)} — como {HUMAN_EXAMPLE[o.id]}. <span className="muted">{o.note}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="small muted">Barras en escala logarítmica: cada salto de ancho es ×10. Valores aproximados; varían según el hardware.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
