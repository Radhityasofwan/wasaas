import mysql from "mysql2/promise";
import { SQL_SCHEMA } from "./schema";

const {
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME
} = process.env;

export const pool = mysql.createPool({
  keepAliveInitialDelay: 0,
  enableKeepAlive: true,
  queueLimit: 0,
  host: DB_HOST,
  port: DB_PORT ? Number(DB_PORT) : 3306,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  connectionLimit: 10,
  waitForConnections: true,
  timezone: '+07:00'
});

// Split SQL safely by semicolon at end of statements (simple but stable for our schema)
function splitStatements(sql: string) {
  return sql
    .split(";")
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
}

export async function migrate() {
  const conn = await pool.getConnection();
  try {
    const statements = splitStatements(SQL_SCHEMA);
    for (const stmt of statements) {
      await conn.query(stmt);
    }
  } finally {
    conn.release();
  }
}
