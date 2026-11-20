import { useEffect, useState } from "react";
import { AuthorView } from "./AuthorView";
import { BoardView } from "./BoardView";
import { PlayView } from "./PlayView";
import { GameProvider } from "./store";
import { YouView } from "./YouView";

type View = "play" | "leaderboard" | "you" | "author";

function viewFromHash(): View {
  const raw = location.hash.replace(/^#/, "");
  if (raw.startsWith("leaderboard")) return "leaderboard";
  if (raw.startsWith("you")) return "you";
  if (raw.startsWith("author")) return "author";
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
        {view === "leaderboard" && <BoardView />}
        {view === "you" && <YouView />}
        {view === "author" && <AuthorView />}
      </main>
      {view !== "play" && (
        <nav className="nav" aria-label="Primary">
          <a href="#play">Play</a>
          <a href="#you" aria-current={view === "you" ? "page" : undefined}>
            You
          </a>
          <a href="#author" aria-current={view === "author" ? "page" : undefined}>
            Author
          </a>
        </nav>
      )}
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
