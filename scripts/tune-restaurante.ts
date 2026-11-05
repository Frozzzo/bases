// Ejecuta: npx tsx scripts/tune-restaurante.ts  (o node --experimental-strip-types)
import { Restaurant, scoreOf, percentile, type Params, type Policy, type Order } from "../lib/sim/restaurante.ts";

function run(p: Params) {
  const r = new Restaurant(p).runToEnd();
  return { raw: scoreOf(r.stats, p.cooks), s: r.stats };
}
const results: { mode: string; p: Params; raw: number }[] = [];
for (const mode of ["facil", "dev"]) {
  for (let cooks = 1; cooks <= 8; cooks++)
    for (let queueLimit = 1; queueLimit <= 40; queueLimit++)
      for (const policy of ["aceptar", "rechazar", "descartar-viejo"] as Policy[])
        for (const order of (mode === "dev" ? ["fifo", "lifo"] : ["fifo"]) as Order[])
          for (const deadlineCheck of mode === "dev" ? [false, true] : [false]) {
            if (policy === "aceptar" && queueLimit > 1) continue;
            const p = { cooks, queueLimit, policy, order, deadlineCheck };
            results.push({ mode, p, raw: run(p).raw });
          }
}
for (const mode of ["facil", "dev"]) {
  const rs = results.filter((r) => r.mode === mode).sort((a, b) => b.raw - a.raw);
  console.log(mode, "top:");
  for (const r of rs.slice(0, 6)) console.log(" ", r.raw, JSON.stringify(r.p));
}
for (const p of [
  { cooks: 3, queueLimit: 10, policy: "aceptar", order: "fifo", deadlineCheck: false },
  { cooks: 8, queueLimit: 10, policy: "aceptar", order: "fifo", deadlineCheck: false },
  { cooks: 5, queueLimit: 10, policy: "aceptar", order: "fifo", deadlineCheck: false },
  { cooks: 5, queueLimit: 10, policy: "rechazar", order: "fifo", deadlineCheck: false },
  { cooks: 5, queueLimit: 10, policy: "aceptar", order: "fifo", deadlineCheck: true },
  { cooks: 5, queueLimit: 10, policy: "aceptar", order: "lifo", deadlineCheck: true },
] as Params[]) {
  const { raw, s } = run(p);
  console.log(raw, JSON.stringify(p), { ...s, waits: undefined, p95: percentile(s.waits, 95).toFixed(1) });
}
const lifo = results.filter((r) => r.mode === "dev" && r.p.order === "lifo").sort((a, b) => b.raw - a.raw);
console.log("mejor LIFO", lifo[0].raw, JSON.stringify(lifo[0].p));
const rej = results.filter((r) => r.p.policy === "rechazar").sort((a, b) => b.raw - a.raw);
console.log("mejor rechazar", rej[0].raw, JSON.stringify(rej[0].p));
