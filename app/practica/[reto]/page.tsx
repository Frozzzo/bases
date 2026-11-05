import { ChallengePage } from "@/components/registry";
export default async function Page({ params }: { params: Promise<{ reto: string }> }) {
  const { reto } = await params;
  return <ChallengePage code={null} reto={reto} />;
}
