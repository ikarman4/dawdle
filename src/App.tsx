import { useEffect, useState } from "react";
import { BoardView } from "./BoardView";
import { PlayView } from "./PlayView";
import { GameProvider } from "./store";
import { YouView } from "./YouView";

type View = "play" | "board" | "you";

function viewFromHash(): View {
  const raw = location.hash.replace(/^#/, "");
  if (raw.startsWith("board") || raw.startsWith("s/")) return "board";
  if (raw.startsWith("you")) return "you";
  return "play";
}

function Shell() {
  const [view, setView] = useState<View>(viewFromHash);
  useEffect(() => {
    const apply = () => setView(viewFromHash());
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  return (
    <div className="app">
      <main>
        {view === "play" && <PlayView />}
        {view === "board" && <BoardView />}
        {view === "you" && <YouView />}
      </main>
      <nav className="nav" aria-label="Primary">
        <a href="#play" aria-current={view === "play" ? "page" : undefined}>
          Play
        </a>
        <a href="#board" aria-current={view === "board" ? "page" : undefined}>
          Board
        </a>
        <a href="#you" aria-current={view === "you" ? "page" : undefined}>
          You
        </a>
      </nav>
    </div>
  );
}

export function App() {
  return (
    <GameProvider>
      <Shell />
    </GameProvider>
  );
}
