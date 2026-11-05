// Verifica que los parches del modo fácil den el resultado esperado y mide tiempos en Node.
import { EXERCISES } from "../lib/optimiza.ts";
for (const ex of EXERCISES) {
  const env = new Function(ex.setup + "; return { makeData, normalize, makeDb: typeof makeDb === 'function' ? makeDb : null };")();
  const run = async (code: string) => {
    const solve = new Function(code + "; return solve;")();
    const data = env.makeData(1);
    const db = env.makeDb?.();
    const t0 = performance.now();
    const out = await solve(data, db);
    return { ms: performance.now() - t0, out: JSON.stringify(env.normalize(out)), q: db?.queries };
  };
  const base = await run(ex.slow);
  console.log(ex.id, "original", base.ms.toFixed(1), "ms", base.q ?? "");
  for (const p of ex.patches) {
    const r = await run(p.code);
    console.log("   ", r.out === base.out ? "OK " : "MAL", r.ms.toFixed(1).padStart(8), "ms ×" + (base.ms / r.ms).toFixed(1), r.q ?? "", p.label);
  }
}
