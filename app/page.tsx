"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createHostedRoom, getSavedTeam, newTeam, saveTeam, type Mode } from "@/lib/client";

function Home() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("facil");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = params.get("sala");
    if (s) setCode(s.toUpperCase());
  }, [params]);

  const [unsure, setUnsure] = useState<string | null>(null);

  async function hostOnline(c: string) {
    // El panel del facilitador sincroniza cada ~2 s; con varias instancias puede tardar en aparecer.
    for (let i = 0; i < 3; i++) {
      try {
        const st = await (await fetch(`/api/salas/${c}`, { cache: "no-store" })).json();
        if (st?.room?.hostSeenAt && Date.now() - st.room.hostSeenAt < 60_000) return true;
      } catch {}
      await new Promise((r) => setTimeout(r, 700));
    }
    return false;
  }

  async function join(e?: React.FormEvent, force = false) {
    e?.preventDefault();
    setError(null);
    const c = code.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z0-9]{4,6}$/.test(c)) return setError("El código de sala tiene 4 letras o números.");
    if (!name.trim()) return setError("Falta el nombre del equipo.");
    setBusy(true);
    try {
      if (!force && !(await hostOnline(c))) {
        setUnsure(c);
        return;
      }
      // Si este navegador ya estaba en la sala, conserva el equipo (y sus puntajes).
      const prev = getSavedTeam(c);
      saveTeam(c, prev ? { ...prev, name: name.trim().slice(0, 40), mode } : newTeam(name, mode));
      router.push(`/sala/${c}`);
    } finally {
      setBusy(false);
    }
  }

  function create() {
    const c = createHostedRoom();
    router.push(`/sala/${c}/facilitador`);
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
            <Link href="/practica">🎯 Practicar sin sala</Link>
          </p>
        </div>
      </div>
      {error && <div className="banner error">{error}</div>}
      {unsure && (
        <div className="banner warn">
          No encontramos al facilitador de la sala <strong>{unsure}</strong>. Revisa el código (y que el panel del facilitador esté abierto).{" "}
          <button className="link" onClick={() => join(undefined, true)}>
            Entrar igual
          </button>
        </div>
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
