"use client";

import { useEffect, useState } from "react";
import { isLocked, setLocked, type ChallengeProps } from "../Shell";

// ---------- Modo fácil: 4 gráficos de memoria ----------
interface App {
  id: string;
  name: string;
  leak: boolean;
  gen: (t: number) => number;
  explain: string;
}
const saw = (t: number, period: number) => (t % period) / period;
const APPS: App[] = [
  {
    id: "a",
    name: "App de notas",
    leak: false,
    gen: (t) => 120 + 60 * saw(t, 8),
    explain: "Sierra estable: la memoria sube y el recolector de basura (GC) la limpia. Siempre vuelve al mismo piso. Sano.",
  },
  {
    id: "b",
    name: "Chat en vivo",
    leak: true,
    gen: (t) => 110 + t * 4 + 50 * saw(t, 7),
    explain: "El GC limpia, pero el piso sube y sube. Algo se guarda y nunca se suelta: fuga.",
  },
  {
    id: "c",
    name: "Tienda online",
    leak: false,
    gen: (t) => (t < 15 ? 100 + t * 9 : 235) + 40 * saw(t, 9),
    explain: "Sube al inicio (llena su caché) y luego se estabiliza: la caché tiene tamaño máximo. No es fuga.",
  },
  {
    id: "d",
    name: "Panel de reportes",
    leak: true,
    gen: (t) => 120 + Math.floor(t / 12) * 45 + 30 * saw(t, 6),
    explain: "Escalones: cada vez que se abre un reporte, la memoria sube y no vuelve a bajar. Fuga (p. ej. listeners que nunca se quitan).",
  },
];

// ---------- Modo dev: snippets ----------
interface Snippet {
  id: string;
  title: string;
  code: string;
  leak: boolean;
  explain: string;
}
const SNIPPETS: Snippet[] = [
  {
    id: "cache",
    title: "Caché de respuestas",
    leak: true,
    code: `const cache = new Map();
app.get("/report/:id", async (req, res) => {
  const key = req.params.id + ":" + req.headers["x-request-id"];
  if (!cache.has(key)) cache.set(key, await buildReport(req.params.id));
  res.json(cache.get(key));
});`,
    explain: "La clave incluye el request-id, así que nunca hay hit y el Map crece para siempre. Una caché sin límite ni TTL es una fuga con buen marketing.",
  },
  {
    id: "lru",
    title: "Caché con límite",
    leak: false,
    code: `const cache = new LRUCache({ max: 1000, ttl: 60_000 });
function getUser(id) {
  let u = cache.get(id);
  if (!u) { u = db.findUser(id); cache.set(id, u); }
  return u;
}`,
    explain: "Tamaño máximo y TTL: la memoria crece hasta un techo y se estabiliza.",
  },
  {
    id: "listener",
    title: "Componente con resize",
    leak: true,
    code: `useEffect(() => {
  const bigData = computeLayout(items); // ~5 MB
  window.addEventListener("resize", () => relayout(bigData));
}, [items]);`,
    explain: "Cada vez que cambia items se agrega un listener nuevo que retiene su bigData, y nunca se remueve (falta el return con removeEventListener).",
  },
  {
    id: "weakmap",
    title: "Metadatos de nodos DOM",
    leak: false,
    code: `const meta = new WeakMap();
function track(node) {
  meta.set(node, { clicks: 0, createdAt: Date.now() });
}`,
    explain: "WeakMap no impide que el nodo sea recolectado: cuando el nodo desaparece, su entrada también.",
  },
  {
    id: "interval",
    title: "Polling de un widget",
    leak: true,
    code: `function mountWidget(el, history) {
  setInterval(() => {
    el.textContent = summarize(history); // history: miles de puntos
  }, 1000);
}`,
    explain: "El setInterval nunca se limpia: mantiene vivo el closure con el, history… aunque el widget ya se haya quitado de la página.",
  },
  {
    id: "closure",
    title: "Procesar un archivo",
    leak: false,
    code: `async function checksum(path) {
  const buffer = await fs.readFile(path); // 50 MB
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  return hash; // solo devolvemos un string corto
}`,
    explain: "El buffer es grande pero local: cuando la función termina, nadie lo referencia y el GC lo libera.",
  },
  {
    id: "emitter",
    title: "Suscripción por petición",
    leak: true,
    code: `const bus = require("./event-bus"); // singleton
app.post("/upload", (req, res) => {
  bus.on("progress", (p) => log(req.id, p));
  startUpload(req).then(() => res.sendStatus(201));
});`,
    explain: "Cada petición agrega un listener a un emisor que vive para siempre y nunca hace off(). Node avisará con MaxListenersExceededWarning.",
  },
  {
    id: "buffer",
    title: "Buffer de logs",
    leak: false,
    code: `let pending = [];
export function log(line) { pending.push(line); }
setInterval(async () => {
  const batch = pending; pending = [];
  await sendToCollector(batch);
}, 5000);`,
    explain: "Crece, pero se vacía cada 5 s. Mientras el colector responda, la memoria se mantiene acotada (vigila qué pasa si el colector falla…).",
  },
];

function Chart({ gen }: { gen: (t: number) => number }) {
  const W = 300,
    H = 110,
    N = 60;
  const pts = Array.from({ length: N + 1 }, (_, i) => {
    const t = i;
    return `${(i / N) * W},${H - (gen(t) / 450) * H}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="memChart" preserveAspectRatio="none">
      <polyline points={pts} />
    </svg>
  );
}

export default function Fuga({ mode, submit, code }: ChallengeProps) {
  const dev = mode === "dev";
  const items = dev ? SNIPPETS : APPS;
  const [choice, setChoice] = useState<Record<string, boolean | undefined>>({});
  const [result, setResult] = useState<number | null>(null);
  const [locked, setLockedState] = useState<string | null>(null);

  useEffect(() => {
    setLockedState(isLocked(code, "fuga"));
  }, [code]);

  const allAnswered = items.every((i) => choice[i.id] !== undefined);

  function check() {
    const per = 1000 / items.length;
    let s = 0;
    for (const it of items) if (choice[it.id] === it.leak) s += per;
    const score = Math.round(s);
    setResult(score);
    setLocked(code, "fuga", String(score));
    submit("fuga", score);
  }

  if (locked && result === null)
    return (
      <div className="card">
        <h3>Ya cazaron esta fuga en esta sala: {locked} / 1000 🧠</h3>
        <p>En la sala solo cuenta el primer intento. Puedes repetirlo en modo práctica desde la página de inicio.</p>
      </div>
    );

  return (
    <div className="challenge">
      <div className="intro">
        <p>
          {dev
            ? "Tu servicio de Node/React se cae por OOM cada pocas horas. Revisa estos fragmentos y marca cuáles retienen memoria indefinidamente."
            : "Estas son gráficas de la memoria de cuatro aplicaciones durante una hora. Una “fuga de memoria” es cuando un programa guarda cosas y nunca las suelta, hasta quedarse sin espacio. ¿Cuáles tienen fuga?"}
        </p>
      </div>
      {dev && (
        <div className="card">
          <h3>Pista: comparación de heap snapshots (antes / después de 1 000 peticiones)</h3>
          <table className="snap">
            <thead>
              <tr>
                <th>Constructor</th>
                <th className="num"># nuevos</th>
                <th className="num">Δ tamaño</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="mono">(closure)</td><td className="num">+2 004</td><td className="num">+9,8 MB</td></tr>
              <tr><td className="mono">Map entry</td><td className="num">+1 000</td><td className="num">+48,1 MB</td></tr>
              <tr><td className="mono">Timeout</td><td className="num">+37</td><td className="num">+2,3 MB</td></tr>
              <tr><td className="mono">Buffer</td><td className="num">+0</td><td className="num">+0,1 MB</td></tr>
              <tr><td className="mono">LRUCache node</td><td className="num">+0</td><td className="num">+0 MB</td></tr>
            </tbody>
          </table>
          <p className="muted small">Busca lo que crece proporcionalmente al número de peticiones y nunca baja tras un GC.</p>
        </div>
      )}
      <div className={dev ? "snippets" : "apps"}>
        {dev
          ? SNIPPETS.map((s) => (
              <div key={s.id} className={`card snippet ${result !== null ? (choice[s.id] === s.leak ? "ok" : "ko") : ""}`}>
                <h4>{s.title}</h4>
                <pre className="code small">{s.code}</pre>
                <Choice id={s.id} value={choice[s.id]} onChange={(v) => setChoice({ ...choice, [s.id]: v })} disabled={result !== null} />
                {result !== null && (
                  <p className="small">
                    <strong>{s.leak ? "Fuga." : "Sin fuga."}</strong> {s.explain}
                  </p>
                )}
              </div>
            ))
          : APPS.map((a) => (
              <div key={a.id} className={`card app ${result !== null ? (choice[a.id] === a.leak ? "ok" : "ko") : ""}`}>
                <h4>{a.name}</h4>
                <Chart gen={a.gen} />
                <div className="muted small rowBetween">
                  <span>0 min</span>
                  <span>memoria →</span>
                  <span>60 min</span>
                </div>
                <Choice id={a.id} value={choice[a.id]} onChange={(v) => setChoice({ ...choice, [a.id]: v })} disabled={result !== null} />
                {result !== null && (
                  <p className="small">
                    <strong>{a.leak ? "Fuga." : "Sin fuga."}</strong> {a.explain}
                  </p>
                )}
              </div>
            ))}
      </div>
      <div className="card">
        {result === null ? (
          <button className="primary" disabled={!allAnswered} onClick={check}>
            {allAnswered ? "✅ Comprobar" : `Responde todas (${Object.keys(choice).length}/${items.length})`}
          </button>
        ) : (
          <>
            <h3>
              Resultado: <span className="bigNum">{result}</span> / 1000
            </h3>
            <p>
              Lección: una fuga no es “usar mucha memoria”, es <strong>retener memoria que ya no se necesita</strong>. Las causas típicas: cachés sin
              límite, listeners/timers que no se limpian y referencias desde objetos que viven para siempre (singletons, globales). La herramienta: comparar
              heap snapshots y mirar qué crece con cada operación.
            </p>
            {!code && (
              <button
                className="secondary"
                onClick={() => {
                  setResult(null);
                  setChoice({});
                }}
              >
                Intentar de nuevo
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Choice({ id, value, onChange, disabled }: { id: string; value?: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
  return (
    <div className="segmented small" role="radiogroup" aria-label={`¿${id} tiene fuga?`}>
      <button className={value === true ? "on bad" : ""} onClick={() => onChange(true)} disabled={disabled}>
        💧 Fuga
      </button>
      <button className={value === false ? "on" : ""} onClick={() => onChange(false)} disabled={disabled}>
        ✅ Sana
      </button>
    </div>
  );
}
