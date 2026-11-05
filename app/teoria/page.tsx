"use client";

import { Deck, type Slide } from "@/components/Deck";

const LAT = [
  ["Caché L1", 1, "1 s"],
  ["Caché L2", 4, "4 s"],
  ["RAM", 100, "1 min 40 s"],
  ["Comprimir 1 KB", 2_000, "33 min"],
  ["Leer 4 KB de SSD", 20_000, "5,6 horas"],
  ["Ida y vuelta en el datacenter", 500_000, "5,8 días"],
  ["Seek de disco duro", 5_000_000, "1,9 meses"],
  ["Ida y vuelta a otro continente", 150_000_000, "4,8 años"],
] as const;

function fmt(ns: number) {
  if (ns < 1e3) return `${ns} ns`;
  if (ns < 1e6) return `${ns / 1e3} µs`;
  return `${ns / 1e6} ms`;
}

function HockeyStick() {
  const W = 520,
    H = 260;
  const pts: string[] = [];
  for (let u = 0; u <= 0.97; u += 0.01) {
    const w = 1 / (1 - u); // tiempo de respuesta relativo (M/M/1)
    pts.push(`${40 + u * (W - 60)},${H - 30 - Math.min(w, 30) * ((H - 50) / 30)}`);
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="figure">
      <line x1={40} y1={H - 30} x2={W - 10} y2={H - 30} className="axis" />
      <line x1={40} y1={10} x2={40} y2={H - 30} className="axis" />
      <polyline points={pts.join(" ")} className="curve" />
      {[0, 0.5, 0.8, 0.9].map((u) => (
        <g key={u}>
          <line x1={40 + u * (W - 60)} x2={40 + u * (W - 60)} y1={H - 30} y2={H - 24} className="axis" />
          <text x={40 + u * (W - 60)} y={H - 10} textAnchor="middle">
            {u * 100}%
          </text>
        </g>
      ))}
      <text x={W / 2} y={H} textAnchor="middle" className="axisLabel">
        utilización
      </text>
      <text x={14} y={H / 2} transform={`rotate(-90 14 ${H / 2})`} textAnchor="middle" className="axisLabel">
        tiempo de espera
      </text>
    </svg>
  );
}

function MiniFlame() {
  const rows = [
    [["main", 0, 100]],
    [
      ["cargarDatos", 0, 30],
      ["calcular", 30, 60],
      ["render", 90, 10],
    ],
    [
      ["db.query", 0, 28],
      ["ordenar", 30, 15],
      ["comparar", 45, 45],
    ],
  ] as const;
  return (
    <svg viewBox="0 0 520 110" className="figure">
      {rows.map((r, d) =>
        r.map(([n, x, w]) => (
          <g key={n}>
            <rect x={10 + x * 5} y={5 + d * 34} width={w * 5 - 2} height={30} rx={3} className={`fl fl${d}`} />
            <text x={14 + x * 5} y={25 + d * 34} className="flText">
              {w >= 15 ? n : ""}
            </text>
          </g>
        ))
      )}
    </svg>
  );
}

const SLIDES: Slide[] = [
  {
    className: "cover",
    body: (
      <>
        <div className="coverEmoji">🕵️‍♀️⏱️🔥</div>
        <h1>Cazadores de cuellos de botella</h1>
        <p className="lead">Por qué el software es lento, y cómo encontrar al culpable midiendo (no adivinando).</p>
      </>
    ),
    notes: "Bienvenida. 15 minutos de teoría y después juego por equipos. Pide que formen equipos mezclando devs y no devs.",
  },
  {
    title: "“La app está lenta”",
    body: (
      <>
        <p>Antes de tocar código, tres preguntas:</p>
        <ol className="bigList">
          <li>
            <strong>¿Lenta dónde?</strong> ¿Qué pantalla, qué endpoint, qué paso?
          </li>
          <li>
            <strong>¿Para quién?</strong> ¿Todos los usuarios o el 1% más desafortunado?
          </li>
          <li>
            <strong>¿Comparado con qué?</strong> ¿Ayer? ¿La meta? ¿La competencia?
          </li>
        </ol>
        <p className="callout">Optimizar sin medir es adivinar. Y solemos adivinar mal.</p>
      </>
    ),
    notes: "Pregunta al público: ¿alguna vez optimizaron algo que al final no era el problema? Casi siempre alguien tiene una historia.",
  },
  {
    title: "La computadora por dentro",
    body: (
      <>
        <div className="hierarchy">
          <div className="lvl l0">CPU · registros</div>
          <div className="lvl l1">Caché L1 · L2 · L3 (dentro del chip)</div>
          <div className="lvl l2">Memoria RAM</div>
          <div className="lvl l3">Disco (SSD / HDD)</div>
          <div className="lvl l4">Red: otro servidor, otra región, otro continente</div>
        </div>
        <p>
          Cada nivel es <strong>más grande, más barato y mucho más lento</strong> que el anterior. La CPU pasa gran parte de su vida{" "}
          <em>esperando datos</em>.
        </p>
      </>
    ),
    notes: "Analogía: la CPU es un chef. L1 es lo que tiene en la mano, RAM es el refrigerador, el disco es el supermercado, la red es pedir ingredientes a otro país.",
  },
  {
    title: "Órdenes de magnitud",
    body: (
      <table className="latTable">
        <tbody>
          {LAT.map(([n, ns]) => (
            <tr key={n}>
              <td>{n}</td>
              <td className="mono num">{fmt(ns)}</td>
              <td className="barCell">
                <div className="logbar">
                  <div style={{ width: `${(Math.log10(ns) / Math.log10(1.5e8)) * 100 + 2}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
    notes:
      "Escala logarítmica: cada salto es ×10. No hace falta memorizar los números, sí los órdenes de magnitud. Valores aproximados, basados en la famosa lista 'Latency numbers every programmer should know'.",
  },
  {
    title: "A escala humana: si 1 ns fuera 1 segundo…",
    body: (
      <table className="latTable human">
        <tbody>
          {LAT.map(([n, , h]) => (
            <tr key={n}>
              <td>{n}</td>
              <td className="num strong">{h}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
    notes: "Este es el slide que la gente recuerda. Leer de RAM es ir por un vaso de agua; una llamada a otro continente es estudiar una carrera.",
  },
  {
    title: "Consecuencia: el viaje cuesta más que el trabajo",
    body: (
      <>
        <div className="twoCol">
          <div className="card">
            <h3>❌ N+1</h3>
            <pre className="code">{`for (const p of pedidos) {
  p.cliente = await db.getCliente(p.clienteId);
}
// 300 pedidos = 300 viajes`}</pre>
          </div>
          <div className="card">
            <h3>✅ En lote</h3>
            <pre className="code">{`const clientes = await db.getClientes(ids);
// 1 viaje`}</pre>
          </div>
        </div>
        <p className="callout">
          En casi todos los sistemas reales el cuello de botella es <strong>I/O</strong>: base de datos, red, disco. No la CPU.
        </p>
      </>
    ),
    notes: "Para no devs: ir al supermercado 300 veces por un ingrediente cada vez vs. ir una vez con la lista.",
  },
  {
    title: "Complejidad: cuando 10× datos no es 10× tiempo",
    body: (
      <>
        <table className="latTable">
          <thead>
            <tr>
              <th>Elementos</th>
              <th className="num">O(n)</th>
              <th className="num">O(n log n)</th>
              <th className="num">O(n²)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1 000</td>
              <td className="num">1 ms</td>
              <td className="num">10 ms</td>
              <td className="num">1 s</td>
            </tr>
            <tr>
              <td>10 000</td>
              <td className="num">10 ms</td>
              <td className="num">130 ms</td>
              <td className="num strong">100 s</td>
            </tr>
            <tr>
              <td>100 000</td>
              <td className="num">100 ms</td>
              <td className="num">1,7 s</td>
              <td className="num strong">2,8 horas</td>
            </tr>
          </tbody>
        </table>
        <p>Los “loops dentro de loops” y las copias escondidas (spread, concat) se ven inocentes en desarrollo y explotan en producción.</p>
      </>
    ),
    notes: "Los números son ilustrativos (1 µs por operación). Lo importante es la forma de la curva.",
  },
  {
    title: "¿Qué es el profiling?",
    body: (
      <>
        <p className="lead">
          <strong>Medir dónde se va el tiempo (o la memoria)</strong> de un programa mientras hace su trabajo real.
        </p>
        <div className="twoCol">
          <div>
            <h3>Cómo se mide</h3>
            <ul>
              <li>
                <strong>Muestreo (sampling):</strong> cada ~1 ms se toma una “foto” de qué función se ejecuta. Barato, estadístico.
              </li>
              <li>
                <strong>Instrumentación / tracing:</strong> se anota inicio y fin de cada operación. Preciso, más costoso.
              </li>
            </ul>
          </div>
          <div>
            <h3>Herramientas</h3>
            <ul>
              <li>Navegador: DevTools → Performance / Memory</li>
              <li>Node: --cpu-prof, clinic.js · Python: py-spy · Go: pprof · JVM: async-profiler</li>
              <li>Producción: APM y tracing distribuido (OpenTelemetry)</li>
            </ul>
          </div>
        </div>
      </>
    ),
    notes: "Para no devs: es como poner un cronómetro a cada paso de una receta para saber cuál demora más.",
  },
  {
    title: "Cómo leer un flame graph",
    body: (
      <>
        <MiniFlame />
        <ul>
          <li>
            <strong>Ancho = tiempo.</strong> Mientras más ancha la barra, más tiempo pasó ahí (ella y lo que llama).
          </li>
          <li>
            <strong>Vertical = quién llama a quién.</strong> Cada barra está hecha de sus hijas.
          </li>
          <li>
            <strong>Self time</strong> = tiempo propio (lo que no explican sus hijas). El eje X no es cronológico.
          </li>
        </ul>
        <p className="callout">Busca barras anchas. Luego pregunta: ¿por qué se llama tanto?</p>
      </>
    ),
    notes: "En este ejemplo calcular ocupa 60%, y dentro de ella 'comparar' es el hot spot.",
  },
  {
    title: "Latencia, throughput y percentiles",
    body: (
      <>
        <div className="twoCol">
          <div>
            <p>
              <strong>Latencia:</strong> cuánto tarda <em>una</em> petición.
            </p>
            <p>
              <strong>Throughput:</strong> cuántas peticiones por segundo atendemos.
            </p>
          </div>
          <div>
            <p>
              <strong>p50</strong>: la mitad tarda menos que esto.
              <br />
              <strong>p95 / p99</strong>: la experiencia de los usuarios más desafortunados.
            </p>
          </div>
        </div>
        <p className="callout">
          El promedio miente. Si 99 peticiones tardan 10 ms y una tarda 10 s, el promedio es 110 ms… y ese usuario se fue.
        </p>
      </>
    ),
    notes: "Si una página hace 100 llamadas a un servicio, casi todas las cargas sufren el p99 de ese servicio.",
  },
  {
    title: "Colas: por qué todo explota cerca del 100%",
    body: (
      <>
        <div className="twoCol">
          <HockeyStick />
          <div>
            <p>
              <strong>Ley de Little:</strong> L = λ · W
              <br />
              <span className="muted">en la fila = llegadas por segundo × tiempo de espera</span>
            </p>
            <p>
              Si llega más trabajo del que puedes procesar, la cola crece <strong>sin límite</strong>. Una cola infinita no resuelve la sobrecarga:
              la convierte en latencia.
            </p>
          </div>
        </div>
      </>
    ),
    notes: "Ejemplo de autopista: al 50% fluye, al 90% cualquier frenazo produce un taco enorme. Un servidor al 95% de CPU es una autopista en hora punta.",
  },
  {
    title: "Back pressure (contrapresión)",
    body: (
      <>
        <p className="lead">Cuando no das abasto, avisa pronto, en lugar de aceptar todo y fallar tarde.</p>
        <ul className="bigList">
          <li>🚪 Limitar la cola y rechazar rápido (HTTP 429 / 503)</li>
          <li>⏱️ Timeouts y deadlines: no procesar lo que el cliente ya abandonó</li>
          <li>🔁 Reintentos con backoff exponencial + jitter (no en tormenta)</li>
          <li>🪫 Degradar: servir algo más simple antes que nada</li>
        </ul>
        <p className="callout">Restaurante: es mejor decir “hay 40 min de espera” en la puerta que dejar entrar a todos y que nadie coma.</p>
      </>
    ),
    notes: "Este es el reto 1. No des la respuesta óptima; deja que lo descubran.",
  },
  {
    title: "Memoria: fugas y recolector de basura",
    body: (
      <>
        <svg viewBox="0 0 520 140" className="figure">
          <polyline className="curve ok" points={Array.from({ length: 53 }, (_, i) => `${10 + i * 10},${120 - ((i % 8) / 8) * 50}`).join(" ")} />
          <polyline className="curve" points={Array.from({ length: 53 }, (_, i) => `${10 + i * 10},${120 - ((i % 8) / 8) * 40 - i * 1.6}`).join(" ")} />
        </svg>
        <ul>
          <li>
            <span className="okText">Sierra estable</span>: el GC limpia y vuelve al mismo piso. Sano.
          </li>
          <li>
            <span className="errText">Piso que sube</span>: algo se retiene para siempre → fuga → OOM.
          </li>
          <li>Culpables típicos: cachés sin límite, listeners y timers sin limpiar, globales y singletons.</li>
        </ul>
      </>
    ),
    notes: "Con un recolector de basura igual hay fugas: el GC solo libera lo que nadie referencia.",
  },
  {
    title: "El método",
    body: (
      <>
        <ol className="bigList steps">
          <li>📏 Mide (con datos y carga realistas)</li>
          <li>🔎 Encuentra el cuello de botella más grande</li>
          <li>🛠️ Arregla solo ese</li>
          <li>🔁 Vuelve a medir y repite</li>
        </ol>
        <p className="callout">
          Ley de Amdahl: si algo es el 5% del tiempo total, hacerlo infinitamente rápido solo ahorra 5%.
        </p>
      </>
    ),
    notes: "Y verifica que el resultado sigue siendo correcto: rápido e incorrecto no sirve (el juego lo castiga).",
  },
  {
    className: "cover",
    body: (
      <>
        <div className="coverEmoji">🎮</div>
        <h1>¡A cazar cuellos de botella!</h1>
        <div className="gameList">
          <div>🍔 Restaurante caótico</div>
          <div>⚡ Carrera de latencias</div>
          <div>⏱️ Optimiza y mide</div>
          <div>🔥 Detective del flame graph</div>
          <div>🧠 Caza de la fuga de memoria</div>
        </div>
        <p className="lead">Entra a la app, escribe el código de sala y elige modo 🌱 Fácil o 🧑‍💻 Dev.</p>
      </>
    ),
    notes: "Proyecta el panel del facilitador con el código de sala y el ranking.",
  },
];

export default function Page() {
  return <Deck slides={SLIDES} />;
}
