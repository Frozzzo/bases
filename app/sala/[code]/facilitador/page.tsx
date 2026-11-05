"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Ranking } from "@/components/Ranking";
import { CHALLENGES } from "@/lib/challenges";
import { getHost, updateHost, useRoomState, type HostConfig } from "@/lib/client";

export default function Page({ params }: { params: Promise<{ code: string }> }) {
  const code = use(params).code.toUpperCase();
  const { state, error } = useRoomState(code, 2000);
  const [host, setHost] = useState<HostConfig | null>(null);
  const [ready, setReady] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setHost(getHost(code));
    setOrigin(window.location.origin);
    setReady(true);
  }, [code]);

  function patch(p: Partial<HostConfig>) {
    updateHost(code, p);
    setHost(getHost(code));
  }

  // El facilitador manda: muestra su propia configuración aunque el servidor aún no la tenga.
  const open = host ? host.open : state?.room.open || [];
  const joinUrl = `${origin}/?sala=${code}`;

  return (
    <div className="page wide">
      <header className="topbar">
        <Link href="/" className="back">← Inicio</Link>
        <h1>Panel del facilitador</h1>
        <span />
      </header>
      <div className="joinBox">
        <div>
          <div className="muted">Entra a</div>
          <div className="joinUrl">{origin.replace(/^https?:\/\//, "")}</div>
        </div>
        <div>
          <div className="muted">Código de sala</div>
          <div className="bigCode">{code}</div>
        </div>
        <button className="secondary" onClick={() => navigator.clipboard?.writeText(joinUrl)}>Copiar enlace</button>
      </div>
      {host && (
        <div className="banner info">
          📌 Deja esta pestaña abierta durante la clase: guarda la copia de respaldo del ranking y mantiene la sala viva.
        </div>
      )}
      {error && <div className="banner warn">⏳ {error}</div>}
      {ready && !host && (
        <div className="banner warn">Este navegador no creó la sala, así que solo puedes ver el ranking (no abrir/cerrar retos).</div>
      )}
      {host && (
        <div className="card">
          <h2>Retos abiertos</h2>
          <p className="muted small">Abre los retos a medida que avanza la clase. Los equipos ven los cerrados con candado.</p>
          <div className="toggles">
            {CHALLENGES.map((c) => (
              <label key={c.id} className="check">
                <input
                  type="checkbox"
                  checked={open.includes(c.id)}
                  onChange={(e) =>
                    patch({ open: e.target.checked ? [...open, c.id] : open.filter((o) => o !== c.id), openAt: Date.now() })
                  }
                />
                {c.emoji} {c.title}
              </label>
            ))}
          </div>
        </div>
      )}
      <Ranking
        code={code}
        big
        onRemove={host ? (id) => confirm("¿Quitar este equipo del ranking?") && patch({ removed: [...host.removed, id] }) : undefined}
      />
    </div>
  );
}
