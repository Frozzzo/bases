import { getState, backend, CODE_RE } from "@/lib/store";
import { CHALLENGE_IDS } from "@/lib/challenges";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let state;
  try {
    state = await getState(code.toUpperCase());
  } catch (e) {
    console.error("[sala]", e);
    return Response.json({ error: "El almacenamiento no respondió" }, { status: 503 });
  }
  // En modo memoria (sin Redis) la sala puede estar en otra instancia: devolvemos una sala vacía en vez de un error.
  if (!state && backend === "memoria" && CODE_RE.test(code.toUpperCase()))
    state = { room: { code: code.toUpperCase(), createdAt: Date.now(), open: CHALLENGE_IDS }, teams: [], scores: {} };
  if (!state) return Response.json({ error: "Sala no encontrada" }, { status: 404 });
  return Response.json(state, { headers: { "Cache-Control": "no-store" } });
}
