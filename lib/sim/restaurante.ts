// Simulación determinista de un restaurante (= un servicio con cola y workers).
// Las llegadas y tiempos de cocina están pre-generados con una semilla fija,
// así todos los equipos enfrentan exactamente la misma hora pico.

export type Policy = "aceptar" | "rechazar" | "descartar-viejo";
export type Order = "fifo" | "lifo";

export interface Params {
  cooks: number; // workers
  queueLimit: number; // tamaño máximo de la cola
  policy: Policy; // qué hacer cuando la cola está llena
  order: Order; // en qué orden se atienden los pedidos
  deadlineCheck: boolean; // ¿la cocina descarta pedidos cuyo cliente ya se fue?
}

export const DEFAULT_PARAMS: Params = { cooks: 3, queueLimit: 10, policy: "aceptar", order: "fifo", deadlineCheck: false };

export const SIM = {
  duration: 180, // segundos simulados
  dt: 0.1,
  patience: 15, // un cliente espera como máximo 15 s (desde que llega) o se va
  rushStart: 50,
  rushEnd: 110,
  baseRate: 0.8, // clientes por segundo
  rushRate: 2.6,
  cookCost: 250,
  points: { happy: 10, abandoned: -6, rejected: -2, dropped: -4, wasted: -2 },
};

export interface Customer {
  id: number;
  arrival: number;
  cookTime: number;
  // estado dinámico
  status: "pending" | "queued" | "cooking" | "served" | "rejected" | "dropped";
  left: boolean; // el cliente se fue por impaciencia
  startedAt?: number;
  doneAt?: number;
  wasted?: boolean;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rateAt(t: number) {
  return t >= SIM.rushStart && t < SIM.rushEnd ? SIM.rushRate : SIM.baseRate;
}

let cachedArrivals: { arrival: number; cookTime: number }[] | null = null;
function arrivals() {
  if (cachedArrivals) return cachedArrivals;
  const rnd = mulberry32(20261106);
  const out: { arrival: number; cookTime: number }[] = [];
  let t = 0;
  // Proceso de Poisson no homogéneo por "thinning".
  while (true) {
    t += -Math.log(1 - rnd()) / SIM.rushRate;
    if (t >= SIM.duration - 20) break;
    const accept = rnd() < rateAt(t) / SIM.rushRate;
    const cookTime = 1.2 + -Math.log(1 - rnd()) * 1.3; // media ≈ 2.5 s
    if (accept) out.push({ arrival: t, cookTime });
  }
  cachedArrivals = out;
  return out;
}

export interface Stats {
  arrived: number;
  happy: number;
  abandoned: number; // esperaron y se fueron enojados
  rejected: number; // se les dijo "lleno" al llegar
  dropped: number; // los sacamos de la cola para hacer espacio
  wasted: number; // platos cocinados para nadie
  cookBusy: number; // segundos-cocinero ocupados
  waits: number[]; // tiempo total de los clientes atendidos felices
}

export class Restaurant {
  t = 0;
  params: Params;
  customers: Customer[];
  queue: Customer[] = []; // incluye "fantasmas" si no hay deadlineCheck
  cooking: (Customer | null)[];
  next = 0;
  stats: Stats = { arrived: 0, happy: 0, abandoned: 0, rejected: 0, dropped: 0, wasted: 0, cookBusy: 0, waits: [] };
  queueHistory: number[] = [];

  constructor(params: Params) {
    this.params = params;
    this.customers = arrivals().map((a, i) => ({ id: i, ...a, status: "pending", left: false }));
    this.cooking = Array(params.cooks).fill(null);
  }

  get done() {
    return this.t >= SIM.duration;
  }

  step() {
    const { dt, patience } = SIM;
    const p = this.params;
    this.t += dt;
    const t = this.t;

    // 1) Llegadas
    while (this.next < this.customers.length && this.customers[this.next].arrival <= t) {
      const c = this.customers[this.next++];
      this.stats.arrived++;
      const full = p.policy !== "aceptar" && this.queue.length >= p.queueLimit;
      if (full && p.policy === "rechazar") {
        c.status = "rejected";
        this.stats.rejected++;
        continue;
      }
      if (full && p.policy === "descartar-viejo") {
        const old = this.queue.shift()!;
        old.status = "dropped";
        if (!old.left) this.stats.dropped++;
      }
      c.status = "queued";
      this.queue.push(c);
    }

    // 2) Impaciencia: los clientes se van, pero el pedido sigue en la cola (la cocina no se entera)
    for (const c of this.queue) {
      if (!c.left && t - c.arrival > patience) {
        c.left = true;
        this.stats.abandoned++;
      }
    }
    for (const c of this.cooking) {
      if (c && !c.left && t - c.arrival > patience) {
        c.left = true;
        this.stats.abandoned++;
      }
    }

    // 3) Cocina
    for (let i = 0; i < this.cooking.length; i++) {
      const c = this.cooking[i];
      if (c) {
        this.stats.cookBusy += dt;
        if (t - (c.startedAt || 0) >= c.cookTime) {
          c.status = "served";
          c.doneAt = t;
          if (c.left) {
            c.wasted = true;
            this.stats.wasted++;
          } else {
            this.stats.happy++;
            this.stats.waits.push(t - c.arrival);
          }
          this.cooking[i] = null;
        }
      }
      if (!this.cooking[i]) {
        let picked: Customer | undefined;
        while (this.queue.length) {
          picked = p.order === "lifo" ? this.queue.pop() : this.queue.shift();
          if (picked && p.deadlineCheck && picked.left) {
            picked.status = "dropped"; // descartado sin cocinar: no se desperdicia nada
            picked = undefined;
            continue;
          }
          break;
        }
        if (picked) {
          picked.status = "cooking";
          picked.startedAt = t;
          this.cooking[i] = picked;
        }
      }
    }
    if (Math.round(t / dt) % 10 === 0) this.queueHistory.push(this.queue.length);
  }

  runToEnd() {
    while (!this.done) this.step();
    return this;
  }
}

export function scoreOf(stats: Stats, cooks: number) {
  const P = SIM.points;
  return (
    stats.happy * P.happy +
    stats.abandoned * P.abandoned +
    stats.rejected * P.rejected +
    stats.dropped * P.dropped +
    stats.wasted * P.wasted -
    cooks * SIM.cookCost
  );
}

export function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

// Calibración (scripts/tune-restaurante.ts, búsqueda por fuerza bruta):
// mejor configuración = 718 puntos crudos; configuración inicial (3 cocineros, aceptar todo) = -1470.
export const BEST_RAW = 718;
export const FLOOR_RAW = -1470;

/** Convierte el puntaje crudo a 0..1000. Es cúbico para premiar acercarse al óptimo. */
export function normalized(raw: number) {
  const x = Math.max(0, Math.min(1, (raw - FLOOR_RAW) / (BEST_RAW - FLOOR_RAW)));
  return Math.round(1000 * x * x * x);
}
