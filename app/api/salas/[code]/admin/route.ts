import { setOpen, removeTeam } from "@/lib/store";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = (await req.json().catch(() => ({}))) as { adminKey?: string; open?: string[]; removeTeam?: string };
  const c = code.toUpperCase();
  const key = body.adminKey || "";
  let ok = true;
  if (Array.isArray(body.open)) ok = await setOpen(c, key, body.open);
  if (ok && body.removeTeam) ok = await removeTeam(c, key, body.removeTeam);
  if (!ok) return Response.json({ error: "No autorizado" }, { status: 403 });
  return Response.json({ ok: true });
}
