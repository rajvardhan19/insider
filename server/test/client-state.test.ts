import { describe, it, expect } from "vitest";
import { acceptView } from "../../client/src/net/connection";
import { secondsRemaining } from "../../client/src/net/clock";
import type { PlayerView } from "@insider/shared";
const view = (roomId: string, revision: number) =>
  ({ roomId, revision }) as PlayerView;
describe("client snapshot and countdown rules", () => {
  it("rejects older same-room snapshots and accepts a new room", () => {
    expect(acceptView(view("a", 8), view("a", 7))).toBe(false);
    expect(acceptView(view("a", 8), view("a", 8))).toBe(true);
    expect(acceptView(view("a", 8), view("a", 9))).toBe(true);
    expect(acceptView(view("a", 8), view("b", 1))).toBe(true);
  });
  it("clamps a stale rendering tick and expires without negative time", () => {
    expect(secondsRemaining(1000, 21000, 800)).toBe(20);
    expect(secondsRemaining(1000, 21000, 20500)).toBe(1);
    expect(secondsRemaining(1000, 21000, 21000)).toBe(0);
    expect(secondsRemaining(1000, 21000, 25000)).toBe(0);
  });
});
