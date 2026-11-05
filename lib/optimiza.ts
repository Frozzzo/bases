// Ejercicios de "Optimiza y mide". Todo el código se ejecuta en el navegador, dentro de un Web Worker.
// `setup` define makeData(seed), normalize(out) y opcionalmente makeDb().
// El código del jugador debe definir `solve(data, db)` (puede ser async).

export interface Patch {
  label: string;
  explain: string;
  code: string;
}

export interface Exercise {
  id: string;
  title: string;
  emoji: string;
  facil: string;
  dev: string;
  target: number; // aceleración (×) que vale 1000 puntos
  setup: string;
  slow: string;
  hints: string[];
  patches: Patch[]; // para el modo fácil
  lesson: string;
}

const RNG = `
function rng(seed) {
  let t = seed * 2654435761 >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}`;

export const EXERCISES: Exercise[] = [
  {
    id: "duplicados",
    title: "Correos duplicados",
    emoji: "📧",
    facil:
      "Tenemos 8 000 personas inscritas y queremos saber qué correos aparecen repetidos. El programa actual compara a cada persona con todas las demás, una por una. ¿Se te ocurre una forma más inteligente?",
    dev: "Encuentra los emails repetidos en una lista de 8 000 usuarios. La versión actual es O(n²). Devuelve un array con cada email repetido una sola vez (el orden no importa).",
    target: 120,
    setup: `${RNG}
function makeData(seed) {
  const r = rng(seed);
  const users = [];
  for (let i = 0; i < 8000; i++) {
    const n = Math.floor(r() * 7000);
    users.push({ id: i, email: "user" + n + "@empresa.com" });
  }
  return users;
}
function normalize(out) { return [...out].sort(); }`,
    slow: `function solve(users) {
  const repetidos = [];
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      if (users[i].email === users[j].email && !repetidos.includes(users[i].email)) {
        repetidos.push(users[i].email);
      }
    }
  }
  return repetidos;
}`,
    hints: [
      "¿Cuántas comparaciones hace el doble for con 8 000 elementos? (≈ 32 millones)",
      "Recorre la lista una sola vez y recuerda lo que ya viste.",
      "Un Set o un Map da búsquedas en O(1). `repetidos.includes` también es O(n).",
    ],
    patches: [
      {
        label: "Comparar solo con las siguientes 100 personas",
        explain: "Mucho menos trabajo… pero ¿seguro que encuentra todos los repetidos?",
        code: `function solve(users) {
  const repetidos = [];
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < Math.min(users.length, i + 100); j++) {
      if (users[i].email === users[j].email && !repetidos.includes(users[i].email)) repetidos.push(users[i].email);
    }
  }
  return repetidos;
}`,
      },
      {
        label: "Ordenar la lista primero y comparar vecinos",
        explain: "Si están ordenados, los repetidos quedan juntos. Ordenar cuesta algo, pero solo se hace una vez.",
        code: `function solve(users) {
  const emails = users.map(u => u.email).sort();
  const repetidos = [];
  for (let i = 1; i < emails.length; i++) {
    if (emails[i] === emails[i - 1] && repetidos[repetidos.length - 1] !== emails[i]) repetidos.push(emails[i]);
  }
  return repetidos;
}`,
      },
      {
        label: "Usar una libreta de “ya vistos”",
        explain: "Recorremos la lista una sola vez. Si el correo ya está en la libreta, es repetido. Buscar en la libreta es instantáneo.",
        code: `function solve(users) {
  const vistos = new Set();
  const repetidos = new Set();
  for (const u of users) {
    if (vistos.has(u.email)) repetidos.add(u.email);
    else vistos.add(u.email);
  }
  return [...repetidos];
}`,
      },
    ],
    lesson:
      "Un algoritmo O(n²) se ve inocente con 100 elementos y se vuelve impagable con 10 000. Antes de micro-optimizar, revisa la complejidad: cambiar la estructura de datos suele ganar ×100.",
  },
  {
    id: "n-mas-1",
    title: "El problema N+1",
    emoji: "🗄️",
    facil:
      "Para mostrar 300 pedidos con el nombre de su cliente, el programa va a la bodega (base de datos) a buscar a cada cliente, uno por uno, aunque muchos se repiten. Cada viaje toma tiempo. ¿Cómo hacemos menos viajes?",
    dev: "Enriquece 300 pedidos con el nombre del usuario. `db.getUser(id)` tarda ~2 ms por consulta y el pool solo admite 5 consultas simultáneas. También existe `db.getUsersByIds(ids)` (una sola consulta). Devuelve [{ orderId, total, userName }].",
    target: 120,
    setup: `${RNG}
function makeData(seed) {
  const r = rng(seed);
  const orders = [];
  for (let i = 0; i < 300; i++) orders.push({ id: i, userId: 1 + Math.floor(r() * 60), total: Math.round(r() * 10000) / 100 });
  return orders;
}
function makeDb() {
  const users = new Map();
  for (let i = 1; i <= 60; i++) users.set(i, { id: i, name: "Cliente " + i });
  let active = 0; const waiting = [];
  const acquire = () => new Promise(res => { if (active < 5) { active++; res(); } else waiting.push(res); });
  const release = () => { const n = waiting.shift(); if (n) n(); else active--; };
  const sleep = (ms) => new Promise(res => setTimeout(res, ms));
  const db = {
    queries: 0,
    async getUser(id) { db.queries++; await acquire(); try { await sleep(2); return users.get(id) ? { ...users.get(id) } : null; } finally { release(); } },
    async getUsersByIds(ids) { db.queries++; await acquire(); try { await sleep(3); return ids.map(id => users.get(id)).filter(Boolean).map(u => ({ ...u })); } finally { release(); } },
  };
  return db;
}
function normalize(out) { return [...out].sort((a, b) => a.orderId - b.orderId); }`,
    slow: `async function solve(orders, db) {
  const result = [];
  for (const order of orders) {
    const user = await db.getUser(order.userId); // una consulta por pedido 😱
    result.push({ orderId: order.id, total: order.total, userName: user.name });
  }
  return result;
}`,
    hints: [
      "Mira el contador de consultas: ¿cuántas veces vamos a la base de datos?",
      "Hay solo 60 usuarios distintos entre 300 pedidos.",
      "Una sola consulta con `db.getUsersByIds([...ids])` y luego un Map id → usuario.",
    ],
    patches: [
      {
        label: "Ir por todos los clientes a la vez (en paralelo)",
        explain: "Mandamos a varias personas a la bodega al mismo tiempo. Pero la bodega solo atiende a 5 a la vez…",
        code: `async function solve(orders, db) {
  const users = await Promise.all(orders.map(o => db.getUser(o.userId)));
  return orders.map((o, i) => ({ orderId: o.id, total: o.total, userName: users[i].name }));
}`,
      },
      {
        label: "Recordar los clientes que ya buscamos",
        explain: "Si ya fuimos por el Cliente 7, no volvemos a ir: lo anotamos (caché).",
        code: `async function solve(orders, db) {
  const cache = new Map();
  const result = [];
  for (const order of orders) {
    if (!cache.has(order.userId)) cache.set(order.userId, await db.getUser(order.userId));
    result.push({ orderId: order.id, total: order.total, userName: cache.get(order.userId).name });
  }
  return result;
}`,
      },
      {
        label: "Pedir la lista completa en un solo viaje",
        explain: "Hacemos una lista de todos los clientes que necesitamos y vamos UNA vez a la bodega.",
        code: `async function solve(orders, db) {
  const ids = [...new Set(orders.map(o => o.userId))];
  const users = await db.getUsersByIds(ids);
  const byId = new Map(users.map(u => [u.id, u]));
  return orders.map(o => ({ orderId: o.id, total: o.total, userName: byId.get(o.userId).name }));
}`,
      },
      {
        label: "Mostrar “Cliente” sin buscar el nombre",
        explain: "¡Cero viajes! Aunque… ¿sigue siendo correcto?",
        code: `async function solve(orders) {
  return orders.map(o => ({ orderId: o.id, total: o.total, userName: "Cliente" }));
}`,
      },
    ],
    lesson:
      "En sistemas reales la CPU casi nunca es el cuello de botella: lo es la cantidad de viajes de red. Un ORM que hace una consulta por fila convierte 1 ms en 1 segundo. Agrupa (batch), cachea y mide el número de consultas, no solo el tiempo.",
  },
  {
    id: "copias",
    title: "Copias escondidas",
    emoji: "📋",
    facil:
      "Queremos un reporte de ventas por categoría. El programa, cada vez que anota una venta, fotocopia el cuaderno completo y escribe en la copia. Con 7 000 ventas… son muchas fotocopias.",
    dev: "Agrupa 7 000 ventas por categoría (250 categorías) y genera un reporte CSV `categoria;cantidad;total`. El código usa reduce con spread y concat, que copian en cada iteración. Devuelve el mismo string.",
    target: 200,
    setup: `${RNG}
function makeData(seed) {
  const r = rng(seed);
  const sales = [];
  for (let i = 0; i < 7000; i++) sales.push({ id: i, category: "cat-" + String(Math.floor(r() * 250)).padStart(3, "0"), amount: Math.round(r() * 100000) / 100 });
  return sales;
}
function normalize(out) { return out; }`,
    slow: `function solve(sales) {
  const porCategoria = sales.reduce(
    (acc, s) => ({ ...acc, [s.category]: (acc[s.category] || []).concat([s]) }),
    {}
  );
  let reporte = "";
  for (const cat of Object.keys(porCategoria).sort()) {
    const ventas = porCategoria[cat];
    const total = ventas.reduce((a, s) => a + s.amount, 0);
    reporte = reporte + cat + ";" + ventas.length + ";" + total.toFixed(2) + "\\n";
  }
  return reporte;
}`,
    hints: [
      "`{ ...acc }` copia TODAS las claves del objeto en cada una de las 7 000 iteraciones.",
      "`.concat([s])` crea un array nuevo copiando el anterior.",
      "Muta un objeto/Map local y usa push. Ojo: el total debe sumarse en el mismo orden para que coincidan los decimales.",
    ],
    patches: [
      {
        label: "Escribir directo en el mismo cuaderno",
        explain: "Nada de fotocopias: un solo cuaderno, y vamos agregando cada venta en su página.",
        code: `function solve(sales) {
  const porCategoria = new Map();
  for (const s of sales) {
    let arr = porCategoria.get(s.category);
    if (!arr) porCategoria.set(s.category, (arr = []));
    arr.push(s);
  }
  const lineas = [];
  for (const cat of [...porCategoria.keys()].sort()) {
    const ventas = porCategoria.get(cat);
    const total = ventas.reduce((a, s) => a + s.amount, 0);
    lineas.push(cat + ";" + ventas.length + ";" + total.toFixed(2));
  }
  return lineas.join("\\n") + "\\n";
}`,
      },
      {
        label: "Fotocopiar, pero solo la página de la categoría",
        explain: "Seguimos copiando, pero una página en lugar del cuaderno entero.",
        code: `function solve(sales) {
  const porCategoria = {};
  for (const s of sales) porCategoria[s.category] = (porCategoria[s.category] || []).concat([s]);
  let reporte = "";
  for (const cat of Object.keys(porCategoria).sort()) {
    const ventas = porCategoria[cat];
    const total = ventas.reduce((a, s) => a + s.amount, 0);
    reporte = reporte + cat + ";" + ventas.length + ";" + total.toFixed(2) + "\\n";
  }
  return reporte;
}`,
      },
      {
        label: "Redondear cada venta antes de sumar",
        explain: "Así los números son más “limpios”… ¿pero el reporte queda igual?",
        code: `function solve(sales) {
  const porCategoria = {};
  for (const s of sales) (porCategoria[s.category] ||= []).push(s);
  let reporte = "";
  for (const cat of Object.keys(porCategoria).sort()) {
    const ventas = porCategoria[cat];
    const total = ventas.reduce((a, s) => a + Math.round(s.amount), 0);
    reporte = reporte + cat + ";" + ventas.length + ";" + total.toFixed(2) + "\\n";
  }
  return reporte;
}`,
      },
    ],
    lesson:
      "La inmutabilidad es genial para razonar, pero copiar estructuras dentro de un loop es O(n²) disfrazado. Concatenar strings con += suele estar optimizado en los motores modernos; copiar objetos y arrays enteros no. Mide antes de creer.",
  },
];
