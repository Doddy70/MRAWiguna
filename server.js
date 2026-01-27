import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import sqlitePkg from "better-sqlite3";
import { randomBytes, randomUUID, pbkdf2Sync } from "crypto";
import OpenAI from "openai";
import multer from "multer";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const Database = sqlitePkg.default ?? sqlitePkg;
const dbPath = process.env.DB_PATH || path.join(__dirname, "bengkel.db");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    plate TEXT NOT NULL,
    vehicle TEXT NOT NULL,
    city TEXT NOT NULL,
    service TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    complaint TEXT NOT NULL,
    status TEXT NOT NULL,
    priority TEXT DEFAULT '',
    createdAt TEXT NOT NULL
  )
`);


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

const ensureColumn = (table, column, type) => {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  const has = cols.some((c) => c.name === column);
  if (!has) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
};

ensureColumn("bookings", "priority", "TEXT DEFAULT ''");
ensureColumn("bookings", "mechanic", "TEXT DEFAULT ''");
ensureColumn("bookings", "vehicle", "TEXT DEFAULT ''");
ensureColumn("bookings", "progress", "TEXT DEFAULT ''");
ensureColumn("bookings", "city", "TEXT DEFAULT ''");
ensureColumn("bookings", "archivedAt", "TEXT DEFAULT ''");

const SERVICES = [
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

const WP_BASE = "https://bengkelwiguna.com";
const YT_HANDLE = "BengkelWiguna";
let cachedChannelId = "";

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const uploadDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const fileUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || ".jpg");
      cb(null, `${Date.now()}-${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.get("/api/services", (_req, res) => {
  res.json({ services: SERVICES });
});

app.get("/api/public/wp-posts", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 6), 10);
  try {
    if (typeof fetch !== "function") {
      return res.status(500).json({ error: "Server belum mendukung Fetch API." });
    }
    const url = `${WP_BASE}/wp-json/wp/v2/posts?per_page=${limit}&_fields=title,excerpt,link,date,featured_media`;
    const postsRes = await fetch(url);
    const posts = await postsRes.json();
    if (!postsRes.ok) {
      return res.status(500).json({ error: "Gagal memuat artikel." });
    }

    const enriched = await Promise.all(
      posts.map(async (post) => {
        let image = "";
        if (post.featured_media) {
          try {
            const mediaRes = await fetch(
              `${WP_BASE}/wp-json/wp/v2/media/${post.featured_media}`
            );
            const media = await mediaRes.json();
            image = media?.source_url || "";
          } catch {
            image = "";
          }
        }
        const cleanExcerpt = String(post.excerpt?.rendered || "")
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim();
        return {
          title: post.title?.rendered || "Tanpa judul",
          excerpt: cleanExcerpt || "Baca artikel selengkapnya di situs Bengkel Wiguna.",
          link: post.link,
          date: post.date,
          image,
        };
      })
    );

    res.json({ posts: enriched });
  } catch (error) {
    console.error("Error WP posts:", error);
    res.status(500).json({ error: "Gagal memuat artikel." });
  }
});

app.get("/api/public/youtube-videos", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 6), 10);
  try {
    if (typeof fetch !== "function") {
      return res.status(500).json({ error: "Server belum mendukung Fetch API." });
    }
    if (!cachedChannelId) {
      const handleRes = await fetch(`https://www.youtube.com/@${YT_HANDLE}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        },
      });
      const html = await handleRes.text();
      const match =
        html.match(/\"channelId\":\"(UC[^\"]+)\"/) ||
        html.match(/itemprop=\"channelId\" content=\"(UC[^\"]+)\"/) ||
        html.match(/https:\/\/www\.youtube\.com\/channel\/(UC[\w-]+)/) ||
        html.match(/\"externalId\":\"(UC[^\"]+)\"/);
      if (match?.[1]) cachedChannelId = match[1];
    }
    if (!cachedChannelId) {
      return res.status(500).json({ error: "Channel YouTube tidak ditemukan." });
    }
    const feedRes = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${cachedChannelId}`
    );
    const xml = await feedRes.text();
    const entries = xml.split("<entry>").slice(1).map((entry) => `<entry>${entry}`);
    const videos = entries.slice(0, limit).map((entry) => {
      const title = (entry.match(/<title>([^<]+)<\/title>/) || [])[1] || "Video";
      const link = (entry.match(/<link[^>]+href=\"([^\"]+)\"/) || [])[1] || "#";
      const thumb = (entry.match(/media:thumbnail[^>]+url=\"([^\"]+)\"/) || [])[1] || "";
      const published = (entry.match(/<published>([^<]+)<\/published>/) || [])[1] || "";
      return {
        title,
        link,
        thumbnail: thumb,
        published: published ? new Date(published).toLocaleDateString("id-ID") : "",
      };
    });
    res.json({ videos });
  } catch (error) {
    console.error("Error YouTube feed:", error);
    res.status(500).json({ error: "Gagal memuat video." });
  }
});

const adminSessions = new Set();
const customerSessions = new Map();
const adminUser = process.env.ADMIN_USER || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "admin123";

const parseCookies = (cookieHeader = "") => {
  return cookieHeader.split(";").reduce((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
};

const requireAdmin = (req, res, next) => {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.admin_session;
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
};

const requireCustomer = (req, res, next) => {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.customer_session;
  const customerId = token ? customerSessions.get(token) : null;
  if (!customerId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.customerId = customerId;
  return next();
};

const hashPassword = (password, salt = randomBytes(16).toString("hex")) => {
  const hash = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return { salt, hash };
};

const verifyPassword = (password, salt, hash) => {
  const attempt = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return attempt === hash;
};


app.get("/admin.html", (req, res, next) => {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.admin_session;
  if (!token || !adminSessions.has(token)) {
    return res.redirect("/admin-login.html");
  }
  return res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/customer.html", (req, res) => {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.customer_session;
  if (!token || !customerSessions.has(token)) {
    return res.redirect("/customer-login.html");
  }
  return res.sendFile(path.join(__dirname, "public", "customer.html"));
});

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username !== adminUser || password !== adminPassword) {
    return res.status(401).json({ error: "Username atau password salah." });
  }
  const token = randomUUID();
  adminSessions.add(token);
  res.setHeader(
    "Set-Cookie",
    `admin_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`
  );
  return res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.admin_session;
  if (token) adminSessions.delete(token);
  res.setHeader(
    "Set-Cookie",
    "admin_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0"
  );
  return res.json({ ok: true });
});

app.post("/api/customers/signup", (req, res) => {
  const { name, phone, username, password } = req.body || {};
  if (!name || !phone || !username || !password) {
    return res.status(400).json({ error: "Data wajib lengkap." });
  }
  const exists = db
    .prepare("SELECT id FROM customers WHERE username = ? OR phone = ?")
    .get(String(username), String(phone));
  if (exists) {
    return res.status(400).json({ error: "Username atau nomor HP sudah terdaftar." });
  }
  const { salt, hash } = hashPassword(String(password));
  const customer = {
    id: randomUUID(),
    name: String(name),
    phone: String(phone),
    username: String(username),
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO customers (id, name, phone, username, passwordHash, passwordSalt, createdAt)
     VALUES (@id, @name, @phone, @username, @passwordHash, @passwordSalt, @createdAt)`
  ).run(customer);

  const token = randomUUID();
  customerSessions.set(token, customer.id);
  res.setHeader(
    "Set-Cookie",
    `customer_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`
  );
  return res.json({ ok: true });
});

app.post("/api/customers/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username dan password wajib diisi." });
  }
  const customer = db
    .prepare("SELECT * FROM customers WHERE username = ?")
    .get(String(username));
  if (!customer || !verifyPassword(String(password), customer.passwordSalt, customer.passwordHash)) {
    return res.status(401).json({ error: "Username atau password salah." });
  }
  const token = randomUUID();
  customerSessions.set(token, customer.id);
  res.setHeader(
    "Set-Cookie",
    `customer_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`
  );
  return res.json({ ok: true });
});

app.post("/api/customers/logout", (req, res) => {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.customer_session;
  if (token) customerSessions.delete(token);
  res.setHeader(
    "Set-Cookie",
    "customer_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0"
  );
  return res.json({ ok: true });
});

app.get("/api/customers/me", requireCustomer, (req, res) => {
  const customer = db
    .prepare("SELECT id, name, phone, username, createdAt FROM customers WHERE id = ?")
    .get(req.customerId);
  res.json({ customer });
});

app.get("/api/customers/bookings", requireCustomer, (req, res) => {
  const customer = db
    .prepare("SELECT phone FROM customers WHERE id = ?")
    .get(req.customerId);
  if (!customer) {
    return res.status(404).json({ error: "Customer tidak ditemukan." });
  }
  const bookings = db
    .prepare(
      `SELECT * FROM bookings WHERE phone = ? AND (archivedAt IS NULL OR archivedAt = '') ORDER BY datetime(createdAt) DESC LIMIT 50`
    )
    .all(customer.phone);
  res.json({ bookings });
});

app.patch("/api/customers/bookings/:id", requireCustomer, (req, res) => {
  const { id } = req.params;
  const { date, time, service, complaint = "" } = req.body || {};
  const customer = db
    .prepare("SELECT phone FROM customers WHERE id = ?")
    .get(req.customerId);
  if (!customer) {
    return res.status(404).json({ error: "Customer tidak ditemukan." });
  }
  const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(String(id));
  if (!booking || booking.phone !== customer.phone) {
    return res.status(403).json({ error: "Akses ditolak." });
  }
  if (!date || !time || !service) {
    return res.status(400).json({ error: "Tanggal, jam, dan layanan wajib diisi." });
  }
  db.prepare(
    `UPDATE bookings SET date = ?, time = ?, service = ?, complaint = ?, status = ? WHERE id = ?`
  ).run(String(date), String(time), String(service), String(complaint || ""), "Menunggu Konfirmasi", String(id));
  res.json({ ok: true });
});

app.post("/api/customers/bookings/:id/cancel", requireCustomer, (req, res) => {
  const { id } = req.params;
  const customer = db
    .prepare("SELECT phone FROM customers WHERE id = ?")
    .get(req.customerId);
  if (!customer) {
    return res.status(404).json({ error: "Customer tidak ditemukan." });
  }
  const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(String(id));
  if (!booking || booking.phone !== customer.phone) {
    return res.status(403).json({ error: "Akses ditolak." });
  }
  db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run("Batal", String(id));
  res.json({ ok: true });
});

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

app.post("/api/admin/import-csv", requireAdmin, upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "File CSV wajib diunggah." });
  }

  try {
    const raw = req.file.buffer.toString("utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      return res.status(400).json({ error: "CSV kosong." });
    }

    const headers = parseCSVLine(lines[0]).map((h) => h.replace(/^\"|\"$/g, ""));
    const idx = (name) => headers.findIndex((h) => h === name);
    const map = {
      service: idx("Pilihan Servis"),
      name: idx("Nama"),
      phone: idx("Nomer Telepon"),
      vehicle: idx("Tipe Mobil"),
      city: idx("Kota"),
      plate: idx("Nopol"),
      complaint: idx("Keluhan"),
      created: idx("Created"),
    };
    const requiredKeys = ["service", "name", "phone", "vehicle", "plate", "complaint", "created"];
    if (requiredKeys.some((key) => map[key] === -1)) {
      return res.status(400).json({ error: "Header CSV tidak sesuai format." });
    }

    const insert = db.prepare(`
      INSERT INTO bookings
      (id, name, phone, plate, vehicle, city, service, date, time, complaint, status, createdAt)
      VALUES
      (@id, @name, @phone, @plate, @vehicle, @city, @service, @date, @time, @complaint, @status, @createdAt)
    `);
    const exists = db.prepare(
      "SELECT id FROM bookings WHERE name = ? AND phone = ? AND plate = ? AND createdAt = ?"
    );

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      if (!cols.length) continue;
      const createdRaw = cols[map.created] || "";
      const created = createdRaw ? createdRaw.replace(/\"/g, "") : "";
      const [datePart, timePart] = created.split(" ");

      const entry = {
        id: randomUUID(),
        name: (cols[map.name] || "").replace(/\"/g, "").trim(),
        phone: (cols[map.phone] || "").replace(/\"/g, "").trim(),
        plate: (cols[map.plate] || "-").replace(/\"/g, "").trim().toUpperCase(),
        vehicle: (cols[map.vehicle] || "").replace(/\"/g, "").trim(),
        city: (cols[map.city] || "").replace(/\"/g, "").trim(),
        service: (cols[map.service] || "").replace(/\"/g, "").trim(),
        date: datePart || "",
        time: timePart ? timePart.slice(0, 5) : "09:00",
        complaint: (cols[map.complaint] || "").replace(/\"/g, "").trim(),
        status: "Menunggu Konfirmasi",
        createdAt: created || new Date().toISOString(),
      };
      if (!entry.name || !entry.phone || !entry.service) continue;
      if (exists.get(entry.name, entry.phone, entry.plate, entry.createdAt)) continue;
      rows.push(entry);
    }

    const tx = db.transaction((items) => {
      items.forEach((item) => insert.run(item));
    });
    tx(rows);

    return res.json({ imported: rows.length });
  } catch (error) {
    console.error("CSV import error:", error);
    return res.status(500).json({ error: "Gagal import CSV." });
  }
});

app.get("/api/admin/me", (req, res) => {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.admin_session;
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return res.json({ user: adminUser });
});

app.post("/api/bookings", async (req, res) => {
  const { name, phone, plate, vehicle, city, service, date, time, complaint } = req.body || {};

  if (!name || !phone || !plate || !vehicle || !city || !service || !date || !time) {
    return res.status(400).json({
      error: "Mohon lengkapi nama, no HP, plat, tipe/merek, kota, layanan, tanggal, dan jam.",
    });
  }

  try {
    const booking = {
      id: randomUUID(),
      name: String(name).trim(),
      phone: String(phone).trim(),
      plate: String(plate).trim().toUpperCase(),
      vehicle: String(vehicle).trim(),
      city: String(city).trim(),
      service: String(service).trim(),
      date: String(date).trim(),
      time: String(time).trim(),
      complaint: complaint ? String(complaint).trim() : "",
      status: "Menunggu Konfirmasi",
      createdAt: new Date().toISOString(),
    };

    const stmt = db.prepare(`
      INSERT INTO bookings
      (id, name, phone, plate, vehicle, city, service, date, time, complaint, status, createdAt)
      VALUES
      (@id, @name, @phone, @plate, @vehicle, @city, @service, @date, @time, @complaint, @status, @createdAt)
    `);
    stmt.run(booking);

    res.json({ booking });
  } catch (error) {
    console.error("Error creating booking:", error);
    res.status(500).json({ error: "Gagal menyimpan reservasi." });
  }
});

app.get("/api/bookings", requireAdmin, async (req, res) => {
  try {
    const archivedOnly = req.query.archived === "1";
    const where = archivedOnly
      ? "(archivedAt IS NOT NULL AND archivedAt <> '')"
      : "(archivedAt IS NULL OR archivedAt = '')";
    const bookings = db
      .prepare(
        `SELECT * FROM bookings WHERE ${where} ORDER BY datetime(createdAt) DESC LIMIT 50`
      )
      .all();
    res.json({ bookings });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({ error: "Gagal memuat reservasi." });
  }
});

app.get("/api/admin/stats", requireAdmin, (req, res) => {
  const days = Number(req.query.days || 7);
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));

  const rows = db
    .prepare(
      `SELECT date, COUNT(*) as count FROM bookings
       WHERE date >= ? AND (archivedAt IS NULL OR archivedAt = '') GROUP BY date ORDER BY date ASC`
    )
    .all(start.toISOString().slice(0, 10));

  const map = new Map(rows.map((r) => [r.date, r.count]));
  const labels = [];
  const data = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    labels.push(key);
    data.push(map.get(key) || 0);
  }

  res.json({ labels, data });
});

app.get("/api/admin/customers", requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT
         phone,
         name,
         plate,
         vehicle,
         COUNT(*) as totalBookings,
         MAX(createdAt) as lastBooking
       FROM bookings
       WHERE (archivedAt IS NULL OR archivedAt = '')
       GROUP BY phone
       ORDER BY datetime(lastBooking) DESC`
    )
    .all();
  res.json({ customers: rows });
});

app.get("/api/admin/customers/:phone/bookings", requireAdmin, (req, res) => {
  const phone = req.params.phone;
  const rows = db
    .prepare(
      `SELECT * FROM bookings WHERE phone = ? AND (archivedAt IS NULL OR archivedAt = '') ORDER BY datetime(createdAt) DESC LIMIT 10`
    )
    .all(phone);
  res.json({ bookings: rows });
});

app.patch("/api/admin/customers/:phone", requireAdmin, (req, res) => {
  const oldPhone = req.params.phone;
  const { name, phone, plate = "", vehicle = "" } = req.body || {};
  if (!name || !phone) {
    return res.status(400).json({ error: "Nama dan No HP wajib diisi." });
  }
  const info = db
    .prepare(
      `UPDATE bookings SET name = ?, phone = ?, plate = ?, vehicle = ? WHERE phone = ?`
    )
    .run(name, phone, plate, vehicle, oldPhone);
  res.json({ updated: info.changes });
});

app.get("/api/admin/export-csv", requireAdmin, (req, res) => {
  const { q = "", status = "", date = "", priority = "" } = req.query;
  const params = [];
  let where = "(archivedAt IS NULL OR archivedAt = '')";

  if (q) {
    where += " AND (name LIKE ? OR plate LIKE ? OR service LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (status) {
    where += " AND status = ?";
    params.push(status);
  }
  if (date) {
    where += " AND date = ?";
    params.push(date);
  }
  if (priority) {
    where += " AND priority = ?";
    params.push(priority);
  }

  const rows = db
    .prepare(
      `SELECT name, phone, plate, vehicle, city, service, date, time, complaint, status, priority, createdAt FROM bookings WHERE ${where} ORDER BY datetime(createdAt) DESC`
    )
    .all(...params);

  const header = [
    "Nama",
    "No HP",
    "Plat",
    "Tipe/Merek",
    "Kota",
    "Layanan",
    "Tanggal",
    "Jam",
    "Keluhan",
    "Status",
    "Priority",
    "Created",
  ];
  const csv = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.name,
        r.phone,
        r.plate,
        r.vehicle,
        r.city,
        r.service,
        r.date,
        r.time,
        r.complaint,
        r.status,
        r.priority || "",
        r.createdAt,
      ]
        .map((v) => `"${String(v ?? "").replace(/\"/g, '""')}"`)
        .join(",")
    ),
  ].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=reservasi.csv");
  res.send(csv);
});

app.get("/api/admin/template", requireAdmin, (req, res) => {
  const { name, service, date, time, plate, complaint } = req.query;
  const text = `Halo ${name || ""}, terima kasih sudah booking servis di Bengkel Assistant.\n\n` +
    `Detail booking:\n` +
    `- Layanan: ${service || "-"}\n` +
    `- Tanggal: ${date || "-"}\n` +
    `- Jam: ${time || "-"}\n` +
    `- Plat: ${plate || "-"}\n` +
    `- Keluhan: ${complaint || "-"}\n\n` +
    `Kami akan konfirmasi ketersediaan jadwal. Jika ada perubahan, mohon info ya.`;
  res.json({ text });
});

app.patch("/api/bookings/:id/status", requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};

  if (!status) {
    return res.status(400).json({ error: "Status wajib diisi." });
  }

  try {
    const stepMap = {
      "Menunggu Konfirmasi": 0,
      "Dihubungi": 1,
      "Check-in": 2,
      "Dalam Pengerjaan": 3,
      "Dijadwalkan": 3,
      "Selesai": 4,
      "Batal": 0,
    };
    const defaultSteps = [
      { label: "Diagnosa awal", done: false },
      { label: "Pembongkaran", done: false },
      { label: "Penggantian parts", done: false },
      { label: "Test jalan", done: false },
    ];
    const level = stepMap[status] ?? 0;
    const steps = defaultSteps.map((step, idx) => ({
      ...step,
      done: idx < level && status !== "Batal",
    }));
    const progressPayload = JSON.stringify({
      steps,
      notes: "",
      updatedAt: new Date().toISOString(),
    });

    const stmt = db.prepare(
      `UPDATE bookings SET status = ?, progress = ? WHERE id = ?`
    );
    const result = stmt.run(String(status), progressPayload, String(id));
    if (result.changes === 0) {
      return res.status(404).json({ error: "Booking tidak ditemukan." });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error("Error updating status:", error);
    return res.status(500).json({ error: "Gagal update status." });
  }
});

app.patch("/api/bookings/:id/priority", requireAdmin, (req, res) => {
  const { id } = req.params;
  const { priority } = req.body || {};

  try {
    const stmt = db.prepare(
      `UPDATE bookings SET priority = ? WHERE id = ?`
    );
    const result = stmt.run(String(priority || ""), String(id));
    if (result.changes === 0) {
      return res.status(404).json({ error: "Booking tidak ditemukan." });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error("Error updating priority:", error);
    return res.status(500).json({ error: "Gagal update priority." });
  }
});

app.patch("/api/bookings/:id/progress", requireAdmin, (req, res) => {
  const { id } = req.params;
  const { steps = [], notes = "", parts = [], eta = "", cost = 0, images = [] } = req.body || {};
  if (!Array.isArray(steps)) {
    return res.status(400).json({ error: "Format progress tidak valid." });
  }
  const payload = JSON.stringify({
    steps,
    notes: String(notes || ""),
    parts: Array.isArray(parts) ? parts : [],
    eta: String(eta || ""),
    cost: Number(cost || 0),
    images: Array.isArray(images) ? images : [],
    updatedAt: new Date().toISOString(),
  });
  db.prepare("UPDATE bookings SET progress = ? WHERE id = ?").run(payload, String(id));
  res.json({ ok: true });
});

app.post("/api/bookings/:id/progress/photo", requireAdmin, fileUpload.single("photo"), (req, res) => {
  const { id } = req.params;
  if (!req.file) {
    return res.status(400).json({ error: "File foto wajib diunggah." });
  }
  try {
    const booking = db.prepare("SELECT progress FROM bookings WHERE id = ?").get(String(id));
    if (!booking) {
      return res.status(404).json({ error: "Booking tidak ditemukan." });
    }
    let progress = null;
    if (booking.progress) {
      try {
        progress = JSON.parse(booking.progress);
      } catch {
        progress = null;
      }
    }
    const images = Array.isArray(progress?.images) ? progress.images : [];
    images.push(`/uploads/${req.file.filename}`);
    const payload = JSON.stringify({
      steps: progress?.steps || [],
      notes: progress?.notes || "",
      parts: progress?.parts || [],
      eta: progress?.eta || "",
      cost: progress?.cost || 0,
      images,
      updatedAt: new Date().toISOString(),
    });
    db.prepare("UPDATE bookings SET progress = ? WHERE id = ?").run(payload, String(id));
    res.json({ ok: true, url: `/uploads/${req.file.filename}` });
  } catch (error) {
    console.error("Error upload progress photo:", error);
    res.status(500).json({ error: "Gagal upload foto." });
  }
});

app.patch("/api/bookings/:id/mechanic", requireAdmin, (req, res) => {
  const { id } = req.params;
  const { mechanic } = req.body || {};

  try {
    const stmt = db.prepare(
      `UPDATE bookings SET mechanic = ? WHERE id = ?`
    );
    const result = stmt.run(String(mechanic || ""), String(id));
    if (result.changes === 0) {
      return res.status(404).json({ error: "Booking tidak ditemukan." });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error("Error updating mechanic:", error);
    return res.status(500).json({ error: "Gagal update mekanik." });
  }
});

app.patch("/api/bookings/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  const {
    name,
    phone,
    plate,
    vehicle,
    city,
    status,
    priority,
    mechanic,
    service,
    date,
    time,
    complaint,
  } = req.body || {};

  if (!name || !phone || !plate || !vehicle || !city || !service || !date || !time || !status) {
    return res.status(400).json({
      error: "Nama, no HP, plat, tipe/merek, kota, layanan, tanggal, jam, dan status wajib diisi.",
    });
  }

  try {
    const current = db.prepare("SELECT status, progress FROM bookings WHERE id = ?").get(String(id));
    if (!current) {
      return res.status(404).json({ error: "Booking tidak ditemukan." });
    }

    const stepMap = {
      "Menunggu Konfirmasi": 0,
      "Dihubungi": 1,
      "Check-in": 2,
      "Dalam Pengerjaan": 3,
      "Dijadwalkan": 3,
      "Selesai": 4,
      "Batal": 0,
    };
    const defaultSteps = [
      { label: "Diagnosa awal", done: false },
      { label: "Pembongkaran", done: false },
      { label: "Penggantian parts", done: false },
      { label: "Test jalan", done: false },
    ];
    let existingProgress = null;
    if (current.progress) {
      try {
        existingProgress = JSON.parse(current.progress);
      } catch {
        existingProgress = null;
      }
    }
    const level = stepMap[status] ?? 0;
    const steps = defaultSteps.map((step, idx) => ({
      ...step,
      done: idx < level && status !== "Batal",
    }));
    const progressPayload = JSON.stringify({
      steps,
      notes: existingProgress?.notes || "",
      parts: Array.isArray(existingProgress?.parts) ? existingProgress.parts : [],
      eta: existingProgress?.eta || "",
      cost: Number(existingProgress?.cost || 0),
      images: Array.isArray(existingProgress?.images) ? existingProgress.images : [],
      updatedAt: new Date().toISOString(),
    });

    const stmt = db.prepare(
      `UPDATE bookings
       SET name = ?, phone = ?, plate = ?, vehicle = ?, city = ?, status = ?, priority = ?, mechanic = ?, service = ?, date = ?, time = ?, complaint = ?, progress = ?
       WHERE id = ?`
    );
    const result = stmt.run(
      String(name).trim(),
      String(phone).trim(),
      String(plate).trim().toUpperCase(),
      String(vehicle).trim(),
      String(city).trim(),
      String(status),
      String(priority || ""),
      String(mechanic || ""),
      String(service).trim(),
      String(date).trim(),
      String(time).trim(),
      complaint ? String(complaint).trim() : "",
      progressPayload,
      String(id)
    );
    if (result.changes === 0) {
      return res.status(404).json({ error: "Booking tidak ditemukan." });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error("Error updating booking:", error);
    return res.status(500).json({ error: "Gagal update reservasi." });
  }
});


app.patch("/api/bookings/:id/reschedule", requireAdmin, (req, res) => {
  const { id } = req.params;
  const { date, time, reason } = req.body || {};

  if (!date || !time || !reason) {
    return res
      .status(400)
      .json({ error: "Tanggal, jam, dan alasan wajib diisi." });
  }

  try {
    const booking = db
      .prepare("SELECT id FROM bookings WHERE id = ?")
      .get(String(id));
    if (!booking) {
      return res.status(404).json({ error: "Booking tidak ditemukan." });
    }

    db.prepare("UPDATE bookings SET date = ?, time = ?, status = ? WHERE id = ?")
      .run(String(date), String(time), "Dijadwalkan", String(id));

    res.json({ ok: true });
  } catch (error) {
    console.error("Error reschedule:", error);
    res.status(500).json({ error: "Gagal reschedule." });
  }
});

app.post("/api/admin/bookings/archive", requireAdmin, (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Tidak ada data yang dipilih." });
  }

  const toDelete = ids.map(String);
  const archiveStmt = db.prepare("UPDATE bookings SET archivedAt = ? WHERE id = ?");
  const deleteMany = db.transaction((list) => {
    let removed = 0;
    list.forEach((id) => {
      removed += archiveStmt.run(new Date().toISOString(), id).changes;
    });
    return removed;
  });

  try {
    const archived = deleteMany(toDelete);
    return res.json({ ok: true, archived });
  } catch (error) {
    console.error("Error archive bookings:", error);
    return res.status(500).json({ error: "Gagal mengarsipkan data." });
  }
});

app.post("/api/admin/bookings/restore", requireAdmin, (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Tidak ada data yang dipilih." });
  }
  const restoreStmt = db.prepare("UPDATE bookings SET archivedAt = '' WHERE id = ?");
  const restoreMany = db.transaction((list) => {
    let restored = 0;
    list.forEach((id) => {
      restored += restoreStmt.run(String(id)).changes;
    });
    return restored;
  });
  try {
    const restored = restoreMany(ids);
    return res.json({ ok: true, restored });
  } catch (error) {
    console.error("Error restore bookings:", error);
    return res.status(500).json({ error: "Gagal memulihkan data." });
  }
});

app.post("/api/admin/bookings/permanent-delete", requireAdmin, (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Tidak ada data yang dipilih." });
  }
  const toDelete = ids.map(String);
  const getProgress = db.prepare("SELECT progress FROM bookings WHERE id = ?");
  const delStmt = db.prepare("DELETE FROM bookings WHERE id = ?");
  const filesToRemove = [];
  const deleteMany = db.transaction((list) => {
    let removed = 0;
    list.forEach((id) => {
      const row = getProgress.get(id);
      if (row?.progress) {
        try {
          const progress = JSON.parse(row.progress);
          if (Array.isArray(progress?.images)) {
            progress.images.forEach((img) => {
              if (typeof img === "string" && img.startsWith("/uploads/")) {
                filesToRemove.push(path.join(uploadDir, img.replace("/uploads/", "")));
              }
            });
          }
        } catch {
          // ignore parse error
        }
      }
      removed += delStmt.run(id).changes;
    });
    return removed;
  });
  try {
    const deleted = deleteMany(toDelete);
    filesToRemove.forEach((filePath) => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // ignore file delete error
      }
    });
    return res.json({ ok: true, deleted });
  } catch (error) {
    console.error("Error permanent delete bookings:", error);
    return res.status(500).json({ error: "Gagal menghapus permanen." });
  }
});

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Messages required" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: "OPENAI_API_KEY belum diatur di .env",
    });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = `Kamu adalah asisten booking servis bengkel mobil (Bahasa Indonesia).\n\nTugas utama:\n- Bantu pelanggan membuat reservasi servis.\n- Tanyakan data yang belum lengkap: nama, no HP, plat, jenis layanan, tanggal, jam, keluhan (opsional).\n- Tawarkan pilihan layanan berikut: ${SERVICES.join(", ")}.\n- Gunakan bahasa sopan, ringkas, dan profesional.\n- Setelah data lengkap, minta konfirmasi singkat sebelum pelanggan menekan tombol "Buat Reservasi".\n- Jangan mengarang harga.\n- Jika pelanggan bingung memilih layanan, tanyakan gejala/keluhan.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.slice(-20),
      ],
      temperature: 0.4,
    });

    const reply = completion.choices?.[0]?.message?.content || "";
    res.json({ reply });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Chat agent gagal merespons." });
  }
});

app.use("/api/public", (_req, res) => {
  res.status(404).json({ error: "Endpoint public tidak ditemukan." });
});

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`Bengkel Assistant running on http://localhost:${PORT}`);
});
