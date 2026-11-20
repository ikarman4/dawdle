import { useEffect, useState } from "react";
import { resumeAudio, startPlayback, stopPlayback } from "./audio";
import { mean } from "./progress";
import { sameName, useGame } from "./store";
import type { BoardCard } from "./types";

export function BoardView() {
  const { state, cards, dispatch } = useGame();
  const [tab, setTab] = useState<"global" | "friends">("global");
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => () => stopPlayback(), []);

  async function play(card: BoardCard) {
    if (active === card.id) {
      stopPlayback();
      setActive(null);
      return;
    }
    await resumeAudio();
    stopPlayback();
    setActive(card.id);
    startPlayback({
      from: 0,
      events: card.events,
      bpm: card.bpm,
      metronome: false,
      onTick: () => undefined,
      onEnd: () => setActive((current) => (current === card.id ? null : current)),
      onBeat: () => undefined,
    });
  }

  const todayCards = cards
    .filter((card) => card.date === state.today)
    .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username));
  const earlier = cards
    .filter((card) => card.date !== state.today)
    .sort((a, b) => b.date.localeCompare(a.date) || b.score - a.score);
  const friendCards = todayCards.filter(
    (card) => state.follows.some((name) => sameName(name, card.username)) && !sameName(card.username, state.username),
  );
  const friendsWithoutScore = state.follows.filter(
    (name) => !sameName(name, state.username) && !friendCards.some((card) => sameName(card.username, name)),
  );
  const offer = state.offerFollow
    ? cards.find((card) => sameName(card.username, state.offerFollow ?? ""))
    : undefined;

  function Card({ card, rank }: { card: BoardCard; rank?: number }) {
    const mine = sameName(card.username, state.username);
    const following = state.follows.some((name) => sameName(name, card.username));
    return (
      <li>
        {rank != null && <span className="rank">{rank}</span>}
        <div>
          <strong>{card.username}</strong>
          <p>
            {card.title} · {card.date} · {card.locked ? "Official" : "In progress"}
          </p>
        </div>
        <span className="card-score">{card.score}%</span>
        <button type="button" aria-label={`Play ${card.username}`} onClick={() => void play(card)}>
          {active === card.id ? "Stop" : "Play"}
        </button>
        {!mine && (
          <button type="button" onClick={() => dispatch(following ? { type: "unfollow", name: card.username } : { type: "follow", name: card.username })}>
            {following ? "Unfollow" : "Follow"}
          </button>
        )}
      </li>
    );
  }

  return (
    <section className="board" data-testid="board">
      <header className="header">
        <div>
          <h1 className="wordmark">Board</h1>
          <p className="date">{state.today} UTC</p>
        </div>
      </header>
      <div className="row" role="tablist" aria-label="Board">
        <button type="button" role="tab" aria-selected={tab === "global"} onClick={() => setTab("global")}>
          Global
        </button>
        <button type="button" role="tab" aria-selected={tab === "friends"} onClick={() => setTab("friends")}>
          Friends
        </button>
      </div>
      {offer && (
        <p className="banner">
          Opened a sketch from {offer.username}.{" "}
          <button type="button" onClick={() => dispatch({ type: "follow", name: offer.username })}>
            Follow
          </button>
        </p>
      )}
      {tab === "global" ? (
        <>
          {todayCards.length === 0 && earlier.length === 0 ? (
            <p>
              The global board is this browser, plus any sketch you open from a share link. Submit a try, or open someone's link, and a card
              shows up here. Nobody is invented.
            </p>
          ) : (
            <>
              {state.imports.length === 0 && (
                <p>Shared compositions show up here when you open someone's link. The board never invents players.</p>
              )}
              <ol className="feed">
                {todayCards.map((card, index) => (
                  <Card key={card.id} card={card} rank={index + 1} />
                ))}
              </ol>
              {earlier.length > 0 && (
                <>
                  <h2>Earlier days</h2>
                  <ol className="feed">
                    {earlier.map((card) => (
                      <Card key={card.id} card={card} />
                    ))}
                  </ol>
                </>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {friendCards.length === 0 && friendsWithoutScore.length === 0 ? (
            <p>Friends are people you follow. Follow someone from a shared card and their name lands here.</p>
          ) : (
            <ol className="feed">
              {friendCards.map((card, index) => (
                <Card key={card.id} card={card} rank={index + 1} />
              ))}
              {friendsWithoutScore.map((name) => (
                <li key={name}>
                  <strong>{name}</strong>
                  <p>No score today</p>
                  <button type="button" onClick={() => dispatch({ type: "unfollow", name })}>
                    Unfollow
                  </button>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      {todayCards.length > 1 && <p>Today's board average {mean(todayCards.map((card) => card.score))}%</p>}
    </section>
  );
}
