import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["production", "development", "test"]).default("production"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_PATH: z.string().min(1).default("./data/els.db"),
    SESSION_SECRET: z.string().min(32, "SESSION_SECRET fehlt oder ist kürzer als 32 Zeichen"),
    PASSCODE_HASH: z
      .string()
      .regex(/^scrypt:\d+:\d+:\d+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/, "PASSCODE_HASH fehlt oder hat ein falsches Format (pnpm hash-passcode)"),
    PUBLIC_ORIGIN: z.url(),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(24),
    LOGIN_MAX_FAILURES: z.coerce.number().int().min(1).max(100).default(5),
    LOGIN_WINDOW_MINUTES: z.coerce.number().int().min(1).max(24 * 60).default(15),
    TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    WEB_DIST: z.string().default("./apps/web/dist"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && !env.PUBLIC_ORIGIN.startsWith("https://"))
      ctx.addIssue({
        code: "custom",
        path: ["PUBLIC_ORIGIN"],
        message: "Im Live-Betrieb ist HTTPS erforderlich",
      });
  });

export type Config = z.infer<typeof envSchema>;

/** Prüft die Umgebung vor dem Start; Fehlkonfiguration bricht sofort ab. */
export function readConfig(env: NodeJS.ProcessEnv): Config {
  const result = envSchema.safeParse(env);
  if (!result.success)
    throw new Error(
      `Konfiguration ungültig: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  return result.data;
}
