import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/backup.ts"],
  format: "esm",
  platform: "node",
  target: "node22",
  outDir: "dist",
  deps: { alwaysBundle: ["@els/domain"] },
  clean: true,
  dts: false,
});
