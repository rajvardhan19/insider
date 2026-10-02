import { useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Users,
  ScanLine,
  ShieldCheck,
  Radio,
} from "lucide-react";
import { nameSchema } from "@insider/shared";
import { Modal, Sparkline } from "../components/Common";
import {
  readSaved,
  save,
  roomFromPath,
  type Connection,
} from "../net/connection";

export function Home({
  connection,
  onHelp,
}: {
  connection: Connection;
  onHelp: () => void;
}) {
  const [panel, setPanel] = useState<"create" | "join" | null>(
      roomFromPath() ? "join" : null,
    ),
    [name, setName] = useState(readSaved("insider:name", "Trader")),
    [code, setCode] = useState(roomFromPath()),
    [formError, setFormError] = useState("");
  const disabled = !connection.ready || connection.busy;
  async function enter(type: "create" | "join" | "solo") {
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      setFormError("Choose a name with 1–12 letters, numbers or spaces.");
      return;
    }
    save("insider:name", parsed.data);
    setFormError("");
    if (type === "solo") {
      if (!readSaved("insider:tutorial")) {
        setPanel(null);
        onHelp();
        return;
      }
      await connection.enter({
        type,
        name: parsed.data,
        firstGame: !readSaved("insider:hasPlayed"),
      });
    } else if (type === "create")
      await connection.enter({ type, name: parsed.data });
    else if (/^[A-Z]{4}$/.test(code))
      await connection.enter({ type, name: parsed.data, code });
    else setFormError("Enter the four-letter room code.");
  }
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="status-dot" /> THE FRIENDSHIP MARKET IS OPEN
          </p>
          <h1>
            Trust is your
            <br />
            <em>
              riskiest
              <br className="desktop-break" /> investment.
            </em>
          </h1>
          <p className="description">
            One player knows the market. Everyone has a motive.
            <br />A game of tips, trust, and beautifully bad decisions.
          </p>
          <button
            className="primary hero-cta"
            disabled={disabled}
            onClick={() => void enter("solo")}
          >
            Play solo vs bots <ArrowUpRight size={22} />
          </button>
          <div className="room-actions">
            <button onClick={() => setPanel("create")} disabled={disabled}>
              <Users size={17} /> Create a room <ArrowRight size={17} />
            </button>
            <button onClick={() => setPanel("join")} disabled={disabled}>
              <ScanLine size={17} /> Join a room <ArrowRight size={17} />
            </button>
          </div>
          <p className="note">
            2–5 players <span>•</span> No accounts <span>•</span> Zero real
            money
          </p>
        </div>
        <div
          className="market-illustration"
          aria-label="Illustration of the fictional trust market"
        >
          <div className="market-card">
            <div className="spread">
              <span className="micro">THE TRUST EXCHANGE</span>
              <span className="live-label">
                <Radio size={12} /> LIVE
              </span>
            </div>
            <div className="market-title">
              A tip worth trusting<span>?</span>
            </div>
            <div className="spread quote">
              <strong>
                125<span>.00</span>
              </strong>
              <span className="positive">↗ +25.00%</span>
            </div>
            <Sparkline
              values={[
                100, 103, 91, 108, 102, 121, 115, 136, 128, 144, 120, 125,
              ]}
              label="Illustrative trust chart"
            />
            <div className="chart-axis">
              <span>OPEN</span>
              <span>RUMORS</span>
              <span>THE REVEAL</span>
            </div>
            <div className="sample-tip">
              <div className="avatar avatar-1 small">LL</div>
              <div>
                <strong>“Trust me on this one.”</strong>
                <span>Famous last words.</span>
              </div>
              <span className="tip-pill">BUY ↗</span>
            </div>
          </div>
          <div className="role-stamp">
            <span>CLASSIFIED</span>
            <strong>
              PARTNER
              <br />
              OR SHARK?
            </strong>
            <span>READ THE PERSON.</span>
          </div>
          <div className="illustration-caption">
            <ShieldCheck size={15} /> The only thing at stake is your
            reputation.
          </div>
        </div>
      </section>
      <section className="how-strip">
        <div>
          <span>01</span>
          <p>
            <strong>Get the inside scoop.</strong>One player knows what happens
            next.
          </p>
        </div>
        <div>
          <span>02</span>
          <p>
            <strong>Read their motive.</strong>Helping you, or setting you up?
          </p>
        </div>
        <div>
          <span>03</span>
          <p>
            <strong>Watch it all come out.</strong>Every tip. Every bluff. Every
            receipt.
          </p>
        </div>
      </section>
      {panel && (
        <Modal
          title={
            panel === "create"
              ? "Assemble your trading floor."
              : "Your seat is waiting."
          }
          onClose={() => setPanel(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void enter(panel);
            }}
          >
            <label>
              Your display name
              <input
                autoFocus
                value={name}
                maxLength={12}
                onChange={(e) => setName(e.target.value)}
                autoComplete="nickname"
                placeholder="e.g. Maya"
              />
            </label>
            {panel === "join" && (
              <label>
                Room code
                <input
                  className="code-input"
                  value={code}
                  maxLength={4}
                  onChange={(e) =>
                    setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))
                  }
                  placeholder="ABCD"
                  autoComplete="off"
                />
              </label>
            )}
            {(formError || connection.error) && (
              <p role="alert" className="negative">
                {formError || connection.error}
              </p>
            )}
            <button className="primary full" disabled={disabled}>
              {connection.busy
                ? "Connecting…"
                : panel === "create"
                  ? "Create room"
                  : "Take my seat"}
              <ArrowRight size={18} />
            </button>
            <p className="note">
              A name, a room code, and a healthy dose of suspicion.
            </p>
          </form>
        </Modal>
      )}
    </>
  );
}
