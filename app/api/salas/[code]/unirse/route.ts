import { joinRoom, CODE_RE, type Mode } from "@/lib/store";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = (await req.json().catch(() => ({}))) as { name?: string; mode?: Mode };
  const name = (body.name || "").trim();
  const c = code.trim().toUpperCase();
  if (!CODE_RE.test(c)) return Response.json({ error: "El código de sala debe tener 4 letras/números" }, { status: 400 });
  if (!name) return Response.json({ error: "Falta el nombre del equipo" }, { status: 400 });
  let team;
  try {
    team = await joinRoom(c, name, body.mode === "dev" ? "dev" : "facil");
  } catch (e) {
    console.error("[unirse]", e);
    return Response.json({ error: "El almacenamiento no respondió. Intenta de nuevo." }, { status: 503 });
  }
  if (!team) return Response.json({ error: "Sala no encontrada" }, { status: 404 });
  return Response.json({ team });
}
