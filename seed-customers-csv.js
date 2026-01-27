import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sqlitePkg from "better-sqlite3";
import { randomBytes, randomUUID, pbkdf2Sync } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputPath = process.argv[2];
if (!inputPath) {
  console.log("Usage: npm run seed:customers -- /path/to/customers.csv");
  process.exit(1);
}

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

const parseCSVLine = (line) => {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((v) => v.trim());
};

const normalizeHeader = (value) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

const mapHeader = (headers, options) => {
  const normalized = headers.map((h) => normalizeHeader(h));
  for (const opt of options) {
    const idx = normalized.indexOf(normalizeHeader(opt));
    if (idx !== -1) return idx;
  }
  return -1;
};

const hashPassword = (password, salt = randomBytes(16).toString("hex")) => {
  const hash = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return { salt, hash };
};

const raw = fs.readFileSync(inputPath, "utf8");
const lines = raw.split(/\r?\n/).filter(Boolean);
if (lines.length < 2) {
  console.log("CSV kosong atau hanya header.");
  process.exit(1);
}

const headers = parseCSVLine(lines[0]).map((h) => h.replace(/^\"|\"$/g, ""));
const idxName = mapHeader(headers, ["name", "nama", "customername"]);
const idxPhone = mapHeader(headers, ["phone", "nohp", "no hp", "nomertelepon", "nomortelepon"]);
const idxUsername = mapHeader(headers, ["username", "user", "akun"]);
const idxPassword = mapHeader(headers, ["password", "pass"]);

if (idxName === -1 || idxPhone === -1) {
  console.log("Header wajib: name/nama dan phone/no hp.");
  process.exit(1);
}

const defaultPassword = process.env.CUSTOMER_PASSWORD || "customer123";
const insert = db.prepare(
  `INSERT INTO customers (id, name, phone, username, passwordHash, passwordSalt, createdAt)
   VALUES (@id, @name, @phone, @username, @passwordHash, @passwordSalt, @createdAt)`
);
const exists = db.prepare("SELECT id FROM customers WHERE username = ? OR phone = ?");

let imported = 0;
let skipped = 0;

for (let i = 1; i < lines.length; i++) {
  const cols = parseCSVLine(lines[i]);
  const name = cols[idxName] || "";
  const phone = cols[idxPhone] || "";
  const username = (idxUsername !== -1 && cols[idxUsername]) || phone;
  const password = (idxPassword !== -1 && cols[idxPassword]) || defaultPassword;

  if (!name || !phone || !username) {
    skipped += 1;
    continue;
  }

  const existing = exists.get(String(username), String(phone));
  if (existing) {
    skipped += 1;
    continue;
  }

  const { salt, hash } = hashPassword(String(password));
  insert.run({
    id: randomUUID(),
    name: String(name),
    phone: String(phone),
    username: String(username),
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: new Date().toISOString(),
  });
  imported += 1;
}

console.log(`Import selesai. Added: ${imported}, Skipped: ${skipped}`);
