import { submitScore } from "@/lib/store";
import { CHALLENGE_IDS, challengeOf } from "@/lib/challenges";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = (await req.json().catch(() => ({}))) as { teamId?: string; key?: string; score?: number };
  const key = String(body.key || "");
  const score = Math.round(Number(body.score));
  if (!body.teamId || !CHALLENGE_IDS.includes(challengeOf(key)) || !/^[a-z0-9:-]{1,40}$/.test(key))
    return Response.json({ error: "Datos inválidos" }, { status: 400 });
  if (!Number.isFinite(score) || score < 0 || score > 1000)
    return Response.json({ error: "Puntaje fuera de rango" }, { status: 400 });
  const best = await submitScore(code.toUpperCase(), body.teamId, key, score);
  if (best === null) return Response.json({ error: "Equipo o sala no encontrados" }, { status: 404 });
  return Response.json({ best });
}
