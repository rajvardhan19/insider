import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { Ack, Action, Command, Entry, PlayerView } from "@insider/shared";

export function readSaved(key: string, fallback = "") {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
export function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Storage may be disabled; the current connection still works. */
  }
}
function forget(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* No persistent storage. */
  }
}
export function roomFromPath() {
  return (
    /^\/r\/([A-Z]{4})\/?$/i.exec(window.location.pathname)?.[1].toUpperCase() ??
    ""
  );
}
export function acceptView(current: PlayerView | null, incoming: PlayerView) {
  return (
    !current ||
    incoming.roomId !== current.roomId ||
    incoming.revision >= current.revision
  );
}

export function useConnection() {
  const [view, setView] = useState<PlayerView | null>(null),
    [connected, setConnected] = useState(false),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [replaced, setReplaced] = useState(false),
    [offset, setOffset] = useState(0);
  const socket = useRef<Socket | null>(null),
    latest = useRef<PlayerView | null>(null),
    isReady = useRef(false),
    pending = useRef<Command | null>(null),
    sending = useRef(false),
    entryBusy = useRef(false);
  const clearPending = () => {
    pending.current = null;
    setBusy(false);
  };
  useEffect(() => {
    const s = io({ autoConnect: false });
    socket.current = s;
    let disposed = false;
    async function syncClock() {
      const before = Date.now();
      try {
        const value = (await s.timeout(3000).emitWithAck("clock")) as {
          serverNow: number;
        };
        if (!disposed && Number.isFinite(value.serverNow))
          setOffset(value.serverNow - (before + Date.now()) / 2);
      } catch {
        /* A later clock sample can recover. */
      }
    }
    async function retryPending() {
      const command = pending.current;
      if (!command || sending.current) return;
      sending.current = true;
      try {
        const ack = (await s
          .timeout(4000)
          .emitWithAck("command", command)) as Ack;
        if (!ack.ok) setError(ack.message);
        clearPending();
      } catch {
        setError(
          "Your action is not confirmed yet. Reconnect to check its status.",
        );
        setBusy(false);
      } finally {
        sending.current = false;
      }
    }
    s.on("connect", async () => {
      setConnected(true);
      setReplaced(false);
      void syncClock();
      const code = roomFromPath(),
        token = code && readSaved(`insider:seat:${code}`);
      if (token) {
        try {
          const ack = (await s
            .timeout(5000)
            .emitWithAck("entry", { type: "rejoin", code, token })) as Ack;
          if (!ack.ok) {
            setError(ack.message);
            if (["ROOM_NOT_FOUND", "UNAUTHORIZED"].includes(ack.code)) {
              forget(`insider:seat:${code}`);
              latest.current = null;
              setView(null);
              clearPending();
              isReady.current = true;
              setReady(true);
            }
            return;
          }
          isReady.current = true;
          setReady(true);
          setError("");
          void retryPending();
        } catch {
          setError("Could not recover your seat. Try reconnecting.");
        }
      } else {
        isReady.current = true;
        setReady(true);
      }
    });
    s.on("state", (incoming: PlayerView) => {
      if (
        disposed ||
        incoming.protocol !== 1 ||
        !acceptView(latest.current, incoming)
      )
        return;
      latest.current = incoming;
      setView(incoming);
    });
    s.on("disconnect", () => {
      isReady.current = false;
      setConnected(false);
      setReady(false);
    });
    s.on("connect_error", () =>
      setError("The exchange is unreachable. Reconnecting…"),
    );
    s.on("replaced", () => {
      setReplaced(true);
      setError(
        "Your seat is open in another tab. Reconnect here to take it back.",
      );
    });
    s.on("shutdown", () =>
      setError(
        "The exchange is restarting. This match will end; create a new room after it reconnects.",
      ),
    );
    s.connect();
    const clockTimer = setInterval(() => {
      if (s.connected) void syncClock();
    }, 30000);
    return () => {
      disposed = true;
      clearInterval(clockTimer);
      s.removeAllListeners();
      s.disconnect();
      socket.current = null;
    };
  }, []);

  async function enter(entry: Entry) {
    const s = socket.current;
    if (!s?.connected || entryBusy.current) return false;
    entryBusy.current = true;
    setBusy(true);
    setError("");
    try {
      const ack = (await s.timeout(5000).emitWithAck("entry", entry)) as Ack;
      if (!ack.ok) {
        setError(ack.message);
        return false;
      }
      if (ack.code) {
        if (ack.token) save(`insider:seat:${ack.code}`, ack.token);
        history.replaceState({}, "", `/r/${ack.code}`);
      }
      isReady.current = true;
      setReady(true);
      return true;
    } catch {
      setError("The room request was not confirmed. Reconnect and try again.");
      return false;
    } finally {
      entryBusy.current = false;
      setBusy(false);
    }
  }
  async function act(action: Action) {
    const s = socket.current,
      v = latest.current;
    if (!s || !v || !isReady.current || sending.current) return false;
    if (pending.current) {
      setError("Reconnect to confirm your previous action first.");
      return false;
    }
    const command: Command = {
      commandId: crypto.randomUUID(),
      gameId: v.gameId,
      roundId: v.round,
      action,
    };
    pending.current = command;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      // Retry only the same command ID: a lost acknowledgement must not repeat a bet.
      let ack: Ack;
      try {
        ack = (await s.timeout(3500).emitWithAck("command", command)) as Ack;
      } catch {
        if (!isReady.current) throw new Error("disconnected");
        ack = (await s.timeout(3500).emitWithAck("command", command)) as Ack;
      }
      if (!ack.ok) {
        setError(ack.message);
        clearPending();
        return false;
      }
      clearPending();
      return true;
    } catch {
      setError(
        "Your action is not confirmed yet. Reconnect to check its status.",
      );
      setBusy(false);
      return false;
    } finally {
      sending.current = false;
    }
  }
  async function leave() {
    if (view && !(await act({ type: "leave" }))) return;
    const code = view?.code;
    if (code) forget(`insider:seat:${code}`);
    latest.current = null;
    setView(null);
    clearPending();
    setError("");
    history.replaceState({}, "", "/");
  }
  function reconnect() {
    setError("");
    socket.current?.disconnect();
    socket.current?.connect();
  }
  return {
    view,
    connected,
    ready,
    busy,
    error,
    replaced,
    offset,
    enter,
    act,
    leave,
    reconnect,
    dismissError: () => setError(""),
  };
}
export type Connection = ReturnType<typeof useConnection>;
