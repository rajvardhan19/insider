export function random(seed: number): [number, number] {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let t = Math.imul(next ^ (next >>> 15), 1 | next);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}
export function samples(seed: number, count: number): [number[], number] {
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    const [v, n] = random(seed);
    values.push(v);
    seed = n;
  }
  return [values, seed];
}
