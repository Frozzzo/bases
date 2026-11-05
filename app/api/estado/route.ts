import { backend } from "@/lib/store";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json({ backend, vercel: !!process.env.VERCEL });
}
