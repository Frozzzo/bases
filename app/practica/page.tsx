import Link from "next/link";
import { ChallengeList } from "@/components/ChallengeList";

export default function Page() {
  return (
    <div className="page narrow">
      <p>
        <Link href="/">← Inicio</Link>
      </p>
      <h1>🎯 Práctica</h1>
      <p className="lead">Todos los retos, sin sala ni ranking. Los puntajes se muestran pero no se guardan.</p>
      <ChallengeList base="/practica" />
    </div>
  );
}
