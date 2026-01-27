import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import sqlitePkg from "better-sqlite3";
import { randomBytes, pbkdf2Sync } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const getArg = (key) => {
  const idx = args.indexOf(key);
  if (idx === -1) return "";
  return args[idx + 1] || "";
};

const username = getArg("--username");
const phone = getArg("--phone");
const password = getArg("--password");

if (!password || (!username && !phone)) {
  console.log("Usage:");
  console.log("  npm run reset:customer -- --username <user> --password <newpass>");
  console.log("  npm run reset:customer -- --phone <phone> --password <newpass>");
  process.exit(1);
}

const Database = sqlitePkg.default ?? sqlitePkg;
const dbPath = process.env.DB_PATH || path.join(__dirname, "bengkel.db");
const db = new Database(dbPath);

const hashPassword = (pwd, salt = randomBytes(16).toString("hex")) => {
  const hash = pbkdf2Sync(pwd, salt, 120000, 32, "sha256").toString("hex");
  return { salt, hash };
};

const { salt, hash } = hashPassword(String(password));

let result;
if (username) {
  result = db
    .prepare("UPDATE customers SET passwordHash = ?, passwordSalt = ? WHERE username = ?")
    .run(hash, salt, String(username));
} else {
  result = db
    .prepare("UPDATE customers SET passwordHash = ?, passwordSalt = ? WHERE phone = ?")
    .run(hash, salt, String(phone));
}

if (result.changes === 0) {
  console.log("Customer tidak ditemukan.");
  process.exit(1);
}

console.log("Password berhasil direset.");
