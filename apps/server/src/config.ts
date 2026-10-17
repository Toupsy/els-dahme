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
      .regex(
        /^scrypt:\d+:\d+:\d+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/,
        "PASSCODE_HASH fehlt oder hat ein falsches Format (pnpm hash-passcode)",
      ),
    PUBLIC_ORIGIN: z.url(),
    SESSION_TTL_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 30)
      .default(24),
    LOGIN_MAX_FAILURES: z.coerce.number().int().min(1).max(100).default(5),
    LOGIN_WINDOW_MINUTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 60)
      .default(15),
    TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    PORTAL_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    WEB_DIST: z.string().default("./apps/web/dist"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),
    /** Wachplan-Generator, von dem der Server die Besetzung abholt. Ohne beide Werte bleibt die Anbindung aus. */
    WACHPLAN_URL: z.preprocess(emptyToUndefined, z.url().optional()),
    WACHPLAN_KEY: z.preprocess(emptyToUndefined, z.string().min(20, "WACHPLAN_KEY ist zu kurz").optional()),
    WACHPLAN_DAYS: z.coerce.number().int().min(1).max(14).default(2),
    WACHPLAN_INTERVAL_SECONDS: z.coerce.number().int().min(15).max(3600).default(60),
    /** Adresse des Wachplans für den Browser. Ein Pfad wie /plan/ (gleiche Adresse) erlaubt die Anmeldung mit Wachplan-Konto. */
    WACHPLAN_PUBLIC_URL: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .max(200)
        .regex(/^(\/|https?:\/\/)/, "Pfad wie /plan/ oder Adresse mit https://")
        .optional(),
    ),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && !env.PUBLIC_ORIGIN.startsWith("https://"))
      ctx.addIssue({
        code: "custom",
        path: ["PUBLIC_ORIGIN"],
        message: "Im Live-Betrieb ist HTTPS erforderlich",
      });
    if (env.PORTAL_ENABLED && (!env.WACHPLAN_URL || !env.WACHPLAN_KEY || !safePortalPath(env.WACHPLAN_PUBLIC_URL)))
      ctx.addIssue({
        code: "custom",
        path: ["PORTAL_ENABLED"],
        message: "Portal braucht WACHPLAN_URL, WACHPLAN_KEY und einen sicheren WACHPLAN_PUBLIC_URL-Pfad wie /plan/",
      });
    // Adresse ohne Schlüssel ist erlaubt (Verbund vor dem ersten Schlüssel), die Anbindung bleibt dann aus.
    if (env.WACHPLAN_KEY && !env.WACHPLAN_URL)
      ctx.addIssue({ code: "custom", path: ["WACHPLAN_URL"], message: "WACHPLAN_KEY braucht WACHPLAN_URL" });
    // Der Schlüssel darf nicht unverschlüsselt durchs Internet; im eigenen Netz geht auch HTTP.
    if (env.NODE_ENV === "production" && env.WACHPLAN_URL?.startsWith("http://") && !isInternalHost(env.WACHPLAN_URL))
      ctx.addIssue({
        code: "custom",
        path: ["WACHPLAN_URL"],
        message: "Über das Internet nur mit HTTPS (HTTP nur im eigenen Netz)",
      });
  });

/** Nur kanonische, gleichursprüngliche Pfade, keine kodierten Redirects oder Dot-Segmente. */
export function safePortalPath(value: string | undefined): boolean {
  return !!value && /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(value) && value !== "/";
}

function emptyToUndefined(value: unknown) {
  return value === "" ? undefined : value;
}

/** Docker-Dienstname, localhost oder private IPv4-Adresse. */
function isInternalHost(url: string): boolean {
  const host = new URL(url).hostname;
  return !host.includes(".") || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}

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
