"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ChallengeList } from "@/components/ChallengeList";
import { Ranking } from "@/components/Ranking";
import { teamTotals } from "@/lib/challenges";
import { getSavedTeam, useRoomState, type Team } from "@/lib/client";

export default function Page({ params }: { params: Promise<{ code: string }> }) {
  const code = use(params).code.toUpperCase();
  const { state, error } = useRoomState(code);
  const [team, setTeam] = useState<Team | null>(null);
  useEffect(() => setTeam(getSavedTeam(code)), [code]);
  const mine = team && state ? teamTotals(state.scores[team.id]) : null;

  return (
    <div className="page">
      <header className="topbar">
        <Link href="/" className="back">← Inicio</Link>
        <h1>Sala {code}</h1>
        <div>{team ? <span className="pill">Equipo: {team.name}</span> : <Link href={`/?sala=${code}`}>Unirse</Link>}</div>
      </header>
      {error && <div className="banner error">{error}</div>}
      {team && state && !state.teams.some((t) => t.id === team.id) && (
        <div className="banner warn">Tu equipo ya no está en esta sala. <Link href={`/?sala=${code}`}>Vuelve a unirte</Link>.</div>
      )}
      <div className="withSide">
        <main>
          {mine && <p className="lead">Tu puntaje total: <strong>{mine.total}</strong></p>}
          <ChallengeList base={`/sala/${code}`} open={state?.room.open} scores={mine?.per} />
        </main>
        <aside className="side">
          <Ranking code={code} compact highlight={team?.id} />
        </aside>
      </div>
    </div>
  );
}
