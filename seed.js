import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import sqlitePkg from "better-sqlite3";
import { randomUUID } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const Database = sqlitePkg.default ?? sqlitePkg;
const dbPath = process.env.DB_PATH || path.join(__dirname, "bengkel.db");
const db = new Database(dbPath);

const services = [
  "Cek Kaki Kaki",
  "Detoks Mesin",
  "Semi Overhaul",
  "Coolant Changer / Flush",
  "Penggantian Oli",
  "Penggantian Ban",
  "Spooring Balancing",
  "Rem & Rotasi Roda",
  "Servis Berkala",
  "Cars Detailing / Wash",
  "Servis Lain nya",
];

const names = [
  "Budi Santoso",
  "Rina Wulandari",
  "Agus Pratama",
  "Siti Nurhaliza",
  "Dimas Putra",
  "Ayu Lestari",
  "Rizky Ramadhan",
  "Tina Maharani",
];

const plates = ["B 1234 ABC", "D 4567 DEF", "F 7788 GH", "L 9988 JK", "B 9090 ZZ"];

const statuses = [
  "Menunggu Konfirmasi",
  "Dihubungi",
  "Dijadwalkan",
  "Selesai",
];

const today = new Date();

function pad(n) {
  return String(n).padStart(2, "0");
}

function randomDate(offsetDays) {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function randomTime() {
  const hours = 9 + Math.floor(Math.random() * 8);
  const minutes = Math.random() > 0.5 ? "00" : "30";
  return `${pad(hours)}:${minutes}`;
}

function randomPhone() {
  return "08" + Math.floor(100000000 + Math.random() * 900000000);
}

const insert = db.prepare(`
  INSERT INTO bookings
  (id, name, phone, plate, service, date, time, complaint, status, createdAt)
  VALUES
  (@id, @name, @phone, @plate, @service, @date, @time, @complaint, @status, @createdAt)
`);

const count = db.prepare("SELECT COUNT(*) as c FROM bookings").get().c;
if (count > 0) {
  console.log("Bookings already exist, skipping seed.");
  process.exit(0);
}

const rows = [];
for (let i = 0; i < 12; i++) {
  rows.push({
    id: randomUUID(),
    name: names[i % names.length],
    phone: randomPhone(),
    plate: plates[i % plates.length],
    service: services[i % services.length],
    date: randomDate(i % 5),
    time: randomTime(),
    complaint: i % 3 === 0 ? "Bunyi di kaki-kaki" : "",
    status: statuses[i % statuses.length],
    createdAt: new Date(Date.now() - i * 3600_000).toISOString(),
  });
}

const insertMany = db.transaction((items) => {
  for (const item of items) insert.run(item);
});

insertMany(rows);

console.log("Seeded", rows.length, "bookings.");
