import { Pool } from "pg";
import { createApplication } from "./application.ts";
import { PostgresStorage } from "./postgres-storage.ts";
import { telemetry } from "./instrumentation.ts";

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	max: 5,
	connectionTimeoutMillis: 1500,
	statement_timeout: 1500,
	idle_in_transaction_session_timeout: 5000,
});
pool.on("error", () =>
	process.stderr.write("Storage connection unavailable\n"),
);
const store = new PostgresStorage(pool);
const app = createApplication(store, process.env.STORAGE_SERVICE_TOKEN ?? "");
let cleanup: ReturnType<typeof setInterval> | undefined;
app.addHook("onClose", async () => {
	clearInterval(cleanup);
	await pool.end();
	await telemetry?.shutdown().catch(() => {});
});

try {
	if (!process.env.DATABASE_URL && !process.env.PGHOST) {
		throw new Error("Database configuration required");
	}
	cleanup = setInterval(() => {
		void store
			.removeExpiredOperations()
			.catch(() =>
				process.stderr.write("Storage maintenance unavailable\n"),
			);
	}, 60000);
	cleanup.unref();
	await app.listen({
		host: "0.0.0.0",
		port: Number(process.env.PORT ?? 10000),
	});
	for (const signal of ["SIGTERM", "SIGINT"] as const) {
		process.once(signal, () => {
			void app.close().catch(() => {
				process.exitCode = 1;
			});
		});
	}
} catch {
	process.stderr.write("Storage service could not start\n");
	await app.close();
	process.exitCode = 1;
}
