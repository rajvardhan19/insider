import { Component, useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Moon,
  Sun,
  Volume2,
  VolumeX,
  RefreshCw,
} from "lucide-react";
import { useConnection, readSaved, save } from "./net/connection";
import { Home } from "./screens/Home";
import { Lobby } from "./screens/Lobby";
import { Game } from "./screens/Game";
import { Modal } from "./components/Common";

let audio: AudioContext | undefined;
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    /* Sound is optional. */
  }
}
function tone(kind: "lock" | "reveal" | "win") {
  if (!audio || audio.state !== "running") return;
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
    if (!muted) {
      if (view?.phase === "FINAL") tone("win");
      else if (view?.phase === "REVEAL") tone("reveal");
      else if (view?.ownGuess) tone("lock");
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
        name: readSaved("insider:name", "Trader"),
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
        <Home connection={connection} onHelp={() => setHelp("solo")} />
      ) : view.phase === "LOBBY" ? (
        <Lobby view={view} connection={connection} />
      ) : (
        <Game key={view.gameId} view={view} connection={connection} now={now} />
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
