import { Pool } from "pg";
import type { CounterStore } from "../domain/counter-store.ts";
import { PostgreSQLCounterStore } from "./postgresql-counter-store.ts";
import { recordFailure } from "../../shared/telemetry.ts";

let store: CounterStore | undefined;

function configuredStore(): CounterStore {
	if (store) return store;
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString)
		throw new Error(
			"Persistent counters require DATABASE_URL. Configure the PostgreSQL connection and retry the request.",
		);
	const pool = new Pool({
		connectionString,
		max: 5,
		connectionTimeoutMillis: 1500,
		statement_timeout: 1500,
		idle_in_transaction_session_timeout: 5000,
	});
	pool.on("error", (error) => {
		recordFailure("database.connection", error);
		process.stderr.write(
			"The PostgreSQL connection pool encountered an idle connection failure. Verify DATABASE_URL and database availability.\n",
		);
	});
	store = new PostgreSQLCounterStore({
		query: (text, values) => pool.query(text, values),
		connect: async () => {
			const connection = await pool.connect();
			return {
				query: (text, values) => connection.query(text, values),
				release: () => connection.release(),
			};
		},
	});
	return store;
}

export const databaseCounterStore: CounterStore = {
	read: (name) => configuredStore().read(name),
	adjust: (name, operationId, amount) =>
		configuredStore().adjust(name, operationId, amount),
};
