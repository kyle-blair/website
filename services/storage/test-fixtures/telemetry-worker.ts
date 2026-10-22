import { startTelemetry } from "../src/telemetry-sdk.ts";
import { observe } from "../../../shared/telemetry.ts";
const telemetry = startTelemetry("resilience-test");
await observe("test.available", async () => 1);
await telemetry?.shutdown().catch(() => {});
process.stdout.write("completed\n");
