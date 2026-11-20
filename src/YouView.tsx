import { useState } from "react";
import { songForDate } from "./daily";
import { mean } from "./progress";
import { shareHash } from "./share";
import { sameName, useGame } from "./store";

export function YouView() {
  const { state, day, dispatch, streak, high, average, cards } = useGame();
  const [copied, setCopied] = useState(false);
  const todayCards = cards.filter((card) => card.date === state.today);
  const others = todayCards.filter((card) => card.source === "share");
  const boardAverage = others.length > 0 ? mean(todayCards.map((card) => card.score)) : null;
  const song = songForDate(state.today);
  const own = cards.find((card) => card.source === "you" && card.date === state.today && card.locked);
  const shareUrl = own ? `${location.origin}${location.pathname}${location.search}#${shareHash({ ...own, follows: state.follows })}` : "";
  const seen = state.imports.filter((card, index, all) => all.findIndex((item) => sameName(item.username, card.username)) === index);

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="you">
      <header className="header">
        <div>
          <h1 className="wordmark">You</h1>
          <p className="date">{state.today} UTC</p>
        </div>
      </header>
      <label className="name-field">
        <span>Your name</span>
        <input value={state.username} maxLength={20} autoComplete="nickname" onChange={(event) => dispatch({ type: "set-name", name: event.target.value })} />
      </label>
      <dl className="stats">
        <div>
          <dt>Streak</dt>
          <dd>{streak}</dd>
        </div>
        <div>
          <dt>All-time high</dt>
          <dd>{high == null ? "—" : `${high}%`}</dd>
        </div>
        <div>
          <dt>Average</dt>
          <dd>{average == null ? "—" : `${average}%`}</dd>
        </div>
      </dl>
      <p>
        {average == null ? "Your average starts when a day locks." : `Your average is ${average}%.`}{" "}
        {!day.locked
          ? "Today's average opens after you finish."
          : boardAverage == null
            ? "The average shows up when a shared sketch is opened."
            : `Today's average is ${boardAverage}%.`}
      </p>
      <h2>Today</h2>
      <p>
        {song.title} · {day.locked ? `Official ${own?.score ?? 0}%` : day.attempts.length ? "Still open" : "Not started"}
      </p>
      {!day.locked && <p>Sharing and other people's scores open after all five tries.</p>}
      {day.locked && own ? (
        <div className="row">
          <button type="button" onClick={() => void copy()}>
            Share
          </button>
          {copied && <p>Link copied.</p>}
        </div>
      ) : (
        day.locked && <p>Add a name on your next try and sharing turns on.</p>
      )}
      {day.locked && shareUrl && <input readOnly value={shareUrl} aria-label="Share link" />}
      <h2>Following</h2>
      {state.follows.length === 0 ? (
        <p>Follow someone from a shared card. Their name lands here.</p>
      ) : (
        <ul className="feed">
          {state.follows.map((name) => (
            <li key={name}>
              <strong>{name}</strong>
              <button type="button" onClick={() => dispatch({ type: "unfollow", name })}>
                Unfollow
              </button>
            </li>
          ))}
        </ul>
      )}
      <h2>Followers</h2>
      {state.followers.length === 0 ? (
        <p>Followers appear when someone who follows you shares a link and you open it.</p>
      ) : (
        <ul className="feed">
          {state.followers.map((name) => (
            <li key={name}>
              <strong>{name}</strong>
            </li>
          ))}
        </ul>
      )}
      {seen.length > 0 && (
        <>
          <h2>From shared links</h2>
          <ul className="feed">
            {seen.map((card) => {
              const following = state.follows.some((name) => sameName(name, card.username));
              return (
                <li key={card.username}>
                  <strong>{card.username}</strong>
                  <button
                    type="button"
                    onClick={() => dispatch(following ? { type: "unfollow", name: card.username } : { type: "follow", name: card.username })}
                  >
                    {following ? "Unfollow" : "Follow"}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
