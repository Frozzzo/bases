"use client";

import { useEffect, useRef, useState } from "react";
import { CHALLENGES, teamTotals } from "@/lib/challenges";
import { useRoomState, type RoomState } from "@/lib/client";

export function computeRanking(state: RoomState | null) {
  if (!state) return [];
  return state.teams
    .map((t) => ({ team: t, ...teamTotals(state.scores[t.id]) }))
    .sort((a, b) => b.total - a.total || a.team.joinedAt - b.team.joinedAt);
}

export function Ranking({
  code,
  compact,
  highlight,
  big,
  onRemove,
}: {
  code: string;
  compact?: boolean;
  highlight?: string;
  big?: boolean;
  onRemove?: (teamId: string) => void;
}) {
  const { state, error } = useRoomState(code, big ? 2000 : 3000);
  const rows = computeRanking(state);
  const prev = useRef<Record<string, number>>({});
  const [bumped, setBumped] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const b: Record<string, boolean> = {};
    for (const r of rows) if (prev.current[r.team.id] !== undefined && prev.current[r.team.id] < r.total) b[r.team.id] = true;
    prev.current = Object.fromEntries(rows.map((r) => [r.team.id, r.total]));
    if (Object.keys(b).length) {
      setBumped(b);
      const id = setTimeout(() => setBumped({}), 1500);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const shown = CHALLENGES.filter((c) => !state || state.room.open.includes(c.id));

  return (
    <div className={`ranking ${big ? "big" : ""}`}>
      <h2>🏆 Ranking {compact ? "" : `· sala ${code}`}</h2>
      {error && <p className="muted small">{error}</p>}
      {!rows.length && !error && <p className="muted">Aún no hay equipos. ¡Únanse con el código {code}!</p>}
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Equipo</th>
            {!compact &&
              shown.map((c) => (
                <th key={c.id} title={c.title} className="num">
                  {c.emoji}
                </th>
              ))}
            <th className="num">Total</th>
            {onRemove && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.team.id} className={`${r.team.id === highlight ? "me" : ""} ${bumped[r.team.id] ? "bump" : ""}`}>
              <td>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</td>
              <td>
                {r.team.name} <span className="tag">{r.team.mode === "dev" ? "dev" : "fácil"}</span>
              </td>
              {!compact &&
                shown.map((c) => (
                  <td key={c.id} className="num">
                    {r.per[c.id] || "·"}
                  </td>
                ))}
              <td className="num strong">{r.total}</td>
              {onRemove && (
                <td>
                  <button className="link danger" onClick={() => onRemove(r.team.id)} title="Quitar equipo">
                    ✕
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
