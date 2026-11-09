import { buildApp } from "./app.js";
import { bootstrapAdmin, userCount } from "./auth.js";
import { config } from "./config.js";
import { closeRenderer } from "./render/renderer.js";
import { recoverInterruptedRuns } from "./runs.js";

recoverInterruptedRuns();
bootstrapAdmin();
if (userCount() === 0) {
  console.warn("[startup] No users yet. Set ADMIN_EMAIL + ADMIN_PASSWORD and restart, or run: npm run create-user -- <email> <name> <password> admin");
}

const app = await buildApp();
await app.listen({ port: config.port, host: config.host });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    app.log.info(`${sig} received, shutting down`);
    await app.close();
    await closeRenderer();
    process.exit(0);
  });
}
