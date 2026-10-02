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
  PHRASES,
  type Direction,
  type PlayerView,
  type Stake,
} from "@insider/shared";
import { Avatar, Modal, Sparkline, number, signed } from "../components/Common";
import { save, type Connection } from "../net/connection";
import { secondsRemaining } from "../net/clock";

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
    return <Final view={view} connection={connection} />;
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
                <Avatar player={p} index={i} small />
                {bubble && <span className="chat-bubble">{bubble.text}</span>}
                {p.submitted && (
                  <span className="locked-badge" aria-label="Locked in">
                    <Check size={10} />
                  </span>
                )}
              </div>
              <strong>{p.id === view.me ? "You" : p.name}</strong>
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
            <h2>{insider.name} knows something.</h2>
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
      {view.phase === "REVEAL" && <Reveal view={view} now={now} />}
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
      {drawer && <Scoreboard view={view} onClose={() => setDrawer(false)} />}
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
        {connection.busy ? "Submitting…" : "Put your tip on the record"}
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
                        : "All In"}
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
            {connection.busy ? "Locking in…" : "Lock in my read"}
            <LockKeyhole size={16} />
          </button>
        </>
      )}
    </div>
  );
}
function Reveal({ view, now }: { view: PlayerView; now: number }) {
  const r = view.result!,
    insider = view.players.find((p) => p.id === r.insiderId)!,
    elapsed = now - r.revealedAt,
    truth = r.tip.direction === r.direction;
  return (
    <div className="reveal-panel">
      <div className="market-reveal">
        <span className="micro">{r.news.company}</span>
        <h2 className={r.direction === "UP" ? "positive" : "negative"}>
          {r.direction === "UP" ? (
            <ArrowUpRight size={36} />
          ) : (
            <ArrowDownRight size={36} />
          )}{" "}
          MARKET {r.direction}
        </h2>
        <svg
          className={`market-chart ${r.direction === "UP" ? "positive" : "negative"}`}
          viewBox="0 0 320 42"
          role="img"
          aria-label={`The stock moved ${r.direction.toLowerCase()}`}
        >
          <path d="M0 35H320M0 8H320" opacity=".15" stroke="currentColor" />
          <path
            className="market-move"
            d={
              r.direction === "UP"
                ? "M0 34L34 30L58 33L92 20L127 27L161 13L190 21L220 9L260 15L292 5L320 2"
                : "M0 4L34 11L58 6L92 20L127 15L161 29L190 21L220 34L260 29L292 38L320 40"
            }
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        </svg>
        <span className="note">
          The headline was {r.accurate ? "accurate" : "misleading"}.
        </span>
      </div>
      <div
        className={`role-reveal reveal-step ${elapsed >= 800 ? "visible" : ""}`}
      >
        <span>{insider.name} was a</span>
        <strong className={r.role === "SHARK" ? "negative" : "positive"}>
          {r.role === "SHARK" ? "🦈 SHARK" : "◇ PARTNER"}
        </strong>
        <span>
          {truth ? "The tip was true." : "The tip was a lie."} Trust{" "}
          {signed(r.trustDelta)}
        </span>
      </div>
      <div
        className={`round-results reveal-step ${elapsed >= 1700 ? "visible" : ""}`}
      >
        {r.outcomes.map((o) => {
          const player = view.players.find((p) => p.id === o.playerId)!;
          return (
            <div
              className={`result-row ${o.playerId === view.me ? "you" : ""}`}
              key={o.playerId}
            >
              <strong>{o.playerId === view.me ? "You" : player.name}</strong>
              <span>
                {o.playerId === r.insiderId
                  ? "Insider"
                  : o.satOut
                    ? "Sat out"
                    : `${o.guess!.direction} · ${o.guess!.stake}${o.guess!.callShark ? " · 🦈" : ""}`}
              </span>
              <b className={o.delta >= 0 ? "positive" : "negative"}>
                {signed(o.delta)}
              </b>
            </div>
          );
        })}
      </div>
      <div
        className={`breaking reveal-step ${elapsed >= 2800 ? "visible" : ""}`}
      >
        <span>BREAKING</span>
        <p>{r.narration}</p>
      </div>
    </div>
  );
}
function Scoreboard({
  view,
  onClose,
}: {
  view: PlayerView;
  onClose: () => void;
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
                  <Avatar player={p} index={i} small />
                  <strong>
                    {p.name}
                    {p.id === view.me ? " (you)" : ""}
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
                  : "No Insider history yet."}
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
          <p className="note">The floor is quiet.</p>
        )}
      </details>
      <details>
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
function Final({ view, connection }: Omit<GameProps, "now">) {
  const [drawer, setDrawer] = useState(false);
  useEffect(() => save("insider:hasPlayed", "true"), []);
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
              <Avatar player={p} index={i} small />
              <strong>
                {p.name}
                {p.id === view.me ? " (you)" : ""}
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
            ? "Trade another round"
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
      {drawer && <Scoreboard view={view} onClose={() => setDrawer(false)} />}
    </section>
  );
}
