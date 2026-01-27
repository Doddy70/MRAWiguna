import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import sqlitePkg from "better-sqlite3";
import { randomBytes, randomUUID, pbkdf2Sync } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const Database = sqlitePkg.default ?? sqlitePkg;
const dbPath = process.env.DB_PATH || path.join(__dirname, "bengkel.db");
const db = new Database(dbPath);
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    passwordSalt TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )
`);

const hashPassword = (password, salt = randomBytes(16).toString("hex")) => {
  const hash = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return { salt, hash };
};

const defaultPassword = process.env.CUSTOMER_PASSWORD || "customer123";

const bookings = db
  .prepare("SELECT DISTINCT name, phone FROM bookings WHERE phone IS NOT NULL AND phone <> ''")
  .all();

const exists = db.prepare("SELECT id FROM customers WHERE username = ? OR phone = ?");
const insert = db.prepare(
  `INSERT INTO customers (id, name, phone, username, passwordHash, passwordSalt, createdAt)
   VALUES (@id, @name, @phone, @username, @passwordHash, @passwordSalt, @createdAt)`
);

let created = 0;
let skipped = 0;

const seedTx = db.transaction(() => {
  for (const row of bookings) {
    const name = String(row.name || "").trim();
    const phone = String(row.phone || "").trim();
    if (!phone || !name) {
      skipped += 1;
      continue;
    }
    const username = phone;
    const existing = exists.get(username, phone);
    if (existing) {
      skipped += 1;
      continue;
    }
    const { salt, hash } = hashPassword(defaultPassword);
    insert.run({
      id: randomUUID(),
      name,
      phone,
      username,
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: new Date().toISOString(),
    });
    created += 1;
  }
});

seedTx();

console.log(`Seed from bookings selesai. Added: ${created}, Skipped: ${skipped}`);
if (created > 0) {
  console.log(`Default password: ${defaultPassword}`);
}
