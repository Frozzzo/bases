// Catálogo de retos. La clave de puntaje es "<reto>" o "<reto>:<sub-ejercicio>".
// En el ranking se suman por reto (todo lo que va antes de ":").

export interface ChallengeInfo {
  id: string;
  title: string;
  emoji: string;
  short: string;
  parts: number; // nº de sub-ejercicios; el puntaje del reto es el promedio (máx. 1000)
  extra?: boolean;
}

export const CHALLENGES: ChallengeInfo[] = [
  {
    id: "restaurante",
    title: "Restaurante caótico",
    emoji: "🍔",
    short: "Colas, límites y back pressure en hora pico.",
    parts: 1,
  },
  {
    id: "latencias",
    title: "Carrera de latencias",
    emoji: "⚡",
    short: "Ordena operaciones y estima su orden de magnitud.",
    parts: 1,
  },
  {
    id: "optimiza",
    title: "Optimiza y mide",
    emoji: "⏱️",
    short: "Arregla código lento y demuéstralo con milisegundos.",
    parts: 3,
  },
  {
    id: "detective",
    title: "Detective del flame graph",
    emoji: "🔥",
    short: "Lee un perfil y encuentra al culpable.",
    parts: 1,
    extra: true,
  },
  {
    id: "fuga",
    title: "Caza de la fuga de memoria",
    emoji: "🧠",
    short: "Encuentra qué está acumulando memoria sin soltarla.",
    parts: 1,
    extra: true,
  },
];

export const CHALLENGE_IDS = CHALLENGES.map((c) => c.id);

export function challengeOf(scoreKey: string) {
  return scoreKey.split(":")[0];
}

/** Puntaje por reto (0..1000) y total de un equipo a partir de sus claves. */
export function teamTotals(scores: Record<string, number> | undefined) {
  const per: Record<string, number> = {};
  for (const c of CHALLENGES) per[c.id] = 0;
  for (const [k, v] of Object.entries(scores || {})) {
    const c = CHALLENGES.find((x) => x.id === challengeOf(k));
    if (c) per[c.id] += v / c.parts;
  }
  let total = 0;
  for (const id of Object.keys(per)) {
    per[id] = Math.round(per[id]);
    total += per[id];
  }
  return { per, total };
}
