import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sqlitePkg from "better-sqlite3";
import { randomUUID } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const Database = sqlitePkg.default ?? sqlitePkg;
const dbPath = process.env.DB_PATH || path.join(__dirname, "bengkel.db");
const db = new Database(dbPath);

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node import-csv.js /path/to/file.csv");
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, "utf8");
const lines = raw.split(/\r?\n/).filter(Boolean);

function parseCSVLine(line) {
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
}

const headerLine = lines[0];
const headers = parseCSVLine(headerLine).map((h) => h.replace(/^"|"$/g, ""));

const idx = (name) => headers.findIndex((h) => h === name);

const map = {
  service: idx("Pilihan Servis"),
  name: idx("Nama"),
  phone: idx("Nomer Telepon"),
  plate: idx("Nopol"),
  complaint: idx("Keluhan"),
  created: idx("Created"),
};

if (Object.values(map).some((v) => v === -1)) {
  console.error("CSV headers not matched. Found:", headers);
  process.exit(1);
}

const insert = db.prepare(`
  INSERT INTO bookings
  (id, name, phone, plate, service, date, time, complaint, status, createdAt)
  VALUES
  (@id, @name, @phone, @plate, @service, @date, @time, @complaint, @status, @createdAt)
`);

const exists = db.prepare(
  "SELECT id FROM bookings WHERE name = ? AND phone = ? AND plate = ? AND createdAt = ?"
);

let added = 0;

const tx = db.transaction((rows) => {
  rows.forEach((row) => insert.run(row));
});

const rows = [];
for (let i = 1; i < lines.length; i++) {
  const cols = parseCSVLine(lines[i]);
  if (!cols.length) continue;

  const createdRaw = cols[map.created] || "";
  const created = createdRaw ? createdRaw.replace(/"/g, "") : "";
  const [datePart, timePart] = created.split(" ");

  const entry = {
    id: randomUUID(),
    name: (cols[map.name] || "").replace(/"/g, "").trim(),
    phone: (cols[map.phone] || "").replace(/"/g, "").trim(),
    plate: (cols[map.plate] || "-").replace(/"/g, "").trim().toUpperCase(),
    service: (cols[map.service] || "").replace(/"/g, "").trim(),
    date: datePart || "",
    time: timePart ? timePart.slice(0, 5) : "09:00",
    complaint: (cols[map.complaint] || "").replace(/"/g, "").trim(),
    status: "Menunggu Konfirmasi",
    createdAt: created || new Date().toISOString(),
  };

  if (!entry.name || !entry.phone || !entry.service) continue;

  const duplicate = exists.get(entry.name, entry.phone, entry.plate, entry.createdAt);
  if (duplicate) continue;

  rows.push(entry);
}

if (rows.length) {
  tx(rows);
  added = rows.length;
}

console.log(`Imported ${added} rows.`);
