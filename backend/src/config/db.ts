import dotenv from "dotenv";
import { Pool, PoolClient } from "pg";

dotenv.config();

/* 
  Here happens the database creation
  Postgre SQL with Neon hosting happens
*/
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined in .env");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

// Runs `fn` inside a transaction on a single connection: COMMIT on success,
// ROLLBACK if it throws. Always releases the connection.
export const withTransaction = async <T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
};

// Namespaces for per-user advisory locks (one per resource type).
export const USER_LOCK = { applications: 1, cvs: 2 } as const;

// Serialises work for one user and one resource type until the transaction
// ends. "Count rows, then insert" is only safe against concurrent requests if
// they take this lock first, otherwise two requests can both see count = limit - 1.
export const lockUserResource = async (
  client: PoolClient,
  namespace: number,
  userId: number,
): Promise<void> => {
  await client.query("SELECT pg_advisory_xact_lock($1::int, $2::int)", [
    namespace,
    userId,
  ]);
};
