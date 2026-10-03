import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  LockKeyhole,
  MessageCircle,
  Shield,
  Timer,
  TrendingUp,
  Trophy,
  Check,
  ChevronRight,
  BarChart3,
} from "lucide-react";
import {
  BOTS,
  NARRATION_VISIBLE_MS,
  copy,
  PHRASES,
  type Direction,
  type PlayerView,
  type Stake,
} from "@insider/shared";
import { Modal, Sparkline, number, signed } from "../components/Common";
import { save, type Connection } from "../net/connection";
import { secondsRemaining } from "../net/clock";

import {
  Credit,
  GameAvatar,
  CrashTicker,
  Reactions,
} from "../components/Comedy";

type GameProps = { view: PlayerView; connection: Connection; now: number };
export function Game({ view, connection, now }: GameProps) {
  const [drawer, setDrawer] = useState(false),
    [chat, setChat] = useState(false),
    [noteDismissed, setNoteDismissed] = useState(false);
  const me = view.players.find((p) => p.id === view.me)!,
    insider = view.players.find((p) => p.id === view.insiderId)!,
    isInsider = view.me === view.insiderId;
  const remaining = secondsRemaining(
      view.phaseStartedAt,
      view.phaseEndsAt,
      now,
    ),
    disabled = !connection.ready || connection.busy;
  if (view.phase === "FINAL")
    return <Final view={view} connection={connection} now={now} />;
  return (
    <section className={`game-area phase-${view.phase.toLowerCase()}`}>
      <div className="round-bar">
        <div>
          <span className="micro">
            ROUND {view.round}{" "}
            <span className="muted">/ {view.totalRounds}</span>
          </span>
          <span className="round-stage">
            {view.phase === "TIP"
              ? "The inside scoop"
              : view.phase === "GUESS"
                ? "Make your move"
                : "The receipts"}
          </span>
        </div>
        <div className="round-stats">
          <span className="my-balance">
            {number(me.coins)}{" "}
            <small>{me.coins < 0 ? "in debt" : "coins"}</small>
          </span>
          <span
            className={`timer ${remaining <= 5 ? "urgent" : ""}`}
            aria-label={`${remaining} seconds remaining`}
          >
            <Timer size={16} />
            {remaining ? `${remaining}s` : "Syncing"}
          </span>
          <button
            className="icon-button"
            onClick={() => setDrawer(true)}
            aria-label="Open scoreboard"
          >
            <BarChart3 size={19} />
          </button>
        </div>
      </div>
      <div className="avatar-row">
        {view.players.map((p, i) => {
          const bubble = [...view.chat]
            .reverse()
            .find((c) => c.playerId === p.id && now - c.at < 3000);
          return (
            <div
              key={p.id}
              className={`player-tile ${p.id === view.insiderId ? "is-insider" : ""}`}
            >
              <div className="avatar-wrap">
                <GameAvatar view={view} player={p} index={i} now={now} small />
                {bubble && <span className="chat-bubble">{bubble.text}</span>}
                {p.submitted && (
                  <span className="locked-badge" aria-label="Locked in">
                    <Check size={10} />
                  </span>
                )}
              </div>
              <strong>{p.id === view.me ? "You" : p.name}</strong>
              <Credit trust={p.trust} />
              <small>
                {!p.connected
                  ? "Reconnecting"
                  : p.id === view.insiderId
                    ? "INSIDER"
                    : `Trust ${p.trust}`}
              </small>
            </div>
          );
        })}
      </div>
      {view.phase !== "REVEAL" && (
        <div className="news-card">
          <div className="spread">
            <span className="micro">
              MARKET WIRE <span className="muted">/ {view.news!.company}</span>
            </span>
            <span
              className={`sentiment ${view.news!.sentiment === "UP" ? "positive" : "negative"}`}
            >
              {view.news!.sentiment === "UP" ? "↗ GOOD NEWS" : "↘ BAD NEWS"}
            </span>
          </div>
          <h2>{view.news!.headline}</h2>
          <p>
            {view.news!.description}{" "}
            <span>• Headlines match the market 60% of the time.</span>
          </p>
        </div>
      )}
      {view.phase === "TIP" &&
        (isInsider ? (
          <TipPanel
            key={`${view.gameId}:${view.round}:tip`}
            view={view}
            connection={connection}
          />
        ) : (
          <div className="decision-panel waiting">
            <div className="waiting-icon">
              <Eye size={30} />
            </div>
            <span className="eyebrow">INFORMATION IS POWER</span>
            <h2>{copy("wait", view.round, { name: insider.name })}</h2>
            <p>
              They know where the stock goes.
              <br />
              You’ll need to figure out whose side they’re on.
            </p>
            <span className="waiting-dots" aria-label="Waiting for the tip">
              •••
            </span>
          </div>
        ))}
      {view.phase === "GUESS" &&
        (isInsider ? (
          <div className="decision-panel waiting insider-wait">
            <span className="eyebrow">YOUR TIP IS ON THE RECORD</span>
            <h2
              className={view.tip!.direction === "UP" ? "positive" : "negative"}
            >
              {view.tip!.direction === "UP" ? "BUY ↗" : "SELL ↘"}
              {view.tip!.strong ? " · STRONG" : ""}
            </h2>
            <p>
              {view.secrets?.role === "PARTNER"
                ? "Help them get it right."
                : "Make them second-guess themselves."}
              <br />
              Use quick-chat while the floor decides.
            </p>
            <p className="note">
              {view.players.filter((p) => p.submitted).length} /{" "}
              {view.players.length - 1} guesses locked in
            </p>
            <div className="submission-progress">
              {view.players
                .filter((p) => p.id !== view.me)
                .map((p) => (
                  <span key={p.id} className={p.submitted ? "done" : ""} />
                ))}
            </div>
          </div>
        ) : (
          <GuessPanel
            key={`${view.gameId}:${view.round}:guess`}
            view={view}
            connection={connection}
          />
        ))}
      {view.phase === "REVEAL" && (
        <Reveal view={view} now={now} connection={connection} />
      )}
      <div className="game-bottom">
        <span className="note">
          {view.phase === "REVEAL"
            ? "Next round starts automatically."
            : isInsider
              ? "Your motive is private. Your tip is public."
              : "Read the person. Then make your call."}
        </span>
        <button
          className="secondary chat-toggle"
          onClick={() => setChat(true)}
          disabled={!connection.ready}
        >
          <MessageCircle size={16} /> Quick-chat
        </button>
      </div>
      {view.analystNote && !noteDismissed && (
        <div className="analyst-note" role="status">
          <strong>Analyst note</strong>
          <span>Bots have habits. Watch how they talk when they tip.</span>
          <button
            onClick={() => setNoteDismissed(true)}
            aria-label="Dismiss analyst note"
          >
            ×
          </button>
        </div>
      )}
      {drawer && (
        <Scoreboard view={view} now={now} onClose={() => setDrawer(false)} />
      )}
      {chat && (
        <Modal title="Work the room." onClose={() => setChat(false)}>
          <p className="note">
            Choose your words carefully. One message every two seconds.
          </p>
          {connection.error && (
            <p className="negative" role="alert">
              {connection.error}
            </p>
          )}
          <div className="phrase-grid">
            {(
              Object.entries(PHRASES) as [
                keyof typeof PHRASES,
                (typeof PHRASES)[keyof typeof PHRASES],
              ][]
            )
              .filter(
                ([, p]) =>
                  p.audience === "all" ||
                  (p.audience === "insider") === isInsider,
              )
              .map(([id, p]) => (
                <button
                  className="secondary"
                  key={id}
                  disabled={disabled}
                  onClick={async () => {
                    if (await connection.act({ type: "chat", phraseId: id }))
                      setChat(false);
                  }}
                >
                  {p.text}
                </button>
              ))}
          </div>
        </Modal>
      )}
    </section>
  );
}

function TipPanel({ view, connection }: Omit<GameProps, "now">) {
  const [peek, setPeek] = useState(false),
    [showTable, setShowTable] = useState(false),
    [direction, setDirection] = useState<Direction | null>(null),
    [strong, setStrong] = useState(false);
  useEffect(() => {
    const hide = () => setPeek(false);
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("blur", hide);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  const disabled = !connection.ready || connection.busy,
    secrets = view.secrets!,
    visible = peek && connection.ready;
  return (
    <div className="decision-panel tip-panel">
      <div className="spread">
        <span className="micro">YOU ARE THE INSIDER</span>
        <button className="text-button" onClick={() => setShowTable(true)}>
          Show the table <ChevronRight size={14} />
        </button>
      </div>
      <button
        className={`secret-card ${visible ? "revealed" : ""}`}
        disabled={disabled}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setPeek(true);
        }}
        onPointerUp={() => setPeek(false)}
        onPointerCancel={() => setPeek(false)}
        onLostPointerCapture={() => setPeek(false)}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            setPeek(true);
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") setPeek(false);
        }}
        onBlur={() => setPeek(false)}
        aria-label="Hold to peek at your secrets"
      >
        <LockKeyhole size={18} />
        {visible ? (
          <span>
            <strong>
              {secrets.role} · STOCK {secrets.direction}
            </strong>
            <small>
              {secrets.accurate
                ? "Headline is accurate"
                : "Headline is misleading"}{" "}
              ·{" "}
              {secrets.role === "PARTNER"
                ? "Earn when others guess right"
                : "Earn when others guess wrong"}
            </small>
          </span>
        ) : (
          <span>
            <strong>Hold to peek at your secrets</strong>
            <small>Keep this to yourself. Release to hide.</small>
          </span>
        )}
      </button>
      <div className="choice-row">
        <button
          className={`direction-button up ${direction === "UP" ? "selected" : ""}`}
          aria-pressed={direction === "UP"}
          onClick={() => setDirection("UP")}
          disabled={disabled}
        >
          <ArrowUpRight /> BUY <small>Tip UP</small>
        </button>
        <button
          className={`direction-button down ${direction === "DOWN" ? "selected" : ""}`}
          aria-pressed={direction === "DOWN"}
          onClick={() => setDirection("DOWN")}
          disabled={disabled}
        >
          <ArrowDownRight /> SELL <small>Tip DOWN</small>
        </button>
      </div>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={strong}
          disabled={disabled}
          onChange={(e) => setStrong(e.target.checked)}
        />
        <span>
          <strong>Make it a Strong tip</strong>
          <small>For each guesser: +100 on success, −100 on failure.</small>
        </span>
      </label>
      <button
        className="primary full"
        disabled={disabled || !direction}
        onClick={() =>
          direction && void connection.act({ type: "tip", direction, strong })
        }
      >
        {connection.busy ? "Submitting…" : copy("tip", view.round)}
        <ArrowUpRight size={18} />
      </button>
      {showTable && (
        <Modal title="Show the table" onClose={() => setShowTable(false)}>
          <div className="decoy">
            <Shield size={50} />
            <span>OFFICIAL ROLE CARD</span>
            <strong>PARTNER</strong>
            <p>I’m on your side.</p>
          </div>
          <p className="note">
            Every Insider can display this card. It proves nothing.
          </p>
        </Modal>
      )}
    </div>
  );
}
function GuessPanel({ view, connection }: Omit<GameProps, "now">) {
  const [direction, setDirection] = useState<Direction | null>(
      view.ownGuess?.direction ?? null,
    ),
    [stake, setStake] = useState<Stake>(view.ownGuess?.stake ?? 100),
    [callShark, setCallShark] = useState(view.ownGuess?.callShark ?? false);
  const me = view.players.find((p) => p.id === view.me)!,
    insider = view.players.find((p) => p.id === view.insiderId)!,
    locked = Boolean(view.ownGuess),
    disabled = !connection.ready || connection.busy || locked;
  return (
    <div className="decision-panel guess-panel">
      <div className="official-tip">
        <div>
          <span className="micro">{insider.name.toUpperCase()} SAYS</span>
          <strong
            className={view.tip!.direction === "UP" ? "positive" : "negative"}
          >
            {view.tip!.direction === "UP" ? "BUY ↗" : "SELL ↘"}{" "}
            {view.tip!.strong && <small>STRONG</small>}
          </strong>
        </div>
        <span className="trust-label">
          Trust <b>{insider.trust}</b>
        </span>
      </div>
      {locked ? (
        <div className="locked-message" role="status">
          <Check size={28} />
          <strong>On the record.</strong>
          <p>
            {view.ownGuess!.direction} · {view.ownGuess!.stake} coins
            {view.ownGuess!.callShark ? " · Shark called" : ""}
          </p>
          <span className="note">
            Your pick stays private until the reveal.
          </span>
        </div>
      ) : (
        <>
          <div className="choice-row">
            <button
              className={`direction-button up ${direction === "UP" ? "selected" : ""}`}
              aria-pressed={direction === "UP"}
              onClick={() => setDirection("UP")}
              disabled={disabled}
            >
              <ArrowUpRight /> UP
            </button>
            <button
              className={`direction-button down ${direction === "DOWN" ? "selected" : ""}`}
              aria-pressed={direction === "DOWN"}
              onClick={() => setDirection("DOWN")}
              disabled={disabled}
            >
              <ArrowDownRight /> DOWN
            </button>
          </div>
          <div className="stake-row" aria-label="Choose your stake">
            {([100, 200, 300] as const).map((s) => (
              <button
                key={s}
                aria-pressed={stake === s}
                disabled={disabled || (s === 300 && me.allInUsed)}
                onClick={() => setStake(s)}
              >
                <span>
                  {s === 100
                    ? "Bet"
                    : s === 200
                      ? "Raise"
                      : me.allInUsed
                        ? "Used"
                        : copy("bigBet", view.round)}
                </span>
                <strong>{s}</strong>
                {s === 300 && <small>once / game</small>}
              </button>
            ))}
          </div>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={callShark}
              disabled={disabled}
              onChange={(e) => setCallShark(e.target.checked)}
            />
            <span>
              <strong>Call Shark 🦈</strong>
              <small>Right: +100 · Wrong: −150. Separate from your pick.</small>
            </span>
          </label>
          <button
            className="primary full"
            disabled={disabled || !direction}
            onClick={() =>
              direction &&
              void connection.act({
                type: "guess",
                direction,
                stake,
                callShark,
              })
            }
          >
            {connection.busy
              ? copy("locking", view.round)
              : copy("lock", view.round)}
            <LockKeyhole size={16} />
          </button>
        </>
      )}
    </div>
  );
}
function Reveal({ view, now, connection }: GameProps) {
  const [math, setMath] = useState(false);
  const r = view.result!,
    insider = view.players.find((p) => p.id === r.insiderId)!;
  const elapsed = now - r.revealedAt;
  const fooled = r.outcomes.filter((o) => o.guess && !o.correct).length;
  const helped = r.outcomes.filter((o) => o.guess && o.correct).length;
  const moment =
    r.role === "PARTNER"
      ? copy("partner", r.round, { name: insider.name, count: helped })
      : fooled
        ? copy("fooled", r.round, { name: insider.name, count: fooled })
        : copy("uncaught", r.round);
  return (
    <div className="reveal-panel comedy-reveal">
      <span className="micro">WHAT ACTUALLY HAPPENED · {r.news.company}</span>
      <h2 className="punchline">{r.news.punchlines[r.direction]}</h2>
      <p className="market-outcome">
        {r.direction === "UP" ? "↗ MARKET UP" : "↘ MARKET DOWN"}
      </p>
      <div
        className={`reveal-step ${elapsed >= 800 ? "visible" : ""}`}
        aria-hidden={elapsed < 800}
      >
        <h3 className="big-moment">{moment}</h3>
        <p>
          {insider.name} was {r.role === "SHARK" ? "a Shark 🦈" : "a Partner ◇"}
          .
        </p>
        <CrashTicker view={view} now={now} />
      </div>
      <div className="reveal-totals reveal-step visible">
        {view.players.map((p, i) => (
          <div key={p.id} className="reveal-total">
            <GameAvatar view={view} player={p} index={i} now={now} small />
            <div>
              <strong>{p.id === view.me ? "You" : p.name}</strong>
              <Credit trust={p.trust} />
            </div>
            <b>
              {number(p.coins)} <small>coins</small>
            </b>
          </div>
        ))}
        {r.outcomes
          .filter((o) => o.satOut)
          .map((o, i) => (
            <p className="note" key={o.playerId}>
              {copy("timeout", r.round + i, {
                name: view.players.find((p) => p.id === o.playerId)!.name,
              })}
            </p>
          ))}
      </div>
      <div
        className={`breaking reveal-step ${elapsed >= NARRATION_VISIBLE_MS ? "visible" : ""}`}
      >
        <span>BARB BEAR · BREAKING NEWS</span>
        {elapsed >= NARRATION_VISIBLE_MS && (
          <PublishedNarration text={r.narration} />
        )}
      </div>
      <Reactions connection={connection} />
      <button className="text-button" onClick={() => setMath(true)}>
        {copy("math", 0)}
      </button>
      {math && (
        <Scoreboard view={view} now={now} onClose={() => setMath(false)} math />
      )}
    </div>
  );
}
// Mount at publication time and preserve the text even if a delayed snapshot arrives.
function PublishedNarration({ text }: { text: string }) {
  const [published] = useState(text);
  return <p>{published}</p>;
}
function Scoreboard({
  view,
  now,
  onClose,
  math = false,
}: {
  view: PlayerView;
  onClose: () => void;
  math?: boolean;
  now: number;
}) {
  return (
    <Modal title="The trust exchange." onClose={onClose} wide>
      <p className="note">
        Trust records past behavior. It does not predict this round’s hidden
        role.
      </p>
      <div className="scoreboard-list">
        {[...view.players]
          .sort((a, b) => b.coins - a.coins)
          .map((p, i) => (
            <div className="score-entry" key={p.id}>
              <div className="spread">
                <div className="inline">
                  <GameAvatar
                    view={view}
                    player={p}
                    index={i}
                    now={now}
                    small
                  />
                  <strong>
                    {p.name}
                    {p.id === view.me ? " (you)" : ""}
                    <Credit trust={p.trust} />
                  </strong>
                </div>
                <strong>
                  {number(p.coins)} <small>coins</small>
                </strong>
              </div>
              <div className="spread">
                <span className={p.trust >= 100 ? "positive" : "negative"}>
                  Trust {p.trust} · {signed(p.trust - 100)}% since open
                </span>
                <span className="note">
                  All In {p.allInUsed ? "used" : "available"}
                </span>
              </div>
              <Sparkline
                values={p.trustHistory}
                label={`${p.name} trust history`}
              />
              <p className="note">
                {p.record.length
                  ? p.record.join(" → ")
                  : copy("noRecord", view.round)}
              </p>
            </div>
          ))}
      </div>
      <details>
        <summary>Chat history</summary>
        {view.chat.length ? (
          view.chat.map((c) => (
            <p className="note" key={c.id}>
              <strong>
                {view.players.find((p) => p.id === c.playerId)?.name}:
              </strong>{" "}
              {c.text}
            </p>
          ))
        ) : (
          <p className="note">{copy("emptyChat", view.round)}</p>
        )}
      </details>
      <details open={math}>
        <summary>Round receipts</summary>
        {view.history.map((r) => (
          <div key={r.round} className="receipt">
            <strong>
              Round {r.round} · {r.news.company}
            </strong>
            <p>
              {r.role} · {r.direction} · {r.tip.strong ? "Strong " : ""}
              {r.tip.direction === r.direction ? "truth" : "lie"}
            </p>
            {r.outcomes.map((o) => (
              <p key={o.playerId}>
                {view.players.find((p) => p.id === o.playerId)?.name}: pick{" "}
                {signed(o.directionDelta)}, calls {signed(o.callDelta)}, Insider{" "}
                {signed(o.insiderDelta)} = <b>{signed(o.delta)}</b>
              </p>
            ))}
          </div>
        ))}
      </details>
    </Modal>
  );
}
function Final({ view, connection, now }: GameProps) {
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    if (!view.spectating) save("insider:hasPlayed", "true");
  }, [view.spectating]);
  const sorted = [...view.players].sort(
    (a, b) =>
      b.coins - a.coins ||
      view.history.filter(
        (r) =>
          r.role === "SHARK" &&
          r.outcomes.some((o) => o.playerId === b.id && o.guess?.callShark),
      ).length -
        view.history.filter(
          (r) =>
            r.role === "SHARK" &&
            r.outcomes.some((o) => o.playerId === a.id && o.guess?.callShark),
        ).length,
  );
  const names = view.winners
    .map((id) => view.players.find((p) => p.id === id)!.name)
    .join(" & ");
  return (
    <section className="final-page">
      <div className="final-heading">
        <Trophy size={38} />
        <p className="eyebrow">THE CLOSING BELL</p>
        <h1>
          {names}
          <br />
          <em>
            {view.winners.length > 1 ? "share the floor." : "takes the market."}
          </em>
        </h1>
        <p className="micro">BRAD BULL · CLOSING BELL REPORT</p>
        <p>{view.closingReport}</p>
      </div>
      <div className="final-grid">
        <div className="panel">
          <h2>Closing positions</h2>
          {sorted.map((p, i) => (
            <div className="standing" key={p.id}>
              <span className="rank">
                {view.winners.includes(p.id)
                  ? "01"
                  : String(i + 1).padStart(2, "0")}
              </span>
              <GameAvatar view={view} player={p} index={i} now={now} small />
              <strong>
                {p.name}
                {p.id === view.me ? " (you)" : ""}
                <Credit trust={p.trust} />
              </strong>
              <b>
                {number(p.coins)}
                <small> coins</small>
              </b>
            </div>
          ))}
          <button className="text-button" onClick={() => setDrawer(true)}>
            Inspect the receipts <ChevronRight size={16} />
          </button>
        </div>
        <div className="awards">
          {view.awards.map((a) => (
            <div className="award-card" key={a.title}>
              <TrendingUp size={19} />
              <span className="micro">{a.title}</span>
              <strong>
                {a.playerIds
                  .map((id) => view.players.find((p) => p.id === id)!.name)
                  .join(" & ")}
              </strong>
              <small>{a.description}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="trust-charts">
        {view.players.map((p) => (
          <div className="panel" key={p.id}>
            <div className="spread">
              <strong>{p.name}</strong>
              <Credit trust={p.trust} />
              <span className={p.trust >= 100 ? "positive" : "negative"}>
                {p.trust}
              </span>
            </div>
            <Sparkline
              values={p.trustHistory}
              label={`${p.name} closing trust chart`}
            />
            <p className="note">{p.record.join(" → ")}</p>
          </div>
        ))}
      </div>
      {view.players.some((p) => p.bot) && (
        <div className="panel bot-lessons">
          <span className="eyebrow">NOW YOU KNOW WHAT TO WATCH FOR</span>
          {view.players
            .filter((p) => p.bot)
            .map((p) => (
              <p key={p.id}>
                <strong>{p.name}:</strong> {BOTS[p.bot!].tell}
              </p>
            ))}
        </div>
      )}
      <div className="final-actions">
        <button
          className="primary"
          disabled={
            !connection.ready || connection.busy || view.me !== view.hostId
          }
          onClick={() => void connection.act({ type: "replay" })}
        >
          {view.me === view.hostId
            ? view.spectating
              ? "Watch another match"
              : "Trade another round"
            : "Waiting for the host"}
          <ArrowUpRight size={18} />
        </button>
        <button
          className="secondary"
          disabled={connection.busy}
          onClick={() => void connection.leave()}
        >
          Back home
        </button>
      </div>
      {drawer && (
        <Scoreboard view={view} now={now} onClose={() => setDrawer(false)} />
      )}
    </section>
  );
}

export function Watch({ view, connection, now }: GameProps) {
  const [drawer, setDrawer] = useState(false);
  if (view.phase === "FINAL")
    return <Final view={view} connection={connection} now={now} />;
  const insider = view.players.find((p) => p.id === view.insiderId)!;
  return (
    <section className="watch-game">
      <div className="spread">
        <div>
          <p className="eyebrow">BOT SIMULATION · SPECTATING</p>
          <h1>Watch the trading floor.</h1>
        </div>
        <button className="secondary" onClick={() => setDrawer(true)}>
          Scoreboard
        </button>
      </div>
      <p>
        Round {view.round} / {view.totalRounds} ·{" "}
        {view.phase === "TIP"
          ? "Waiting for the Insider’s tip"
          : view.phase === "GUESS"
            ? "Bots are making their reads"
            : "The reveal"}{" "}
        · {secondsRemaining(view.phaseStartedAt, view.phaseEndsAt, now)}s
      </p>
      {view.phase !== "REVEAL" && (
        <div className="watch-roster">
          {view.players.map((p, i) => (
            <div className="panel" key={p.id}>
              <GameAvatar view={view} player={p} index={i} now={now} />
              <strong>{p.name}</strong>
              <Credit trust={p.trust} />
              <span>
                {number(p.coins)} coins · Trust {p.trust}
              </span>
              <small>
                {p.id === view.insiderId
                  ? "INSIDER"
                  : p.submitted
                    ? "Read locked in"
                    : "Watching the market"}
              </small>
            </div>
          ))}
        </div>
      )}
      {view.phase === "REVEAL" ? (
        <Reveal view={view} now={now} connection={connection} />
      ) : (
        <div className="panel">
          <p className="eyebrow">
            {view.news!.company} ·{" "}
            {view.news!.sentiment === "UP" ? "GOOD NEWS ↗" : "BAD NEWS ↘"}
          </p>
          <h2>{view.news!.headline}</h2>
          <p>
            {view.phase === "TIP"
              ? copy("wait", view.round, { name: insider.name })
              : `${insider.name} says ${view.tip!.direction === "UP" ? "BUY" : "SELL"}${view.tip!.strong ? " — Strong tip" : ""}. ${view.players.filter((p) => p.submitted).length} of ${view.players.length - 1} reads locked in.`}
          </p>
        </div>
      )}
      <div className="panel">
        <h2>Floor chatter</h2>
        {view.chat
          .filter((c) => c.round === view.round)
          .slice(-8)
          .map((c) => (
            <p key={c.id}>
              <strong>
                {view.players.find((p) => p.id === c.playerId)?.name}:
              </strong>{" "}
              {c.text}
            </p>
          ))}
        {!view.chat.some((c) => c.round === view.round) && (
          <p className="note">{copy("emptyChat", view.round)}</p>
        )}
      </div>
      <button
        className="secondary"
        onClick={() => void connection.leave()}
        disabled={!connection.ready || connection.busy}
      >
        Stop watching
      </button>
      {drawer && (
        <Scoreboard view={view} now={now} onClose={() => setDrawer(false)} />
      )}
    </section>
  );
}
