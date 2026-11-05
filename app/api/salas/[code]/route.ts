import { sync, CODE_RE, type SyncBody } from "@/lib/store";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

function codeOf(raw: string) {
  const code = raw.trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

/** Estado actual de la sala (solo lectura). */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = codeOf((await params).code);
  if (!code) return Response.json({ error: "Código de sala inválido" }, { status: 400 });
  return Response.json(sync(code, {}), { headers });
}

/** Sincroniza: el navegador manda lo que sabe (su equipo y puntajes, o el panel del facilitador) y recibe el estado fusionado. */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = codeOf((await params).code);
  if (!code) return Response.json({ error: "Código de sala inválido" }, { status: 400 });
  const text = await req.text();
  if (text.length > 200_000) return Response.json({ error: "Demasiados datos" }, { status: 413 });
  let body: SyncBody = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  return Response.json(sync(code, body), { headers });
}
