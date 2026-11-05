"use client";

import { ChallengeShell } from "./Shell";
import Restaurante from "./challenges/Restaurante";
import Latencias from "./challenges/Latencias";
import Optimiza from "./challenges/Optimiza";
import Detective from "./challenges/Detective";
import Fuga from "./challenges/Fuga";
import type { ChallengeProps } from "./Shell";
import type { ComponentType } from "react";

const REGISTRY: Record<string, ComponentType<ChallengeProps>> = {
  restaurante: Restaurante,
  latencias: Latencias,
  optimiza: Optimiza,
  detective: Detective,
  fuga: Fuga,
};

export function ChallengePage({ code, reto }: { code: string | null; reto: string }) {
  const C = REGISTRY[reto];
  if (!C) return <div className="page"><p>Reto no encontrado.</p></div>;
  return <ChallengeShell code={code} challengeId={reto}>{(p) => <C key={p.mode} {...p} />}</ChallengeShell>;
}
