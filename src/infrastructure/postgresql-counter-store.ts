import type {
	CounterAdjustment,
	CounterStore,
} from "../domain/counter-store.ts";

type QueryResult = { rows: Record<string, unknown>[] };

export interface DatabaseConnection {
	query(text: string, values?: unknown[]): Promise<QueryResult>;
	release(): void;
}

export interface DatabasePool {
	query(text: string, values?: unknown[]): Promise<QueryResult>;
	connect(): Promise<DatabaseConnection>;
}

export class CounterAdjustmentConflict extends Error {}

export class PostgreSQLCounterStore implements CounterStore {
	private readonly pool: DatabasePool;

	public constructor(pool: DatabasePool) {
		this.pool = pool;
	}

	public async read(name: string): Promise<number> {
		this.requireName(name);
		const result = await this.pool.query(
			"SELECT value FROM website.counters WHERE name = $1",
			[name],
		);
		return result.rows.length === 0
			? 0
			: this.counterValue(result.rows[0].value);
	}

	public async adjust(
		name: string,
		operationId: string,
		amount: CounterAdjustment,
	): Promise<number> {
		this.requireName(name);
		if (!this.isOperationId(operationId))
			throw new TypeError(
				"A counter adjustment requires a version 4 UUID operation identifier.",
			);
		if (amount !== 1 && amount !== -1)
			throw new TypeError("A counter adjustment must be 1 or -1.");

		const normalizedOperationId = operationId.toLowerCase();
		return this.transaction(async (connection) => {
			await connection.query(
				"SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
				[normalizedOperationId],
			);
			const previous = await connection.query(
				"SELECT counter_name, amount, result FROM website.counter_adjustments WHERE operation_id = $1",
				[normalizedOperationId],
			);
			if (previous.rows.length > 0) {
				const adjustment = previous.rows[0];
				if (
					adjustment.counter_name !== name ||
					Number(adjustment.amount) !== amount
				)
					throw new CounterAdjustmentConflict(
						"The operation identifier was already used for another counter adjustment.",
					);
				return this.counterValue(adjustment.result);
			}

			const changed = await connection.query(
				amount === 1
					? `INSERT INTO website.counters AS counter (name, value) VALUES ($1, 1)
						ON CONFLICT (name) DO UPDATE SET value = counter.value + 1
						WHERE counter.value < 9007199254740991
						RETURNING value`
					: `UPDATE website.counters SET value = value - 1
						WHERE name = $1 AND value > 0
						RETURNING value`,
				[name],
			);
			if (changed.rows.length === 0)
				throw new CounterAdjustmentConflict(
					"The counter adjustment would produce an invalid value.",
				);
			const value = this.counterValue(changed.rows[0].value);
			await connection.query(
				"INSERT INTO website.counter_adjustments (operation_id, counter_name, amount, result) VALUES ($1, $2, $3, $4)",
				[normalizedOperationId, name, amount, value],
			);
			return value;
		});
	}

	private requireName(name: string) {
		if (
			typeof name !== "string" ||
			name.length === 0 ||
			name.length > 512 ||
			/[\u0000-\u001f\u007f]/.test(name)
		)
			throw new TypeError(
				"A counter name must contain between 1 and 512 characters without control characters.",
			);
	}

	private isOperationId(value: string) {
		return /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(
			value,
		);
	}

	private counterValue(value: unknown): number {
		const number =
			typeof value === "string" && /^\d+$/.test(value)
				? Number(value)
				: value;
		if (!Number.isSafeInteger(number) || (number as number) < 0)
			throw new Error(
				"The database returned a counter value outside the supported range.",
			);
		return number as number;
	}

	private async transaction<T>(
		action: (connection: DatabaseConnection) => Promise<T>,
	): Promise<T> {
		const connection = await this.pool.connect();
		try {
			await connection.query("BEGIN");
			const result = await action(connection);
			await connection.query("COMMIT");
			connection.release();
			return result;
		} catch (error) {
			let failure = error;
			try {
				await connection.query("ROLLBACK");
			} catch (rollbackError) {
				failure = new AggregateError(
					[error, rollbackError],
					"The counter adjustment failed and its database transaction could not be rolled back.",
				);
			}
			connection.release();
			throw failure;
		}
	}
}
