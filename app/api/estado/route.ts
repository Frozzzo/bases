import { backend, backendKind, ping } from "@/lib/store";
export const dynamic = "force-dynamic";
export async function GET() {
  const p = await ping();
  return Response.json(
    { backend, kind: backendKind, ok: p.ok, error: p.error, vercel: !!process.env.VERCEL },
    { headers: { "Cache-Control": "no-store" } }
  );
}
