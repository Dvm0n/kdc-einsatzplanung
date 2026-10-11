// Startet eine lokale Postgres-Instanz für die Entwicklung (ohne Docker).
// Daten liegen in ./.pgdata, Port 5433, Benutzer/Passwort/DB: kdc/kdc/kdc
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const dataDir = "./.pgdata";
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "kdc",
  password: "kdc",
  port: 5433,
  persistent: true,
});

const fresh = !existsSync(dataDir);
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase("kdc");
console.log("Postgres läuft auf localhost:5433 (Strg+C zum Beenden)");

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
