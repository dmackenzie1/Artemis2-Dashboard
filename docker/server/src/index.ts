import { env } from "./env.config.js";
import { createServerRuntime } from "./server/createServerRuntime.js";
import { serverLogger } from "./utils/logging/serverLogger.js";

const serverRuntime = await createServerRuntime();

process.on("SIGINT", () => {
  void serverRuntime.shutdown().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void serverRuntime.shutdown().finally(() => process.exit(0));
});

serverRuntime.app.listen(env.PORT, () => {
  void (async () => {
    await serverRuntime.onServerReady();
    serverLogger.info("Backend is ready", { port: env.PORT });
  })();
});
