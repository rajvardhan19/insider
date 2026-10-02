import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import "./styles.css";

function App() {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const socket = io();
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    return () => {
      socket.disconnect();
    };
  }, []);
  return (
    <main className="shell">
      <header>
        <a className="wordmark" href="/">
          IN<span>S</span>IDER<span className="dot">.</span>
        </a>
        <span className="connection">
          {connected ? "● Exchange connected" : "○ Connecting to exchange"}
        </span>
      </header>
      <section className="hero">
        <p className="eyebrow">THE FRIENDSHIP MARKET IS OPEN</p>
        <h1>
          Trust is your
          <br />
          <em>riskiest investment.</em>
        </h1>
        <p className="description">
          One player knows the market. Everyone has a motive.
          <br />A game of tips, trust, and beautifully bad decisions.
        </p>
        <div className="actions">
          <button disabled>
            Play solo vs bots <span>↗</span>
          </button>
          <button disabled>
            Create a room <span>＋</span>
          </button>
          <button disabled>
            Join a room <span>→</span>
          </button>
        </div>
        <p className="note">
          2–5 players · No accounts · Just questionable advice
        </p>
      </section>
      <footer>
        <span>FICTIONAL STOCKS. REAL SUSPICIONS.</span>
        <span>Foundation build · Game controls coming next</span>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
