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

const username = process.env.CUSTOMER_USER || "customer";
const password = process.env.CUSTOMER_PASSWORD || "customer123";
const name = process.env.CUSTOMER_NAME || "Customer Demo";
const phone = process.env.CUSTOMER_PHONE || "081234567890";

const exists = db
  .prepare("SELECT id FROM customers WHERE username = ? OR phone = ?")
  .get(String(username), String(phone));

if (exists) {
  console.log("Customer sudah ada, seed dibatalkan.");
  process.exit(0);
}

const { salt, hash } = hashPassword(String(password));
const customer = {
  id: randomUUID(),
  name,
  phone,
  username,
  passwordHash: hash,
  passwordSalt: salt,
  createdAt: new Date().toISOString(),
};

db.prepare(
  `INSERT INTO customers (id, name, phone, username, passwordHash, passwordSalt, createdAt)
   VALUES (@id, @name, @phone, @username, @passwordHash, @passwordSalt, @createdAt)`
).run(customer);

console.log(`Seed customer selesai. Username: ${username}`);
