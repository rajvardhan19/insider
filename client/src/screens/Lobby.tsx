import { useState } from "react";
import { ArrowRight, Check, Copy, Plus, Users, X } from "lucide-react";
import { Credit } from "../components/Comedy";
import {
  MAX_PLAYERS,
  MAX_INSIDER_TURNS,
  sessionRounds,
  BOTS,
  copy,
  type Personality,
  type PlayerView,
} from "@insider/shared";
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
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/r/${view.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
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
            <span className="micro">
              {view.players.length} / {MAX_PLAYERS} SEATS
            </span>
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
                  <Credit trust={p.trust} />
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
            {view.players.length < MAX_PLAYERS && (
              <button
                className="empty-seat"
                disabled={!host || disabled}
                onClick={() => setBots(true)}
              >
                <Plus size={18} />{" "}
                {host
                  ? "Add a bot to the table"
                  : copy("emptyLobby", view.revision)}
              </button>
            )}
          </div>
        </div>
        <div className="lobby-side">
          <div className="panel invite">
            <span className="micro">YOUR PRIVATE ROOM</span>
            <strong className="room-code">{view.code}</strong>
            <button className="secondary full" onClick={() => void copyLink()}>
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
                  aria-pressed={
                    view.mode === mode && view.insiderTurns === undefined
                  }
                  onClick={() => void connection.act({ type: "mode", mode })}
                >
                  {mode === "QUICK" ? "Quick game" : "Full game"}
                </button>
              ))}
            </div>
            <label htmlFor="insider-turns">Insider turns per player</label>
            <select
              id="insider-turns"
              disabled={!host || disabled}
              value={view.insiderTurns ?? "preset"}
              onChange={(e) =>
                void connection.act({
                  type: "rounds",
                  insiderTurns: Number(e.target.value),
                })
              }
            >
              <option value="preset" disabled>
                Using {view.mode === "QUICK" ? "Quick" : "Full"} preset
              </option>
              {Array.from({ length: MAX_INSIDER_TURNS }, (_, i) => i + 1).map(
                (n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "turn" : "turns"} each
                  </option>
                ),
              )}
            </select>
            <p className="note">
              {view.players.length < 2
                ? "Add another player or a bot to begin."
                : `${sessionRounds(view.players.length, view.mode, view.insiderTurns)} rounds · Everyone gets equal Insider turns.`}
            </p>
            <button
              className="primary full"
              disabled={!host || disabled || view.players.length < 2}
              onClick={() => void connection.act({ type: "start" })}
            >
              {host
                ? "Ring the opening bell"
                : copy("emptyLobby", view.revision)}
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
                view.players.length >= MAX_PLAYERS
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
