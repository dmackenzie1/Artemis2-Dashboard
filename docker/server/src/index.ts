import { env } from "./env.config.js";
import { createServerRuntime } from "./server/createServerRuntime.js";
import { serverLogger } from "./utils/logging/serverLogger.js";

const serverRuntime = await createServerRuntime();

const registerShutdownSignal = (signal: NodeJS.Signals): void => {
  process.on(signal, () => {
    void serverRuntime.shutdown().finally(() => process.exit(0));
  });
};

registerShutdownSignal("SIGINT");
registerShutdownSignal("SIGTERM");

serverRuntime.app.listen(env.PORT, () => {
  void (async () => {
    await serverRuntime.onServerReady();
    serverLogger.info("Backend is ready", { port: env.PORT });
  })();
});
