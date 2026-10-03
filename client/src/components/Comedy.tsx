import { useEffect, useState } from "react";
import {
  COMEDY,
  advanceCaptions,
  emptyCaptions,
  creditRating,
  lostAllIn,
  type CommentaryLevel,
  type PlayerView,
  type PublicPlayer,
  type Reaction,
} from "@insider/shared";
import { Avatar, Sparkline } from "./Common";
import type { Connection } from "../net/connection";
export function Credit({ trust }: { trust: number }) {
  return <small className="credit-rating">{creditRating(trust)}</small>;
}
export function GameAvatar({
  view,
  player,
  index,
  now,
  small = false,
}: {
  view: PlayerView;
  player: PublicPlayer;
  index: number;
  now: number;
  small?: boolean;
}) {
  const result = view.result;
  const reveal = view.phase === "REVEAL";
  const shark =
    reveal && result?.role === "SHARK" && result.insiderId === player.id;
  const exploding =
    reveal &&
    result?.outcomes.some(
      (o) => o.playerId === player.id && o.guess?.stake === 300 && !o.correct,
    );
  const age = Math.max(0, now - (result?.revealedAt ?? 0));
  return (
    <span className="comedy-avatar">
      <span className={shark && age < 900 ? "shark-morph" : ""}>
        {shark ? (
          <span
            className="avatar shark-avatar"
            role="img"
            aria-label="Revealed Shark"
          >
            🦈
          </span>
        ) : (
          <Avatar player={player} index={index} small={small} />
        )}
      </span>
      {exploding && age < 1400 && (
        <span className="allin-explosion" aria-hidden="true">
          💥
        </span>
      )}
      {lostAllIn(view, player.id) && (
        <span className="bankrupt-badge" title={COMEDY.microcopy.bankrupt[1]}>
          {COMEDY.microcopy.bankrupt[0]}
        </span>
      )}
    </span>
  );
}
export function CrashTicker({ view, now }: { view: PlayerView; now: number }) {
  const r = view.result;
  if (view.phase !== "REVEAL" || !r || r.trustDelta > -30) return null;
  const player = view.players.find((p) => p.id === r.insiderId)!;
  return (
    <div className="trust-crash" role="status">
      <strong>
        {player.name} ·{" "}
        {COMEDY.microcopy.crash[r.round % COMEDY.microcopy.crash.length]}
      </strong>
      <Sparkline
        values={player.trustHistory}
        label={`${player.name} trust crash`}
        crash={now - r.revealedAt < 1800}
      />
      <Credit trust={player.trust} />
    </div>
  );
}
export function Reactions({ connection }: { connection: Connection }) {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="reaction-buttons" aria-label="Reveal reactions">
      {Object.entries(COMEDY.reactions).map(([emoji, glyph]) => (
        <button
          className="secondary"
          key={emoji}
          aria-label={`Throw ${emoji}`}
          disabled={!connection.ready || connection.busy || now < until}
          onClick={async () => {
            setUntil(Date.now() + 1500);
            await connection.act({
              type: "reaction",
              emoji: emoji as Reaction["emoji"],
            });
          }}
        >
          {glyph}
        </button>
      ))}
    </div>
  );
}
function FlyingReaction({
  reaction,
  now,
}: {
  reaction: Reaction;
  now: number;
}) {
  const [age] = useState(Math.max(0, now - reaction.at));
  const lane =
    Array.from(reaction.id).reduce((n, c) => n + c.charCodeAt(0), 0) % 60;
  return (
    <span
      className="flying-reaction"
      style={{ top: `${15 + lane}%`, animationDelay: `-${age}ms` }}
    >
      {COMEDY.reactions[reaction.emoji]}
    </span>
  );
}
export function ReactionSky({ view, now }: { view: PlayerView; now: number }) {
  return (
    <div className="reaction-sky" aria-hidden="true">
      {view.phase === "REVEAL" &&
        (view.reactions ?? [])
          .filter((r) => r.round === view.round && now - r.at < 2500)
          .map((reaction) => (
            <FlyingReaction key={reaction.id} reaction={reaction} now={now} />
          ))}
    </div>
  );
}
export function CaptionBar({
  view,
  now,
  level,
}: {
  view: PlayerView;
  now: number;
  level: CommentaryLevel;
}) {
  const [captions, setCaptions] = useState(emptyCaptions);
  useEffect(() => {
    setCaptions((state) =>
      advanceCaptions(
        state,
        view.commentary ?? [],
        level,
        now,
        view.gameId ?? "",
        view.round,
        view.phase,
      ),
    );
  }, [view.commentary, view.gameId, view.round, view.phase, level, now]);
  if (level === "OFF" || !captions.current || captions.current.expiresAt <= now)
    return null;
  return (
    <aside
      className="caption-bar"
      aria-label="Live commentary"
      aria-live="polite"
    >
      {captions.current.turns.map((turn, i) => (
        <p key={`${captions.current!.id}:${i}`}>
          <strong>{turn.speaker}</strong> {turn.text}
        </p>
      ))}
    </aside>
  );
}
