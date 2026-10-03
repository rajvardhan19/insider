import { Component, useEffect, useState, useRef, type ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Moon,
  Sun,
  Volume2,
  VolumeX,
  RefreshCw,
  Settings,
} from "lucide-react";
import { useConnection, readSaved, save } from "./net/connection";
import { Home } from "./screens/Home";
import { Lobby } from "./screens/Lobby";
import { Game, Watch } from "./screens/Game";
import { Modal } from "./components/Common";

import { COMMENTARY_LEVELS, type CommentaryLevel } from "@insider/shared";
import { CaptionBar, ReactionSky } from "./components/Comedy";
let audio: AudioContext | undefined;
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    /* Sound is optional. */
  }
}
function tone(kind: "lock" | "reveal" | "win" | "crash") {
  if (!audio || audio.state !== "running") return;
  if (kind === "crash") {
    [294, 277, 262, 196].forEach((pitch, i) => {
      const osc = audio!.createOscillator(),
        gain = audio!.createGain(),
        at = audio!.currentTime + i * 0.25;
      osc.type = "triangle";
      osc.frequency.setValueAtTime(pitch, at);
      osc.frequency.exponentialRampToValueAtTime(pitch * 0.8, at + 0.3);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.06, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);
      osc.connect(gain);
      gain.connect(audio!.destination);
      osc.start(at);
      osc.stop(at + 0.34);
    });
    return;
  }
  const pitches =
    kind === "win" ? [523, 659, 784] : kind === "reveal" ? [330, 494] : [660];
  pitches.forEach((pitch, i) => {
    const osc = audio!.createOscillator(),
      gain = audio!.createGain(),
      at = audio!.currentTime + i * 0.1;
    osc.type = "sine";
    osc.frequency.value = pitch;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.06, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    osc.connect(gain);
    gain.connect(audio!.destination);
    osc.start(at);
    osc.stop(at + 0.22);
  });
}
function App() {
  const connection = useConnection(),
    view = connection.view;
  const [settings, setSettings] = useState(false);
  const [commentaryLevel, setCommentaryLevel] = useState<CommentaryLevel>(
    () => {
      const saved = readSaved("insider:commentary", "NORMAL");
      return COMMENTARY_LEVELS.includes(saved as CommentaryLevel)
        ? (saved as CommentaryLevel)
        : "NORMAL";
    },
  );
  useEffect(
    () => save("insider:commentary", commentaryLevel),
    [commentaryLevel],
  );
  const lastSound = useRef("");
  const [soloName, setSoloName] = useState("");
  const [help, setHelp] = useState<"read" | "solo" | null>(null),
    [theme, setTheme] = useState(() =>
      readSaved(
        "insider:theme",
        matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
      ),
    ),
    [muted, setMuted] = useState(() => readSaved("insider:muted") === "true"),
    [tick, setTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 200);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    save("insider:theme", theme);
  }, [theme]);
  useEffect(() => save("insider:muted", String(muted)), [muted]);
  useEffect(() => {
    const key = `${view?.gameId}:${view?.round}:${view?.phase}:${Boolean(view?.ownGuess)}`;
    if (lastSound.current === key) return;
    lastSound.current = key;
    if (!muted && view) {
      if (view.phase === "FINAL") tone("win");
      else if (
        view.phase === "REVEAL" &&
        Date.now() + connection.offset - view.phaseStartedAt < 2000
      )
        tone(view.result && view.result.trustDelta <= -30 ? "crash" : "reveal");
      else if (view.ownGuess) tone("lock");
    }
  }, [view?.phase, Boolean(view?.ownGuess), view?.round, view?.gameId, muted]);
  const now = tick + connection.offset;
  async function finishTutorial() {
    const solo = help === "solo";
    save("insider:tutorial", "true");
    setHelp(null);
    if (solo)
      await connection.enter({
        type: "solo",
        name: soloName,
        firstGame: !readSaved("insider:hasPlayed"),
      });
  }
  return (
    <main
      className={`shell ${view && view.phase !== "LOBBY" ? "playing" : ""}`}
      onPointerDown={() => {
        if (!muted) unlockAudio();
      }}
      onKeyDown={() => {
        if (!muted) unlockAudio();
      }}
    >
      <header>
        <button
          className="wordmark"
          onClick={() => {
            if (view) void connection.leave();
          }}
          aria-label="Insider home"
        >
          IN<span>S</span>IDER<span className="dot">.</span>
        </button>
        <div className="header-actions">
          <button
            className="icon-button"
            onClick={() => setSettings(true)}
            aria-label="Settings"
          >
            <Settings size={18} />
          </button>
          <span
            className={`connection ${connection.connected ? "" : "negative"}`}
          >
            <span
              className={`status-dot ${connection.connected ? "" : "offline"}`}
            />
            {view
              ? `ROOM ${view.code}`
              : connection.connected
                ? "EXCHANGE OPEN"
                : "CONNECTING"}
          </span>
          <button
            className="icon-button help-button"
            onClick={() => setHelp("read")}
            aria-label="How to play"
          >
            <BookOpen size={18} />
            <span>How to play</span>
          </button>
          <button
            className="icon-button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            className="icon-button"
            onClick={() => setMuted(!muted)}
            aria-label={muted ? "Enable sound" : "Mute sound"}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>
      </header>
      {connection.error && (
        <div className="error-banner" role="alert">
          <span>{connection.error}</span>
          <button onClick={connection.reconnect}>
            <RefreshCw size={14} /> Reconnect
          </button>
          <button aria-label="Dismiss error" onClick={connection.dismissError}>
            ×
          </button>
        </div>
      )}
      {view && !connection.ready && !connection.error && (
        <div className="error-banner" role="status">
          Reconnecting to your seat. Your last accepted action is saved.
        </div>
      )}
      {!view ? (
        <Home
          connection={connection}
          onHelp={(name) => {
            setSoloName(name);
            setHelp("solo");
          }}
        />
      ) : view.phase === "LOBBY" ? (
        <Lobby view={view} connection={connection} />
      ) : view.spectating ? (
        <Watch
          key={view.gameId}
          view={view}
          connection={connection}
          now={now}
        />
      ) : (
        <Game key={view.gameId} view={view} connection={connection} now={now} />
      )}
      {view?.gameId && (
        <>
          <CaptionBar
            key={view.gameId}
            view={view}
            now={now}
            level={commentaryLevel}
          />
          <ReactionSky view={view} now={now} />
        </>
      )}
      {settings && (
        <Modal
          title="Your trading preferences"
          onClose={() => setSettings(false)}
        >
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={commentaryLevel !== "OFF"}
              onChange={(e) =>
                setCommentaryLevel(e.target.checked ? "NORMAL" : "OFF")
              }
            />{" "}
            Commentary on/off
          </label>
          <fieldset className="commentary-settings">
            <legend>Commentary level</legend>
            {COMMENTARY_LEVELS.map((level) => (
              <label key={level}>
                <input
                  type="radio"
                  name="commentary-level"
                  value={level}
                  checked={commentaryLevel === level}
                  onChange={() => setCommentaryLevel(level)}
                />
                {level}
              </label>
            ))}
          </fieldset>
          <p className="note">
            Big Moments: major events. Normal: major events and occasional
            banter, at most every 5 seconds. Chatty: all banter, every 2–3
            seconds. Off: the reveal punchline and news reports still appear.
          </p>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={muted}
              onChange={(e) => setMuted(e.target.checked)}
            />{" "}
            Mute sounds
          </label>
        </Modal>
      )}
      <footer>
        <span>FICTIONAL STOCKS. REAL SUSPICIONS.</span>
        <span>
          {view ? (
            <button
              className="text-button"
              disabled={connection.busy}
              onClick={() => void connection.leave()}
            >
              Leave room
            </button>
          ) : (
            "A party game for people with trust issues."
          )}
        </span>
      </footer>
      {help && (
        <Modal
          title="A little insider knowledge."
          onClose={() => {
            if (help === "solo") void finishTutorial();
            else setHelp(null);
          }}
          wide
        >
          <div className="tutorial-steps">
            <div>
              <b>01</b>
              <h3>One player knows the truth.</h3>
              <p>
                The Insider sees whether the stock goes UP or DOWN. A{" "}
                <strong>Partner</strong> earns when others guess right. A{" "}
                <strong>Shark</strong> earns when they guess wrong. Either can
                tell the truth or lie.
              </p>
            </div>
            <div>
              <b>02</b>
              <h3>Read the tip. Read the person.</h3>
              <p>
                BUY means UP. SELL means DOWN. Headlines are right 60% of the
                time. Secretly pick a direction and stake 100, 200, or 300
                coins. The 300 “All In” bet is available once per game.
              </p>
            </div>
            <div>
              <b>03</b>
              <h3>Everyone shows their hand.</h3>
              <p>
                A right pick earns your stake; a wrong pick loses it. Call Shark
                for a separate +100 if right or −150 if wrong. Most coins at the
                closing bell wins.
              </p>
            </div>
          </div>
          <div className="tutorial-comedy">
            <h3>The drama is cosmetic. The receipts are real.</h3>
            <p>
              Reveals lead with what actually happened. Tap “See the math” for
              every coin change. Throw 🍅, 😂 or 🦈 during reveals; everyone
              sees your reaction, with a short cooldown.
            </p>
            <p>
              A revealed Shark grows fins. Losing a 300-coin All In earns a
              dramatic BANKRUPT badge through the next round. It does not mean
              zero coins, change your balance, or eliminate you. Large trust
              falls get a sad trombone; mute it in Settings.
            </p>
            <p>
              Credit ratings describe past trust: AAA: Saint (140+), A: Probably
              Fine (110–139), B: Unrated Mystery (90–109), C: Junk Bond (60–89),
              Known Fraud (below 60). They never reveal this round’s motive.
            </p>
            <p>
              Brad Bull and Barb Bear comment only on public events. Choose Off,
              Big Moments, Normal or Chatty in Settings at any time. Your
              preference stays in this browser.
            </p>
          </div>
          <details>
            <summary>The fine print: Insider payouts & trust</summary>
            <p>
              A normal Insider earns +50 for each role-success. A Strong tip
              makes each success +100 and each failure −100. Correct Shark calls
              take 100 from the Insider; wrong calls pay the bank.
            </p>
            <p>
              Trust records truth (+15) or lies (−20); Strong doubles that
              change. Being caught as a Shark costs another 10; a falsely
              accused Partner gains 10. Trust never falls below 10.
            </p>
            <p>
              Secret roles are independent 50/50 draws. The Show the Table card
              always says Partner, for anyone. It proves nothing.
            </p>
            <p>
              A missed tip becomes a random normal tip. A missed guess sits out
              for no gain or loss. Debt is allowed; nobody is eliminated. Tied
              coin totals use correct Shark calls, then share the win.
            </p>
          </details>
          {view && (
            <p className="note">
              The room timer keeps running while this guide is open.
            </p>
          )}
          <button
            className="primary full"
            onClick={() => void finishTutorial()}
          >
            {help === "solo" ? "Got it. Let’s play." : "Back to the floor"}
            <ArrowRight size={18} />
          </button>
          {help === "solo" && (
            <button
              className="text-button full"
              onClick={() => void finishTutorial()}
            >
              Skip introduction
            </button>
          )}
        </Modal>
      )}
    </main>
  );
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="shell">
        <h1>The floor needs a refresh.</h1>
        <p>Your seat can be recovered from this room link.</p>
        <button className="primary" onClick={() => location.reload()}>
          Reconnect
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
export default function Root() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
