import { ChallengePage } from "@/components/registry";
export default async function Page({ params }: { params: Promise<{ code: string; reto: string }> }) {
  const { code, reto } = await params;
  return <ChallengePage code={code.toUpperCase()} reto={reto} />;
}
