import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	process.stderr.write(
		"Database migration requires DATABASE_URL. Configure the PostgreSQL connection and retry the migration.\n",
	);
	process.exitCode = 1;
} else {
	const pool = new Pool({ connectionString, max: 1 });
	try {
		const schema = await readFile(
			new URL("../database/schema.sql", import.meta.url),
			"utf8",
		);
		await pool.query(schema);
		process.stdout.write("Database schema is ready.\n");
	} catch (error) {
		process.stderr.write(
			"Database migration failed. Verify DATABASE_URL, database availability, and schema permissions before retrying.\n",
		);
		console.error(error);
		process.exitCode = 1;
	} finally {
		await pool.end();
	}
}
