import { createRoom } from "@/lib/store";
export const dynamic = "force-dynamic";
export async function POST() {
  try {
    const { room, adminKey } = await createRoom();
    return Response.json({ room, adminKey });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
