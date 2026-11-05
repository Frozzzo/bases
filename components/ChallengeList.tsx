"use client";

import Link from "next/link";
import { CHALLENGES } from "@/lib/challenges";

export function ChallengeList({ base, open, scores }: { base: string; open?: string[]; scores?: Record<string, number> }) {
  return (
    <div className="challengeGrid">
      {CHALLENGES.map((c) => {
        const locked = open && !open.includes(c.id);
        const body = (
          <>
            <div className="cEmoji">{c.emoji}</div>
            <div>
              <h3>
                {c.title} {c.extra && <span className="tag">extra</span>}
              </h3>
              <p>{c.short}</p>
              {scores && <p className="score">{scores[c.id] ? `${scores[c.id]} / 1000` : "Sin puntaje aún"}</p>}
              {locked && <p className="muted small">🔒 El facilitador aún no lo abre</p>}
            </div>
          </>
        );
        return locked ? (
          <div key={c.id} className="challengeCard locked">
            {body}
          </div>
        ) : (
          <Link key={c.id} href={`${base}/${c.id}`} className="challengeCard">
            {body}
          </Link>
        );
      })}
    </div>
  );
}
