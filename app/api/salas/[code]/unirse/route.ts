import { joinRoom, type Mode } from "@/lib/store";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = (await req.json().catch(() => ({}))) as { name?: string; mode?: Mode };
  const name = (body.name || "").trim();
  if (!name) return Response.json({ error: "Falta el nombre del equipo" }, { status: 400 });
  const team = await joinRoom(code.toUpperCase(), name, body.mode === "dev" ? "dev" : "facil");
  if (!team) return Response.json({ error: "Sala no encontrada" }, { status: 404 });
  return Response.json({ team });
}
