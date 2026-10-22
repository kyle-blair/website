export type StoredValue =
	| null
	| boolean
	| number
	| string
	| StoredValue[]
	| { [key: string]: StoredValue };
export type StoredEntry =
	{ found: false } | { found: true; value: StoredValue };

type QueryResult = { rows: Record<string, unknown>[] };
export interface DatabaseConnection {
	query(text: string, values?: unknown[]): Promise<QueryResult>;
	release(): void;
}
export interface DatabasePool {
	query(text: string, values?: unknown[]): Promise<QueryResult>;
	connect(): Promise<DatabaseConnection>;
	end(): Promise<void>;
}
export interface PersistentStorage {
	read(key: string): Promise<StoredEntry>;
	increment(
		key: string,
		operationId: string,
		amount?: number,
	): Promise<number>;
	check(): Promise<void>;
}

export class StorageConflict extends Error {}

export class PostgresStorage implements PersistentStorage {
	private readonly pool: DatabasePool;
	private initialization: Promise<void> | undefined;

	public constructor(pool: DatabasePool) {
		this.pool = pool;
	}

	public async initialize(): Promise<void> {
		this.initialization ??= this.transaction(async (connection) => {
			await connection.query("SELECT pg_advisory_xact_lock(734150203)");
			await connection.query("CREATE SCHEMA IF NOT EXISTS key_value");
			await connection.query(
				"CREATE TABLE IF NOT EXISTS key_value.entries (key text PRIMARY KEY, value jsonb NOT NULL)",
			);
			await connection.query(
				"CREATE TABLE IF NOT EXISTS key_value.operations (operation_id uuid PRIMARY KEY, key text NOT NULL, value jsonb NOT NULL, expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'))",
			);
			await connection.query(
				"ALTER TABLE key_value.operations ADD COLUMN IF NOT EXISTS amount integer NOT NULL DEFAULT 1 CHECK (amount IN (-1, 1))",
			);
			await connection.query(
				"CREATE INDEX IF NOT EXISTS operations_expiration ON key_value.operations (expires_at)",
			);
		}).catch((error: unknown) => {
			this.initialization = undefined;
			throw error;
		});
		await this.initialization;
	}

	public async read(key: string): Promise<StoredEntry> {
		await this.initialize();
		const result = await this.pool.query(
			"SELECT value FROM key_value.entries WHERE key = $1",
			[key],
		);
		return result.rows.length === 0
			? { found: false }
			: { found: true, value: result.rows[0].value as StoredValue };
	}

	public async increment(
		key: string,
		submittedOperationId: string,
		amount = 1,
	): Promise<number> {
		if (amount !== 1 && amount !== -1)
			throw new TypeError("Counter adjustments must be 1 or -1.");
		await this.initialize();
		const operationId = submittedOperationId.toLowerCase();
		return this.transaction(async (connection) => {
			await connection.query(
				"SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
				[operationId],
			);
			await connection.query(
				"DELETE FROM key_value.operations WHERE operation_id = $1 AND expires_at <= now()",
				[operationId],
			);
			const previous = await connection.query(
				"SELECT key, value, amount FROM key_value.operations WHERE operation_id = $1",
				[operationId],
			);
			if (previous.rows.length > 0) {
				if (
					previous.rows[0].key !== key ||
					previous.rows[0].amount !== amount
				) {
					throw new StorageConflict(
						"Operation identifier already used for another adjustment.",
					);
				}
				return previous.rows[0].value as number;
			}
			const result = await connection.query(
				`
				INSERT INTO key_value.entries AS entry (key, value) VALUES ($1, to_jsonb($2::numeric))
				ON CONFLICT (key) DO UPDATE SET value = to_jsonb((entry.value #>> '{}')::numeric + $2::numeric)
				WHERE CASE WHEN jsonb_typeof(entry.value) = 'number' THEN
					(entry.value #>> '{}')::numeric BETWEEN 0 AND 9007199254740991
					AND (entry.value #>> '{}')::numeric + $2::numeric BETWEEN 0 AND 9007199254740991
					AND trunc((entry.value #>> '{}')::numeric) = (entry.value #>> '{}')::numeric
				ELSE false END
				RETURNING value`,
				[key, amount],
			);
			if (
				result.rows.length === 0 ||
				(result.rows[0].value as number) < 0
			) {
				throw new StorageConflict(
					"Counter adjustment requires a nonnegative safe integer result.",
				);
			}
			const value = result.rows[0].value as number;
			await connection.query(
				"INSERT INTO key_value.operations (operation_id, key, value, amount) VALUES ($1, $2, $3::jsonb, $4)",
				[operationId, key, JSON.stringify(value), amount],
			);
			return value;
		});
	}

	public async check(): Promise<void> {
		await this.initialize();
		await this.pool.query("SELECT key FROM key_value.entries LIMIT 0");
	}

	public async removeExpiredOperations(): Promise<void> {
		await this.initialize();
		await this.pool.query(
			"DELETE FROM key_value.operations WHERE expires_at <= now()",
		);
	}

	private async transaction<T>(
		action: (connection: DatabaseConnection) => Promise<T>,
	): Promise<T> {
		const connection = await this.pool.connect();
		try {
			await connection.query("BEGIN");
			const result = await action(connection);
			await connection.query("COMMIT");
			return result;
		} catch (error) {
			await connection.query("ROLLBACK");
			throw error;
		} finally {
			connection.release();
		}
	}
}
