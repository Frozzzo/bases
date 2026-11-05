"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { saveAdminKey, saveTeam, type Mode } from "@/lib/client";

function Home() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("facil");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [backend, setBackend] = useState<{ backend: string; vercel: boolean } | null>(null);

  useEffect(() => {
    const s = params.get("sala");
    if (s) setCode(s.toUpperCase());
    fetch("/api/estado")
      .then((r) => r.json())
      .then(setBackend)
      .catch(() => {});
  }, [params]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const c = code.trim().toUpperCase();
      const res = await fetch(`/api/salas/${c}/unirse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo unir");
      saveTeam(c, data.team);
      router.push(`/sala/${c}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/salas", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo crear");
      saveAdminKey(data.room.code, data.adminKey);
      router.push(`/sala/${data.room.code}/facilitador`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <div className="hero">
        <div className="heroEmoji">🕵️‍♀️⏱️🔥</div>
        <h1>Cazadores de cuellos de botella</h1>
        <p className="lead">Un juego por equipos para entender por qué el software es lento y cómo medirlo.</p>
      </div>

      <div className="grid2">
        <form className="card" onSubmit={join}>
          <h2>Unirse a una sala</h2>
          <label>
            Código de sala
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD"
              maxLength={6}
              required
              className="codeInput"
            />
          </label>
          <label>
            Nombre del equipo
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Los Profilers" maxLength={40} required />
          </label>
          <div className="label">Modo del equipo</div>
          <div className="segmented">
            <button type="button" className={mode === "facil" ? "on" : ""} onClick={() => setMode("facil")}>
              🌱 Fácil <small>sin programar</small>
            </button>
            <button type="button" className={mode === "dev" ? "on" : ""} onClick={() => setMode("dev")}>
              🧑‍💻 Dev <small>con código</small>
            </button>
          </div>
          <button className="primary" disabled={busy}>
            Entrar
          </button>
        </form>

        <div className="card">
          <h2>¿Eres facilitador?</h2>
          <p>Crea una sala, proyecta el ranking y comparte el código con los equipos.</p>
          <button className="primary" onClick={create} disabled={busy}>
            Crear sala
          </button>
          <hr />
          <p>
            <Link href="/teoria">📽️ Diapositivas de teoría</Link>
          </p>
          <p>
            <Link href="/practica">🎯 Practicar sin sala</Link>
          </p>
        </div>
      </div>
      {error && <div className="banner error">{error}</div>}
      {backend && backend.backend === "memoria" && backend.vercel && (
        <div className="banner warn">
          Este despliegue usa memoria del servidor: en Vercel las salas pueden perderse o no compartirse entre instancias.
          Conecta Upstash Redis (ver README) para la clase.
        </div>
      )}
      {backend && (
        <p className="muted small center">Almacenamiento: {backend.backend === "redis" ? "Redis (compartido)" : "memoria del servidor"}</p>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
