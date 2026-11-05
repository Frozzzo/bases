"use client";

import { useEffect, useMemo, useState } from "react";
import { isLocked, setLocked, type ChallengeProps } from "../Shell";

interface Frame {
  name: string;
  self: number;
  children?: Frame[];
  desc?: string;
}

// Perfil sintético de la petición GET /checkout (1 000 ms).
const PROFILE: Frame = {
  name: "handleCheckout",
  self: 10,
  desc: "La petición completa",
  children: [
    { name: "parseRequest", self: 20 },
    {
      name: "loadCart",
      self: 10,
      children: [
        { name: "db.query", self: 150, desc: "Esperando a la base de datos" },
        { name: "mapItems", self: 20 },
      ],
    },
    {
      name: "calculateTotals",
      self: 20,
      children: [
        {
          name: "items.forEach",
          self: 40,
          children: [
            {
              name: "applyDiscounts",
              self: 30,
              children: [
                {
                  name: "getDiscountRules",
                  self: 10,
                  desc: "Se llama una vez por cada producto del carrito",
                  children: [
                    { name: "fs.readFileSync", self: 60, desc: "Lee rules.json del disco" },
                    { name: "JSON.parse", self: 400, desc: "Parsea rules.json (2 MB)" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      name: "renderReceipt",
      self: 10,
      children: [
        { name: "template.render", self: 120 },
        { name: "escapeHtml", self: 30 },
      ],
    },
    { name: "logger.info", self: 10, children: [{ name: "JSON.stringify", self: 60, desc: "Serializa el carrito entero para el log" }] },
  ],
};

function total(f: Frame): number {
  return f.self + (f.children || []).reduce((a, c) => a + total(c), 0);
}

interface Laid {
  f: Frame;
  x: number;
  w: number;
  depth: number;
  total: number;
}
function layout(f: Frame, x = 0, depth = 0, out: Laid[] = []) {
  const t = total(f);
  out.push({ f, x, w: t, depth, total: t });
  let cx = x;
  for (const c of f.children || []) {
    layout(c, cx, depth + 1, out);
    cx += total(c);
  }
  return out;
}

interface Q {
  facil: string;
  dev: string;
  answer: string; // nombre del frame o id de opción
  options?: { id: string; label: string }[];
  explain: string;
}

const QUESTIONS: Q[] = [
  {
    facil: "¿En qué parte de la petición se va la mayor parte del tiempo? Haz clic en la barra más ancha justo debajo de “handleCheckout”.",
    dev: "¿Qué hijo directo de handleCheckout tiene el mayor tiempo total (inclusive)?",
    answer: "calculateTotals",
    explain: "calculateTotals ocupa ~56% del ancho: ahí está el problema, aunque ella misma casi no trabaja.",
  },
  {
    facil: "Las barras de más abajo son las que realmente hacen el trabajo. ¿Cuál es la más ancha de todas las que no tienen nada debajo?",
    dev: "¿Qué función tiene el mayor self time (tiempo propio, sin contar hijos)?",
    answer: "JSON.parse",
    explain: "JSON.parse tiene 400 ms de tiempo propio: es el “hot spot”. Pero el hot spot no siempre es lo que hay que cambiar…",
  },
  {
    facil: "JSON.parse se ejecuta una vez por cada producto del carrito, siempre con el mismo archivo. ¿Qué función deberíamos cambiar para leer las reglas una sola vez?",
    dev: "¿Cuál es el mejor punto de arreglo? (JSON.parse es de la plataforma; ¿quién lo llama de más?)",
    answer: "getDiscountRules",
    explain: "getDiscountRules relee y re-parsea el mismo archivo por cada producto. Cachear las reglas (o cargarlas al arrancar) elimina ~470 ms.",
  },
  {
    facil: "Si getDiscountRules pasara a tardar casi cero, ¿cuánto tardaría la petición completa?",
    dev: "Si getDiscountRules (inclusive) baja a ~0 ms, ¿cuál es la nueva latencia de /checkout?",
    answer: "530",
    options: [
      { id: "50", label: "≈ 50 ms" },
      { id: "530", label: "≈ 530 ms" },
      { id: "600", label: "≈ 600 ms" },
      { id: "900", label: "≈ 900 ms" },
    ],
    explain: "1 000 − 470 = 530 ms. Ahora el siguiente cuello de botella es db.query (150 ms) y luego template.render (120 ms). Así funciona el profiling: medir, arreglar lo más grande, volver a medir.",
  },
];

const POINTS = [250, 125, 50, 0];

function color(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${10 + (h % 45)}, 85%, ${55 + (h % 10)}%)`;
}

export default function Detective({ mode, submit, code }: ChallengeProps) {
  const dev = mode === "dev";
  const frames = useMemo(() => layout(PROFILE), []);
  const T = total(PROFILE);
  const maxDepth = Math.max(...frames.map((f) => f.depth));
  const [qi, setQi] = useState(0);
  const [tries, setTries] = useState(0);
  const [earned, setEarned] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [hover, setHover] = useState<Laid | null>(null);
  const [locked, setLockedState] = useState<number | null>(null);

  useEffect(() => {
    const l = isLocked(code, "detective");
    if (l) setLockedState(Number(l));
  }, [code]);

  const done = qi >= QUESTIONS.length;
  const q = QUESTIONS[qi];

  function answer(a: string) {
    if (done || feedback?.ok || tries >= 3) return;
    if (a === q.answer) {
      const pts = POINTS[Math.min(tries, POINTS.length - 1)];
      setEarned((e) => [...e, pts]);
      setFeedback({ ok: true, text: `✅ ¡Correcto! +${pts}. ${q.explain}` });
    } else {
      setTries((t) => t + 1);
      setFeedback({ ok: false, text: tries + 1 >= 3 ? `❌ No. La respuesta era ${q.answer}. ${q.explain}` : "❌ No es esa. Mira de nuevo el ancho de las barras." });
      if (tries + 1 >= 3) setEarned((e) => [...e, 0]);
    }
  }
  function next() {
    const nextQ = qi + 1;
    setQi(nextQ);
    setTries(0);
    setFeedback(null);
    if (nextQ >= QUESTIONS.length) {
      const score = earned.reduce((a, b) => a + b, 0);
      setLocked(code, "detective", String(score));
      submit("detective", score);
    }
  }
  const answeredThis = feedback && (feedback.ok || tries >= 3);
  const score = earned.reduce((a, b) => a + b, 0);

  if (locked !== null && !done)
    return (
      <div className="card">
        <h3>Ya resolvieron este caso en esta sala: {locked} / 1000 🕵️</h3>
        <p>En la sala solo cuenta el primer intento. Puedes repetirlo en modo práctica desde la página de inicio.</p>
      </div>
    );

  return (
    <div className="challenge">
      <div className="intro">
        <p>
          {dev
            ? "Este es un flame graph (icicle, de arriba hacia abajo) de GET /checkout, que tarda 1 000 ms. El ancho es tiempo; cada barra llama a las de abajo. El eje X NO es el tiempo cronológico: los hermanos se agrupan."
            : "Esto es un “mapa del tiempo” de lo que hace la tienda online cuando alguien paga (tarda 1 segundo). Mientras más ancha la barra, más tiempo toma. Cada barra está hecha de las barras que tiene debajo."}
        </p>
      </div>
      <div className="card flameCard">
        <div className="flame" style={{ height: (maxDepth + 1) * 30 }}>
          {frames.map((l, i) => (
            <button
              key={i}
              className={`frame ${hover?.f === l.f ? "hover" : ""}`}
              style={{ left: `${(l.x / T) * 100}%`, width: `${(l.w / T) * 100}%`, top: l.depth * 30, background: color(l.f.name) }}
              onMouseEnter={() => setHover(l)}
              onFocus={() => setHover(l)}
              onClick={() => !q?.options && answer(l.f.name)}
              title={`${l.f.name}: ${l.total} ms`}
            >
              <span>{l.w / T > 0.04 ? l.f.name : ""}</span>
            </button>
          ))}
        </div>
        <div className="flameInfo">
          {hover ? (
            <>
              <strong className="mono">{hover.f.name}</strong> · total {hover.total} ms ({((hover.total / T) * 100).toFixed(0)}%)
              {dev && <> · self {hover.f.self} ms</>}
              {hover.f.desc && <span className="muted"> · {hover.f.desc}</span>}
            </>
          ) : (
            <span className="muted">Pasa el mouse sobre una barra para ver su tiempo.</span>
          )}
        </div>
      </div>

      <div className="card">
        {!done ? (
          <>
            <h3>
              Pregunta {qi + 1} de {QUESTIONS.length}
            </h3>
            <p>{dev ? q.dev : q.facil}</p>
            {q.options ? (
              <div className="row wrap">
                {q.options.map((o) => (
                  <button key={o.id} className="secondary" onClick={() => answer(o.id)} disabled={!!answeredThis}>
                    {o.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted small">👆 Responde haciendo clic en una barra del gráfico.</p>
            )}
            {feedback && <p className={feedback.ok ? "okText" : "errText"}>{feedback.text}</p>}
            {answeredThis && (
              <button className="primary" onClick={next}>
                {qi + 1 < QUESTIONS.length ? "Siguiente →" : "Terminar"}
              </button>
            )}
          </>
        ) : (
          <>
            <h3>
              Caso cerrado: <span className="bigNum">{score}</span> / 1000 🕵️
            </h3>
            <p>
              Lección: el <strong>hot spot</strong> (mayor self time) te dice <em>dónde</em> se gasta el tiempo; el <strong>stack</strong> te dice{" "}
              <em>por qué</em>. Muchas veces el arreglo está uno o dos niveles más arriba: no en hacer JSON.parse más rápido, sino en no llamarlo 50 veces.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
