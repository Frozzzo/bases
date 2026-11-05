"use client";

import { useEffect, useState } from "react";

interface Estado {
  backend: "redis" | "memoria";
  kind: string;
  ok: boolean;
  error?: string;
  vercel: boolean;
}

/** Avisa si el almacenamiento no sirve para compartir salas (memoria en Vercel) o si Redis falla. */
export function BackendBanner({ showOk }: { showOk?: boolean }) {
  const [e, setE] = useState<Estado | null>(null);
  useEffect(() => {
    fetch("/api/estado", { cache: "no-store" })
      .then((r) => r.json())
      .then(setE)
      .catch(() => {});
  }, []);
  if (!e) return null;
  if (e.backend === "redis" && !e.ok)
    return (
      <div className="banner error">
        Redis está configurado pero no responde ({e.error || "sin detalle"}). Revisa las variables de entorno en Vercel y vuelve a desplegar.
      </div>
    );
  if (e.backend === "memoria" && e.vercel)
    return (
      <div className="banner error">
        <strong>Falta conectar Redis.</strong> Este despliegue guarda las salas en la memoria del servidor, y en Vercel cada petición puede caer
        en una instancia distinta: los equipos verán “sala no encontrada”, rankings incompletos o puntajes que no llegan. Conecta Upstash Redis
        (Storage → Upstash for Redis) y vuelve a desplegar. Ver README.
      </div>
    );
  return showOk ? (
    <p className="muted small center">
      Almacenamiento: {e.backend === "redis" ? `Redis (${e.kind === "redis-rest" ? "Upstash REST" : "REDIS_URL"}) ✅` : "memoria del servidor (un solo servidor)"}
    </p>
  ) : null;
}
