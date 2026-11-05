"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

export interface Slide {
  title?: string;
  body: ReactNode;
  notes?: string;
  className?: string;
}

export function Deck({ slides }: { slides: Slide[] }) {
  const [i, setI] = useState(0);
  const [notes, setNotes] = useState(false);

  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.hash.slice(1)).get("s"));
    if (n > 0 && n <= slides.length) setI(n - 1);
  }, [slides.length]);
  useEffect(() => {
    history.replaceState(null, "", `#s=${i + 1}`);
  }, [i]);

  const go = useCallback((d: number) => setI((x) => Math.max(0, Math.min(slides.length - 1, x + d))), [slides.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) {
        e.preventDefault();
        go(1);
      } else if (["ArrowLeft", "PageUp", "Backspace"].includes(e.key)) {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Home") setI(0);
      else if (e.key === "End") setI(slides.length - 1);
      else if (e.key.toLowerCase() === "n") setNotes((v) => !v);
      else if (e.key.toLowerCase() === "f") {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, slides.length]);

  const s = slides[i];
  return (
    <div className="deck">
      <div className={`slide ${s.className || ""}`} onClick={(e) => (e.clientX > window.innerWidth / 3 ? go(1) : go(-1))}>
        {s.title && <h1 className="slideTitle">{s.title}</h1>}
        <div className="slideBody">{s.body}</div>
      </div>
      {notes && s.notes && (
        <div className="notes">
          <strong>Notas:</strong> {s.notes}
        </div>
      )}
      <div className="deckBar">
        <Link href="/">⌂</Link>
        <button onClick={() => go(-1)} aria-label="Anterior">
          ←
        </button>
        <span>
          {i + 1} / {slides.length}
        </span>
        <button onClick={() => go(1)} aria-label="Siguiente">
          →
        </button>
        <button onClick={() => setNotes((v) => !v)}>{notes ? "Ocultar notas" : "Notas (N)"}</button>
        <span className="muted small">F: pantalla completa</span>
      </div>
      <div className="deckProgress" style={{ width: `${((i + 1) / slides.length) * 100}%` }} />
    </div>
  );
}
