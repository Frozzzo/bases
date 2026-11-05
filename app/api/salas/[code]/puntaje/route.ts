import { submitScore, CODE_RE, TEAM_ID_RE, type Team } from "@/lib/store";
import { CHALLENGE_IDS, challengeOf } from "@/lib/challenges";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  const body = (await req.json().catch(() => ({}))) as {
    teamId?: string;
    team?: Partial<Team>;
    key?: string;
    score?: number;
  };
  const key = String(body.key || "");
  const score = Math.round(Number(body.score));
  const teamId = String(body.teamId || body.team?.id || "");
  if (!CODE_RE.test(code)) return Response.json({ error: "Código de sala inválido" }, { status: 400 });
  if (!TEAM_ID_RE.test(teamId)) return Response.json({ error: "Equipo inválido: vuelve a unirte a la sala" }, { status: 400 });
  if (!/^[a-z0-9:-]{1,40}$/.test(key) || !CHALLENGE_IDS.includes(challengeOf(key)))
    return Response.json({ error: `Reto desconocido (${key})` }, { status: 400 });
  if (!Number.isFinite(score) || score < 0 || score > 1000)
    return Response.json({ error: "Puntaje fuera de rango" }, { status: 400 });
  const team: Team = {
    id: teamId,
    name: String(body.team?.name || "Equipo").slice(0, 40),
    mode: body.team?.mode === "dev" ? "dev" : "facil",
    joinedAt: Number(body.team?.joinedAt) || Date.now(),
  };
  try {
    const r = await submitScore(code, team, key, score);
    if ("error" in r) return Response.json({ error: "El facilitador quitó a este equipo de la sala" }, { status: 410 });
    return Response.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[puntaje]", e);
    return Response.json({ error: "El almacenamiento no respondió, reintentando" }, { status: 503 });
  }
}
