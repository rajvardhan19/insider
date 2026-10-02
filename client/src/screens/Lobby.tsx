import { useState } from "react";
import { ArrowRight, Check, Copy, Plus, Users, X } from "lucide-react";
import { BOTS, type Personality, type PlayerView } from "@insider/shared";
import { Avatar, Modal } from "../components/Common";
import type { Connection } from "../net/connection";

export function Lobby({
  view,
  connection,
}: {
  view: PlayerView;
  connection: Connection;
}) {
  const [bots, setBots] = useState(false),
    [copied, setCopied] = useState(false);
  const host = view.me === view.hostId,
    disabled = !connection.ready || connection.busy;
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/r/${view.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  const turns =
    view.players.length >= 4 ? 1 : view.players.length === 3 ? 2 : 3;
  return (
    <section className="lobby">
      <div className="page-heading">
        <p className="eyebrow">THE TRADING FLOOR</p>
        <h1>
          Good company.
          <br />
          <em>Questionable advice.</em>
        </h1>
        <p className="description">
          Invite your friends. Add a few familiar suspects. Then ring the bell.
        </p>
      </div>
      <div className="lobby-grid">
        <div className="panel">
          <div className="spread">
            <h2>
              <Users size={20} /> At the table
            </h2>
            <span className="micro">{view.players.length} / 5 SEATS</span>
          </div>
          <div className="seat-list">
            {view.players.map((p, i) => (
              <div className="seat" key={p.id}>
                <Avatar player={p} index={i} />
                <div>
                  <strong>
                    {p.name}
                    {p.id === view.me ? " (you)" : ""}
                  </strong>
                  <small>
                    {p.bot
                      ? "Bot · " + BOTS[p.bot].description
                      : p.id === view.hostId
                        ? "Host"
                        : p.connected
                          ? "Ready to trade"
                          : "Reconnecting…"}
                  </small>
                </div>
                {host && p.bot ? (
                  <button
                    className="icon-button"
                    aria-label={`Remove ${p.name}`}
                    disabled={disabled}
                    onClick={() =>
                      void connection.act({ type: "removeBot", playerId: p.id })
                    }
                  >
                    <X size={17} />
                  </button>
                ) : (
                  <span
                    className={`status-dot ${!p.connected ? "offline" : ""}`}
                  />
                )}
              </div>
            ))}
            {view.players.length < 5 && (
              <button
                className="empty-seat"
                disabled={!host || disabled}
                onClick={() => setBots(true)}
              >
                <Plus size={18} />{" "}
                {host ? "Add a bot to the table" : "Waiting for more players"}
              </button>
            )}
          </div>
        </div>
        <div className="lobby-side">
          <div className="panel invite">
            <span className="micro">YOUR PRIVATE ROOM</span>
            <strong className="room-code">{view.code}</strong>
            <button className="secondary full" onClick={() => void copy()}>
              {copied ? <Check size={17} /> : <Copy size={17} />}{" "}
              {copied ? "Link copied" : "Copy invite link"}
            </button>
          </div>
          <div className="panel">
            <label>Session length</label>
            <div className="segmented">
              {(["QUICK", "FULL"] as const).map((mode) => (
                <button
                  key={mode}
                  disabled={!host || disabled}
                  aria-pressed={view.mode === mode}
                  onClick={() => void connection.act({ type: "mode", mode })}
                >
                  {mode === "QUICK" ? "Quick game" : "Full game"}
                </button>
              ))}
            </div>
            <p className="note">
              {view.players.length < 2
                ? "Add another player or a bot to begin."
                : `${view.players.length * turns * (view.mode === "FULL" ? 2 : 1)} rounds · Everyone gets equal Insider turns.`}
            </p>
            <button
              className="primary full"
              disabled={!host || disabled || view.players.length < 2}
              onClick={() => void connection.act({ type: "start" })}
            >
              {host ? "Ring the opening bell" : "Waiting for the host"}
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>
      {bots && (
        <Modal title="Choose your company." onClose={() => setBots(false)}>
          {(
            Object.entries(BOTS) as [Personality, (typeof BOTS)[Personality]][]
          ).map(([id, bot], i) => (
            <button
              key={id}
              className="bot-option"
              disabled={
                disabled ||
                view.players.some((p) => p.bot === id) ||
                view.players.length >= 5
              }
              onClick={async () => {
                if (await connection.act({ type: "addBot", bot: id }))
                  setBots(false);
              }}
            >
              <Avatar player={{ name: bot.name, bot: id }} index={i} />
              <span>
                <strong>{bot.name}</strong>
                <small>{bot.description}</small>
              </span>
              <Plus size={18} />
            </button>
          ))}
        </Modal>
      )}
    </section>
  );
}
