import "./env.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { AuthRepository } from "./db.js";
import { PasswordService } from "./password.js";
import { createRevocationSynchronizer, RevocationStore } from "./revocation.js";
import { TokenService } from "./token.js";

const config = loadConfig();
const repository = new AuthRepository(config);
const revocations = new RevocationStore();
const synchronizer = createRevocationSynchronizer(repository, revocations, config.gatewayConsumer);

await synchronizer.start();
const app = await createApp({ config, repository, revocations, passwords: new PasswordService(config), tokens: await TokenService.create(config) });
const server = app.listen(config.port, () => console.info(`Auth gateway listening on port ${config.port}`));

async function shutdown() {
  synchronizer.stop();
  server.close();
  await repository.close();
}
process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });
