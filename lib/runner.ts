"use client";

// Ejecuta código del jugador en un Web Worker desechable, con timeout.
// Cada medición usa 3 semillas distintas (evita "trampas" con caché global) y reporta la mediana.

const WORKER_SRC = `
self.onmessage = async (e) => {
  const { setup, code, seeds } = e.data;
  try {
    const env = new Function(setup + "\\n;return { makeData, normalize, makeDb: typeof makeDb === 'function' ? makeDb : null };")();
    const solve = new Function(code + "\\n;if (typeof solve !== 'function') throw new Error('Debes definir una función llamada solve'); return solve;")();
    const times = [], outputs = [];
    let queries = null;
    for (const seed of seeds) {
      const data = env.makeData(seed);
      const db = env.makeDb ? env.makeDb() : undefined;
      const t0 = performance.now();
      const out = await solve(data, db);
      times.push(performance.now() - t0);
      outputs.push(JSON.stringify(env.normalize(out)));
      if (db) queries = db.queries;
    }
    self.postMessage({ ok: true, times, outputs, queries });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message || err) });
  }
};`;

export interface RunResult {
  ok: boolean;
  error?: string;
  times?: number[];
  median?: number;
  outputs?: string[];
  queries?: number | null;
}

let workerUrl: string | null = null;

export function runInWorker(setup: string, code: string, timeoutMs = 20000, seeds = [11, 22, 33]): Promise<RunResult> {
  if (!workerUrl) workerUrl = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
  return new Promise((resolve) => {
    const w = new Worker(workerUrl!);
    const timer = setTimeout(() => {
      w.terminate();
      resolve({ ok: false, error: `Se pasó del límite de ${timeoutMs / 1000} s (¿un loop infinito?)` });
    }, timeoutMs);
    w.onmessage = (e) => {
      clearTimeout(timer);
      w.terminate();
      const r = e.data as RunResult;
      if (r.ok && r.times) r.median = [...r.times].sort((a, b) => a - b)[Math.floor(r.times.length / 2)];
      resolve(r);
    };
    w.onerror = (e) => {
      clearTimeout(timer);
      w.terminate();
      resolve({ ok: false, error: e.message || "Error de sintaxis" });
    };
    w.postMessage({ setup, code, seeds });
  });
}

export function speedupScore(baseMs: number, ms: number, target: number) {
  const s = baseMs / Math.max(ms, 0.05);
  if (s <= 1) return { speedup: s, score: 0 };
  return { speedup: s, score: Math.max(0, Math.min(1000, Math.round((1000 * Math.log(s)) / Math.log(target)))) };
}
