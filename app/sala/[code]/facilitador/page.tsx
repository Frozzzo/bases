"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { BackendBanner } from "@/components/BackendBanner";
import { Ranking } from "@/components/Ranking";
import { CHALLENGES } from "@/lib/challenges";
import { getAdminKey, useRoomState } from "@/lib/client";

export default function Page({ params }: { params: Promise<{ code: string }> }) {
  const code = use(params).code.toUpperCase();
  const { state, refresh } = useRoomState(code, 4000);
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setAdminKey(getAdminKey(code));
    setOrigin(window.location.origin);
  }, [code]);

  async function admin(body: object) {
    await fetch(`/api/salas/${code}/admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminKey, ...body }),
    });
    refresh();
  }

  const open = state?.room.open || [];
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
      <BackendBanner />
      {!adminKey && (
        <div className="banner warn">Este navegador no creó la sala, así que solo puedes ver el ranking (no abrir/cerrar retos).</div>
      )}
      {adminKey && (
        <div className="card">
          <h2>Retos abiertos</h2>
          <p className="muted small">Abre los retos a medida que avanza la clase. Los equipos ven los cerrados con candado.</p>
          <div className="toggles">
            {CHALLENGES.map((c) => (
              <label key={c.id} className="check">
                <input
                  type="checkbox"
                  checked={open.includes(c.id)}
                  onChange={(e) => admin({ open: e.target.checked ? [...open, c.id] : open.filter((o) => o !== c.id) })}
                />
                {c.emoji} {c.title}
              </label>
            ))}
          </div>
        </div>
      )}
      <Ranking code={code} big onRemove={adminKey ? (id) => confirm("¿Quitar este equipo del ranking?") && admin({ removeTeam: id }) : undefined} />
    </div>
  );
}
