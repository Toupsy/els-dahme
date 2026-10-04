import { buildApp } from "./app";
import { readConfig } from "./config";
import { openDatabase } from "./db";

const config = readConfig(process.env);
const db = openDatabase(config.DATABASE_PATH);
const { app } = await buildApp(config, db);

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close().then(() => {
      db.close();
      process.exit(0);
    });
  });

await app.listen({ host: config.HOST, port: config.PORT });
