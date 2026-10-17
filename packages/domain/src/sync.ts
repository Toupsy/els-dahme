import { z } from "zod";
import { intentSchema } from "./intents";

/** Höchstzahl Aktionen je Push. */
export const PUSH_LIMIT = 100;
/** Höchstzahl Aktionen je Pull-Seite. */
export const PULL_LIMIT = 500;

export const pushRequestSchema = z.object({
  intents: z.array(z.unknown()).min(1).max(PUSH_LIMIT),
});

export const pushResultSchema = z.object({
  acknowledged: z.array(z.object({ id: z.string(), seq: z.number().int(), duplicate: z.boolean() })),
  failed: z.array(
    z.object({
      index: z.number().int(),
      id: z.string().nullable(),
      code: z.enum(["INVALID_INPUT", "INVALID_TRANSITION", "CONFLICT", "SERVER_ERROR"]),
      message: z.string(),
    }),
  ),
});

export const pullResponseSchema = z.object({
  intents: z.array(z.object({ seq: z.number().int().positive(), intent: intentSchema })),
  cursor: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export type PushResult = z.infer<typeof pushResultSchema>;
export type PullResponse = z.infer<typeof pullResponseSchema>;

export const sessionInfoSchema = z.object({ expiresAt: z.string(), username: z.string().optional() });
export type SessionInfo = z.infer<typeof sessionInfoSchema>;

/** Vor der Anmeldung lesbar: Ist ein Wachplan angebunden, und geht die Anmeldung mit Wachplan-Konto? */
export const loginOptionsSchema = z.object({
  portal: z.boolean().optional(),
  wachplan: z.object({ url: z.string(), login: z.boolean() }).nullable(),
});
export type LoginOptions = z.infer<typeof loginOptionsSchema>;

export const portalAccountSchema = z.object({ user: z.object({ username: z.string() }) });
