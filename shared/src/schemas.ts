import { z } from "zod";
import { PHRASES } from "./phrases.js";
export const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(12)
  .regex(/^[a-zA-Z0-9 ]+$/, "Use letters, numbers and spaces.")
  .refine(
    (s) => !/(fuck|shit|bitch|cunt|nigger|faggot)/i.test(s),
    "Choose another display name.",
  );
const direction = z.enum(["UP", "DOWN"]);
export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start") }).strict(),
  z.object({ type: z.literal("replay") }).strict(),
  z.object({ type: z.literal("leave") }).strict(),
  z
    .object({ type: z.literal("mode"), mode: z.enum(["QUICK", "FULL"]) })
    .strict(),
  z
    .object({
      type: z.literal("addBot"),
      bot: z.enum([
        "lucy",
        "sam",
        "nina",
        "walt",
        "sal",
        "penny",
        "ollie",
        "rex",
      ]),
    })
    .strict(),
  z
    .object({ type: z.literal("removeBot"), playerId: z.string().max(80) })
    .strict(),
  z.object({ type: z.literal("tip"), direction, strong: z.boolean() }).strict(),
  z
    .object({
      type: z.literal("guess"),
      direction,
      stake: z.union([z.literal(100), z.literal(200), z.literal(300)]),
      callShark: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("chat"),
      phraseId: z.enum(
        Object.keys(PHRASES) as [
          keyof typeof PHRASES,
          ...(keyof typeof PHRASES)[],
        ],
      ),
    })
    .strict(),
]);
export type Action = z.infer<typeof actionSchema>;
export const commandSchema = z
  .object({
    commandId: z.string().min(8).max(80),
    gameId: z.string().max(80).nullable(),
    roundId: z.number().int().min(0).max(100),
    action: actionSchema,
  })
  .strict();
export type Command = z.infer<typeof commandSchema>;
export const entrySchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("watch"),
      bots: z
        .array(
          z.enum([
            "lucy",
            "sam",
            "nina",
            "walt",
            "sal",
            "penny",
            "ollie",
            "rex",
          ]),
        )
        .min(2)
        .max(5)
        .refine(
          (bots) => new Set(bots).size === bots.length,
          "Choose distinct bots.",
        ),
      mode: z.enum(["QUICK", "FULL"]),
    })
    .strict(),
  z.object({ type: z.literal("create"), name: nameSchema }).strict(),
  z
    .object({
      type: z.literal("solo"),
      name: nameSchema,
      firstGame: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("join"),
      name: nameSchema,
      code: z.string().regex(/^[A-Z]{4}$/),
    })
    .strict(),
  z
    .object({
      type: z.literal("rejoin"),
      code: z.string().regex(/^[A-Z]{4}$/),
      token: z.string().min(32).max(128),
    })
    .strict(),
]);
export type Entry = z.infer<typeof entrySchema>;
