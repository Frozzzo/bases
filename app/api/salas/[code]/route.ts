import { getState } from "@/lib/store";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const state = await getState(code.toUpperCase());
  if (!state) return Response.json({ error: "Sala no encontrada" }, { status: 404 });
  return Response.json(state, { headers: { "Cache-Control": "no-store" } });
}
