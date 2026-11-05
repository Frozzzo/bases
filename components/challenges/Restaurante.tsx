"use client";

import { useEffect, useRef, useState } from "react";
import type { ChallengeProps } from "../Shell";
import {
  DEFAULT_PARAMS,
  Restaurant,
  SIM,
  normalized,
  percentile,
  rateAt,
  scoreOf,
  type Customer,
  type Params,
  type Policy,
} from "@/lib/sim/restaurante";

const POLICIES: { id: Policy; facil: string; dev: string; hint: string }[] = [
  { id: "aceptar", facil: "Dejar pasar a todos", dev: "Cola sin límite", hint: "Nadie se queda afuera… pero la fila puede crecer sin fin." },
  {
    id: "rechazar",
    facil: "Cerrar la puerta si la fila está llena",
    dev: "Rechazar al llegar (back pressure / 429)",
    hint: "Al que llega con la fila llena se le dice “vuelve más tarde”.",
  },
  {
    id: "descartar-viejo",
    facil: "Sacar al que más lleva esperando",
    dev: "Descartar el más antiguo (drop head)",
    hint: "Se hace espacio sacando al primero de la fila.",
  },
];

function face(c: Customer, t: number) {
  if (c.left) return "👻";
  const w = t - c.arrival;
  if (w < SIM.patience * 0.4) return "🙂";
  if (w < SIM.patience * 0.75) return "😐";
  return "😠";
}

export default function Restaurante({ mode, submit }: ChallengeProps) {
  const dev = mode === "dev";
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [speed, setSpeed] = useState(8);
  const simRef = useRef<Restaurant | null>(null);
  const [, setFrame] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState<{ raw: number; score: number; params: Params } | null>(null);
  const [history, setHistory] = useState<{ score: number; label: string }[]>([]);
  const raf = useRef<number>(0);

  const effective: Params = dev ? params : { ...params, order: "fifo", deadlineCheck: false };

  function start() {
    cancelAnimationFrame(raf.current);
    const sim = new Restaurant(effective);
    simRef.current = sim;
    setFinished(null);
    if (speed === 0) {
      sim.runToEnd();
      finish(sim);
      setFrame((f) => f + 1);
      return;
    }
    setRunning(true);
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      acc += ((now - last) / 1000) * speed;
      last = now;
      while (acc >= SIM.dt && !sim.done) {
        sim.step();
        acc -= SIM.dt;
      }
      setFrame((f) => f + 1);
      if (sim.done) {
        setRunning(false);
        finish(sim);
      } else raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  }

  function finish(sim: Restaurant) {
    const raw = scoreOf(sim.stats, sim.params.cooks);
    const score = normalized(raw);
    setFinished({ raw, score, params: sim.params });
    const pol = POLICIES.find((p) => p.id === sim.params.policy)!;
    setHistory((h) =>
      [
        {
          score,
          label: `${sim.params.cooks} 👩‍🍳 · ${dev ? pol.dev : pol.facil}${sim.params.policy !== "aceptar" ? ` (${sim.params.queueLimit})` : ""}${
            dev ? ` · ${sim.params.order.toUpperCase()}${sim.params.deadlineCheck ? " · deadline" : ""}` : ""
          }`,
        },
        ...h,
      ].slice(0, 8)
    );
    submit("restaurante", score);
  }

  function stop() {
    cancelAnimationFrame(raf.current);
    setRunning(false);
  }

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const sim = simRef.current;
  const t = sim?.t ?? 0;
  const s = sim?.stats;
  const set = <K extends keyof Params>(k: K, v: Params[K]) => setParams((p) => ({ ...p, [k]: v }));
  const rush = t >= SIM.rushStart && t < SIM.rushEnd;
  const queueShown = sim ? sim.queue.slice(0, 48) : [];
  const live = sim && s ? liveMetrics(sim) : null;

  return (
    <div className="challenge">
      <div className="intro">
        {dev ? (
          <p>
            Tu servicio tiene <strong>workers</strong> (cocineros) y una <strong>cola</strong>. Entre t=50 s y t=110 s llega una hora pico de{" "}
            {SIM.rushRate} req/s (normal: {SIM.baseRate} req/s), cada pedido tarda ~2,5 s y los clientes tienen un timeout de {SIM.patience} s… pero el
            servidor <em>no se entera</em> de que el cliente se fue, salvo que revises el deadline. Cada worker cuesta {SIM.cookCost} puntos. Maximiza el
            puntaje.
          </p>
        ) : (
          <p>
            Eres el gerente de un restaurante. A mitad del turno llega la <strong>hora pico</strong> 🔥. Cada cliente espera como máximo{" "}
            {SIM.patience} segundos: si no recibe su comida, se va enojado 😠 y su plato se cocina para nadie 👻. Contratar cocineros cuesta. ¿Cómo
            organizas la fila?
          </p>
        )}
      </div>

      <div className="restoLayout">
        <div className="card controls">
          <h3>Configuración</h3>
          <label>
            {dev ? "Workers" : "Cocineros"}: <strong>{params.cooks}</strong>
            <input type="range" min={1} max={8} value={params.cooks} disabled={running} onChange={(e) => set("cooks", +e.target.value)} />
          </label>
          <div className="label">{dev ? "Política cuando la cola está llena" : "¿Qué hacemos cuando la fila está llena?"}</div>
          {POLICIES.map((p) => (
            <label key={p.id} className="radio">
              <input type="radio" name="policy" checked={params.policy === p.id} disabled={running} onChange={() => set("policy", p.id)} />
              <span>
                {dev ? p.dev : p.facil}
                <br />
                <small className="muted">{p.hint}</small>
              </span>
            </label>
          ))}
          <label className={params.policy === "aceptar" ? "disabled" : ""}>
            {dev ? "Tamaño máximo de la cola" : "Lugares en la fila"}: <strong>{params.queueLimit}</strong>
            <input
              type="range"
              min={1}
              max={40}
              value={params.queueLimit}
              disabled={running || params.policy === "aceptar"}
              onChange={(e) => set("queueLimit", +e.target.value)}
            />
          </label>
          {dev && (
            <>
              <div className="label">Orden de atención</div>
              <div className="segmented small">
                <button className={params.order === "fifo" ? "on" : ""} disabled={running} onClick={() => set("order", "fifo")}>
                  FIFO
                </button>
                <button className={params.order === "lifo" ? "on" : ""} disabled={running} onClick={() => set("order", "lifo")}>
                  LIFO
                </button>
              </div>
              <label className="check">
                <input type="checkbox" checked={params.deadlineCheck} disabled={running} onChange={(e) => set("deadlineCheck", e.target.checked)} />
                Revisar el deadline antes de procesar (descartar pedidos vencidos)
              </label>
            </>
          )}
          <div className="label">Velocidad</div>
          <div className="segmented small">
            {[
              [4, "x4"],
              [8, "x8"],
              [20, "x20"],
              [0, "⚡ al instante"],
            ].map(([v, l]) => (
              <button key={v} className={speed === v ? "on" : ""} onClick={() => setSpeed(v as number)} disabled={running}>
                {l}
              </button>
            ))}
          </div>
          <div className="row">
            {!running ? (
              <button className="primary" onClick={start}>
                ▶ {dev ? "Simular turno" : "Abrir el restaurante"}
              </button>
            ) : (
              <button className="secondary" onClick={stop}>
                ⏹ Detener
              </button>
            )}
          </div>
          <details className="small">
            <summary>¿Cómo se calcula el puntaje?</summary>
            <ul>
              <li>Cliente feliz: +{SIM.points.happy}</li>
              <li>Se fue enojado tras esperar: {SIM.points.abandoned}</li>
              <li>Rechazado en la puerta: {SIM.points.rejected}</li>
              <li>Sacado de la fila: {SIM.points.dropped}</li>
              <li>Plato cocinado para nadie: {SIM.points.wasted}</li>
              <li>Cada cocinero: −{SIM.cookCost}</li>
            </ul>
            El total se convierte a 0–1000 (1000 = la mejor configuración posible).
          </details>
        </div>

        <div className="card stage">
          <div className="clockRow">
            <span>
              ⏰ {t.toFixed(0)} / {SIM.duration} s
            </span>
            <span className={rush ? "rush on" : "rush"}>{rush ? "🔥 HORA PICO" : "Ritmo normal"}</span>
            <span className="muted small">llegan {rateAt(t)} clientes/s</span>
          </div>
          <div className="progress">
            <div style={{ width: `${(t / SIM.duration) * 100}%` }} />
            <div className="rushZone" style={{ left: `${(SIM.rushStart / SIM.duration) * 100}%`, width: `${((SIM.rushEnd - SIM.rushStart) / SIM.duration) * 100}%` }} />
          </div>

          <div className="laneTitle">
            {dev ? "Cola" : "Fila"} ({sim?.queue.length ?? 0}
            {params.policy !== "aceptar" ? ` / ${effective.queueLimit}` : ""})
          </div>
          <div className="lane">
            {queueShown.map((c) => (
              <span key={c.id} className="cust" title={`espera ${(t - c.arrival).toFixed(1)} s`}>
                {face(c, t)}
              </span>
            ))}
            {sim && sim.queue.length > queueShown.length && <span className="more">+{sim.queue.length - queueShown.length}</span>}
            {!sim && <span className="muted">La fila está vacía. Pulsa ▶ para abrir.</span>}
          </div>

          <div className="laneTitle">{dev ? "Workers" : "Cocina"}</div>
          <div className="kitchen">
            {Array.from({ length: (sim?.params.cooks ?? params.cooks) }).map((_, i) => {
              const c = sim?.cooking[i];
              const prog = c ? Math.min(1, (t - (c.startedAt || 0)) / c.cookTime) : 0;
              return (
                <div key={i} className={`cook ${c ? "busy" : ""}`}>
                  <div className="cookIcon">👩‍🍳</div>
                  <div className="cookOrder">{c ? (c.left ? "👻" : "🍔") : "💤"}</div>
                  <div className="bar">
                    <div style={{ width: `${prog * 100}%` }} className={c?.left ? "ghost" : ""} />
                  </div>
                </div>
              );
            })}
          </div>

          {s && (
            <div className="counters">
              <Counter emoji="😋" label="Felices" v={s.happy} good />
              <Counter emoji="😠" label="Se fueron" v={s.abandoned} />
              <Counter emoji="🚪" label="Rechazados" v={s.rejected} />
              <Counter emoji="✂️" label="Sacados" v={s.dropped} />
              <Counter emoji="🗑️" label="Platos tirados" v={s.wasted} />
            </div>
          )}

          {sim && <Spark data={sim.queueHistory} limit={effective.policy === "aceptar" ? undefined : effective.queueLimit} />}

          {dev && live && (
            <div className="metrics">
              <span>Utilización: {(live.util * 100).toFixed(0)}%</span>
              <span>p50: {live.p50.toFixed(1)} s</span>
              <span>p95: {live.p95.toFixed(1)} s</span>
              <span>p99: {live.p99.toFixed(1)} s</span>
              <span title="Ley de Little: L = λ · W">
                Little: L≈{live.L.toFixed(1)} = λ {live.lambda.toFixed(2)}/s × W {live.W.toFixed(1)} s
              </span>
            </div>
          )}
        </div>
      </div>

      {finished && sim && (
        <div className="card result">
          <h3>
            Resultado: <span className="bigNum">{finished.score}</span> / 1000 <span className="muted small">(crudo: {finished.raw})</span>
          </h3>
          <Lessons sim={sim} dev={dev} />
        </div>
      )}
      {history.length > 0 && (
        <div className="card">
          <h3>Tus intentos</h3>
          <ol className="history">
            {history.map((h, i) => (
              <li key={i}>
                <strong>{h.score}</strong> — {h.label}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function liveMetrics(sim: Restaurant) {
  const s = sim.stats;
  const elapsed = Math.max(sim.t, 0.1);
  const lambda = s.arrived / elapsed;
  const served = sim.customers.filter((c) => c.status === "served");
  const W = served.length ? served.reduce((a, c) => a + ((c.doneAt || 0) - c.arrival), 0) / served.length : 0;
  return {
    util: s.cookBusy / (elapsed * sim.params.cooks),
    p50: percentile(s.waits, 50),
    p95: percentile(s.waits, 95),
    p99: percentile(s.waits, 99),
    lambda,
    W,
    L: lambda * W,
  };
}

function Counter({ emoji, label, v, good }: { emoji: string; label: string; v: number; good?: boolean }) {
  return (
    <div className={`counter ${good ? "good" : v > 0 ? "bad" : ""}`}>
      <div className="cE">{emoji}</div>
      <div className="cV">{v}</div>
      <div className="cL">{label}</div>
    </div>
  );
}

function Spark({ data, limit }: { data: number[]; limit?: number }) {
  const w = 600,
    h = 70;
  const max = Math.max(10, limit || 0, ...data);
  const total = SIM.duration;
  const pts = data.map((v, i) => `${(i / total) * w},${h - (v / max) * (h - 4)}`).join(" ");
  return (
    <div className="spark">
      <div className="laneTitle">Largo de la fila en el tiempo</div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <rect x={(SIM.rushStart / total) * w} width={((SIM.rushEnd - SIM.rushStart) / total) * w} y={0} height={h} className="rushRect" />
        {limit && <line x1={0} x2={w} y1={h - (limit / max) * (h - 4)} y2={h - (limit / max) * (h - 4)} className="limitLine" />}
        <polyline points={pts} className="line" />
      </svg>
    </div>
  );
}

function Lessons({ sim, dev }: { sim: Restaurant; dev: boolean }) {
  const s = sim.stats;
  const p = sim.params;
  const tips: string[] = [];
  if (s.wasted > 10)
    tips.push(
      dev
        ? `Procesaste ${s.wasted} pedidos cuyo cliente ya había hecho timeout: trabajo inútil que además retrasa a los demás. Prueba a revisar el deadline o a limitar la cola.`
        : `Cocinaste ${s.wasted} platos para clientes que ya se habían ido. Esa cocina ocupada hizo esperar aún más a los siguientes: un círculo vicioso.`
    );
  if (p.policy === "aceptar" && s.abandoned > 20)
    tips.push(
      dev
        ? "Una cola sin límite no elimina la sobrecarga: solo la convierte en latencia. Cuando W supera el timeout, casi todo el trabajo se desperdicia."
        : "Dejar pasar a todos parece amable, pero la fila crece tanto que casi nadie alcanza a comer. A veces decir “ahora no” a tiempo es mejor servicio."
    );
  if (p.policy !== "aceptar" && s.rejected + s.dropped > 0 && s.abandoned < 10)
    tips.push(
      dev
        ? "Eso es back pressure: rechazar pronto y barato protege la latencia de quienes sí entran."
        : "Limitar la fila hizo que los que entraron comieran a tiempo. Eso se llama back pressure (contrapresión)."
    );
  if (p.cooks >= 7) tips.push("Muchos cocineros resuelven la hora pico, pero pasan gran parte del turno sin hacer nada (y cuestan). ¿Puedes lograrlo con menos?");
  if (p.cooks <= 3) tips.push(`Con ${p.cooks} cocinero(s) la capacidad es ~${(p.cooks / 2.5).toFixed(1)} clientes/s y en hora pico llegan ${SIM.rushRate}/s. Ninguna fila infinita arregla eso.`);
  if (dev && p.order === "lifo") tips.push("LIFO bajo sobrecarga atiende primero a quien aún tiene paciencia; los viejos probablemente ya hicieron timeout.");
  if (!tips.length) tips.push("¡Buen equilibrio! Compara con otras configuraciones: ¿qué pasa si cambias el tamaño de la fila?");
  return (
    <ul className="lessons">
      {tips.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}
