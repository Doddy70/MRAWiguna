const chatEl = document.getElementById("chat");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const bookingForm = document.getElementById("booking-form");
const bookingResult = document.getElementById("booking-result");
const serviceSelect = document.getElementById("service-select");
const customerLoginForm = document.getElementById("customer-login-form");
const customerLoginResult = document.getElementById("customer-login-result");
const customerSignupForm = document.getElementById("customer-signup-form");
const customerSignupResult = document.getElementById("customer-signup-result");
const customerName = document.getElementById("customer-name");
const customerUsername = document.getElementById("customer-username");
const customerNameSide = document.querySelectorAll(".customer-name-side");
const customerUsernameSide = document.querySelectorAll(".customer-username-side");
const customerPhone = document.getElementById("customer-phone");
const customerBookingStatus = document.getElementById("customer-booking-status");
const customerBookingsTable = document.querySelector("#customer-bookings-table tbody");
const customerChat = document.getElementById("customer-chat-log");
const customerChatForm = document.getElementById("customer-chat-form");
const customerChatInput = document.getElementById("customer-chat-input");
const customerLogout = document.getElementById("customer-logout");
const customerArticlesList = document.getElementById("customer-articles-list");
const customerVideosList = document.getElementById("customer-videos-list");
const bookingModal = document.getElementById("booking-modal");
const openBookingModal = document.getElementById("open-booking");
const closeBookingModal = document.getElementById("close-booking-modal");
const customerBookingForm = document.getElementById("customer-booking-form");
const customerBookingResult = document.getElementById("customer-booking-result");
const customerServiceSelect = document.getElementById("customer-service-select");
const serviceTrackingList = document.getElementById("service-tracking-list");

const messages = [
  {
    role: "assistant",
    content:
      "Halo! Saya siap bantu booking servis. Boleh info nama, no HP, plat, layanan, tanggal, dan jam?",
  },
];

function renderMessages() {
  if (!chatEl) return;
  chatEl.innerHTML = "";
  messages.forEach((msg) => {
    const row = document.createElement("div");
    row.className = `chat-message ${msg.role}`;
    const role = document.createElement("div");
    role.className = "role";
    role.textContent = msg.role === "assistant" ? "AI" : "Anda";
    const text = document.createElement("div");
    text.textContent = msg.content;
    row.appendChild(role);
    row.appendChild(text);
    chatEl.appendChild(row);
  });
  chatEl.scrollTop = chatEl.scrollHeight;
}

async function loadServices() {
  try {
    const res = await fetch("/api/services");
    const data = await res.json();
    serviceSelect.innerHTML = data.services
      .map((service) => `<option value="${service}">${service}</option>`)
      .join("");
  } catch (error) {
    console.error(error);
  }
}

if (chatForm) {
  chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = chatInput.value.trim();
  if (!content) return;

  messages.push({ role: "user", content });
  renderMessages();
  chatInput.value = "";

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Chat gagal");
    }
    messages.push({ role: "assistant", content: data.reply });
    renderMessages();
  } catch (error) {
    messages.push({
      role: "assistant",
      content:
        "Maaf, chat sedang bermasalah. Silakan isi form reservasi di samping.",
    });
    renderMessages();
  }
  });
}

if (bookingForm) {
  bookingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (bookingResult) bookingResult.textContent = "";

  const formData = new FormData(bookingForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Gagal menyimpan reservasi");
    }

    if (bookingResult) {
      bookingResult.textContent =
        "Reservasi tersimpan. Tim kami akan menghubungi Anda untuk konfirmasi.";
    }
    bookingForm.reset();
  } catch (error) {
    if (bookingResult) bookingResult.textContent = error.message;
  }
  });
}

if (serviceSelect) loadServices();
renderMessages();

const customerMessages = [
  {
    role: "assistant",
    content:
      "Halo! Saya asisten bengkel. Tanyakan status booking atau keluhan mobil kamu di sini.",
  },
];
let cachedCustomerBookings = [];

function renderCustomerMessages() {
  if (!customerChat) return;
  const preview = customerMessages.slice(-3);
  customerChat.innerHTML = preview
    .map(
      (msg) =>
        `<div class="chat-preview-row ${msg.role}"><span>${msg.role === "assistant" ? "AI" : "Anda"}:</span> ${msg.content}</div>`
    )
    .join("");
}

async function loadCustomerArticles() {
  if (!customerArticlesList) return;
  customerArticlesList.innerHTML = "<p>Memuat artikel...</p>";
  try {
    const res = await fetch("/api/public/wp-posts?limit=6");
    const raw = await res.text();
    let data = {};
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        `Gagal memuat artikel. Server tidak mengembalikan JSON (status ${res.status}).`
      );
    }
    if (!res.ok) throw new Error(data.error || "Gagal memuat artikel.");
    const posts = data.posts || [];
    if (!posts.length) {
      customerArticlesList.innerHTML = "<p>Belum ada artikel.</p>";
      return;
    }
    customerArticlesList.innerHTML = posts
      .map(
        (post) => `
          <article class="media-card">
            ${post.image ? `<img src="${post.image}" alt="${post.title}" class="media-thumb" />` : ""}
            <h3>${post.title}</h3>
            <p>${post.excerpt}</p>
            <a class="media-link" href="${post.link}" target="_blank" rel="noopener">Read more →</a>
          </article>
        `
      )
      .join("");
  } catch (error) {
    customerArticlesList.innerHTML = `<p>${error.message}</p>`;
  }
}

async function loadCustomerVideos() {
  if (!customerVideosList) return;
  customerVideosList.innerHTML = "<p>Memuat video...</p>";
  try {
    const res = await fetch("/api/public/youtube-videos?limit=6");
    const raw = await res.text();
    let data = {};
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        `Gagal memuat video. Server tidak mengembalikan JSON (status ${res.status}).`
      );
    }
    if (!res.ok) throw new Error(data.error || "Gagal memuat video.");
    const videos = data.videos || [];
    if (!videos.length) {
      customerVideosList.innerHTML = "<p>Belum ada video.</p>";
      return;
    }
    customerVideosList.innerHTML = videos
      .map(
        (video) => `
          <article class="media-card">
            ${video.thumbnail ? `<img src="${video.thumbnail}" alt="${video.title}" class="media-thumb" />` : ""}
            <h3>${video.title}</h3>
            <p>${video.published}</p>
            <a class="media-link" href="${video.link}" target="_blank" rel="noopener">Tonton di YouTube →</a>
          </article>
        `
      )
      .join("");
  } catch (error) {
    customerVideosList.innerHTML = `<p>${error.message}</p>`;
  }
}

async function loadCustomerProfile() {
  if (!customerName && customerNameSide.length === 0) return;
  const res = await fetch("/api/customers/me");
  if (!res.ok) {
    window.location.href = "/customer-login.html";
    return;
  }
  const data = await res.json();
  if (data.customer) {
    if (customerName) customerName.textContent = data.customer.name;
    if (customerUsername) customerUsername.textContent = data.customer.username;
    if (customerPhone) customerPhone.textContent = data.customer.phone;
    customerNameSide.forEach((el) => (el.textContent = data.customer.name));
    customerUsernameSide.forEach((el) => (el.textContent = data.customer.username));
  }
}

async function loadCustomerBookings() {
  try {
    const res = await fetch("/api/customers/bookings");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal memuat booking");
    cachedCustomerBookings = data.bookings || [];
    renderServiceTracking();
  } catch (error) {
    if (customerBookingStatus) customerBookingStatus.textContent = error.message;
  }
}

async function loadCustomerServices() {
  if (!customerServiceSelect) return;
  try {
    const res = await fetch("/api/services");
    const data = await res.json();
    customerServiceSelect.innerHTML = data.services
      .map((service) => `<option value="${service}">${service}</option>`)
      .join("");
  } catch (error) {
    console.error(error);
  }
}

function renderServiceTracking() {
  if (!serviceTrackingList) return;
  const trackingBookings = cachedCustomerBookings.filter((b) => {
    const progress = parseProgress(b.progress);
    return (
      b.status === "Check-in" ||
      b.status === "Dalam Pengerjaan" ||
      (progress && Array.isArray(progress.steps) && progress.steps.length > 0)
    );
  });

  if (!trackingBookings.length) {
    const hasBookings = cachedCustomerBookings.length > 0;
    serviceTrackingList.innerHTML = hasBookings
      ? "<p class=\"chat-hint\">Booking kamu masih menunggu <strong>check-in</strong> dari bengkel. Progress akan muncul setelah check-in.</p>"
      : "<p class=\"chat-hint\">Belum ada progres servis yang bisa ditinjau.</p>";
    return;
  }

  serviceTrackingList.innerHTML = trackingBookings
    .map((b) => {
      const progress = parseProgress(b.progress);
      const steps =
        progress?.steps?.length
          ? progress.steps
          : [
              { label: "Diagnosa awal", done: ["Dihubungi", "Dijadwalkan", "Selesai"].includes(b.status) },
              { label: "Pembongkaran", done: ["Dijadwalkan", "Selesai"].includes(b.status) },
              { label: "Penggantian parts", done: b.status === "Selesai" },
              { label: "Test jalan", done: b.status === "Selesai" },
            ];
      return `
        <details class="tracking-card" open>
          <summary class="tracking-header">
            <div>
              <strong>${b.service}</strong>
              <span>${b.plate} • ${b.vehicle}</span>
            </div>
            <span class="tracking-icon">▾</span>
            <span class="status-pill status-${b.status.replace(/\s+/g, '').toLowerCase()}">${b.status}</span>
          </summary>
          <div class="tracking-body">
            <div class="stepper">
              ${(() => {
                const currentIndex = steps.findIndex((s) => !s.done);
                const activeIndex = currentIndex === -1 ? steps.length - 1 : currentIndex;
                const iconMap = {
                  "Diagnosa awal": "🩺",
                  Pembongkaran: "🧰",
                  "Penggantian parts": "⚙️",
                  "Test jalan": "🚗",
                };
                return steps
                  .map((s, idx) => {
                    const isDone = s.done;
                    const isCurrent = idx === activeIndex;
                    const icon = iconMap[s.label] || "🔧";
                    const isLast = idx === steps.length - 1;
                    const connectorClass = isDone || isCurrent ? "connector active" : "connector";
                    return `
                      <div class="step ${isDone ? "done" : ""} ${isCurrent ? "current" : ""}">
                        <div class="step-dot"><span>${icon}</span></div>
                        <div class="step-label">${s.label}</div>
                        ${isLast ? "" : `<div class="${connectorClass}"></div>`}
                      </div>
                    `;
                  })
                  .join("");
              })()}
            </div>
            <div class="stepper-bar">
              <div class="stepper-progress" style="width: ${getProgressPercent(b.status, progress)}%"></div>
            </div>
            <div class="tracking-notes">
              <strong>Laporan pekerjaan</strong>
              <ul>
                ${
                  progress?.notes
                    ? `<li>${progress.notes}</li>`
                    : "<li>Checklist keluhan dan estimasi waktu.</li><li>Catatan parts akan tampil saat mekanik update.</li>"
                }
              </ul>
            </div>
            ${
              progress?.images?.length
                ? `<div class="progress-gallery">
                     ${progress.images
                       .map(
                         (src) =>
                           `<button type="button" class="thumb-btn" data-src="${src}">
                              <img src="${src}" alt="Progress foto" />
                            </button>`
                       )
                       .join("")}
                   </div>`
                : ""
            }
          </div>
        </details>
      `;
    })
    .join("");
}


function getProgressPercent(status, progress) {
  if (progress?.steps?.length) {
    const done = progress.steps.filter((s) => s.done).length;
    return Math.round((done / progress.steps.length) * 100);
  }
  if (status === "Menunggu Konfirmasi") return 25;
  if (status === "Dihubungi") return 50;
  if (status === "Dijadwalkan") return 75;
  if (status === "Selesai") return 100;
  if (status === "Batal") return 0;
  return 20;
}

function parseProgress(progress) {
  if (!progress) return null;
  try {
    return JSON.parse(progress);
  } catch (error) {
    return null;
  }
}


document.addEventListener("click", (event) => {
  const btn = event.target.closest(".thumb-btn");
  if (!btn) return;
  const src = btn.getAttribute("data-src");
  if (!src) return;
  const overlay = document.createElement("div");
  overlay.className = "lightbox";
  overlay.innerHTML = `<img src="${src}" alt="Progress foto" />`;
  overlay.addEventListener("click", () => overlay.remove());
  document.body.appendChild(overlay);
});

if (customerLoginForm) {
  customerLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    customerLoginResult.textContent = "";
    const formData = new FormData(customerLoginForm);
    const payload = Object.fromEntries(formData.entries());
    try {
      const res = await fetch("/api/customers/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login gagal");
      window.location.href = "/customer.html";
    } catch (error) {
      customerLoginResult.textContent = error.message;
    }
  });
}

if (customerSignupForm) {
  customerSignupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    customerSignupResult.textContent = "";
    const formData = new FormData(customerSignupForm);
    const payload = Object.fromEntries(formData.entries());
    try {
      const res = await fetch("/api/customers/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup gagal");
      window.location.href = "/customer.html";
    } catch (error) {
      customerSignupResult.textContent = error.message;
    }
  });
}

if (customerChatForm) {
  renderCustomerMessages();
  customerChatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = customerChatInput.value.trim();
    if (!content) return;
    customerMessages.push({ role: "user", content });
    renderCustomerMessages();
    customerChatInput.value = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: customerMessages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat gagal");
      customerMessages.push({ role: "assistant", content: data.reply });
      renderCustomerMessages();
    } catch (error) {
      customerMessages.push({
        role: "assistant",
        content: "Maaf, chat sedang bermasalah. Silakan coba lagi.",
      });
      renderCustomerMessages();
    }
  });
}

if (customerName || customerNameSide.length > 0) {
  loadCustomerProfile();
  loadCustomerBookings();
  loadCustomerServices();
  renderCustomerMessages();
  loadCustomerArticles();
  loadCustomerVideos();
}

if (customerLogout) {
  customerLogout.addEventListener("click", async () => {
    await fetch("/api/customers/logout", { method: "POST" });
    window.location.href = "/customer-login.html";
  });
}

openBookingModal?.addEventListener("click", () => {
  bookingModal.setAttribute("aria-hidden", "false");
});

closeBookingModal?.addEventListener("click", () => {
  bookingModal.setAttribute("aria-hidden", "true");
});

bookingModal?.addEventListener("click", (event) => {
  if (event.target === bookingModal) {
    bookingModal.setAttribute("aria-hidden", "true");
  }
});

customerBookingForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (customerBookingResult) customerBookingResult.textContent = "";
  const formData = new FormData(customerBookingForm);
  const payload = Object.fromEntries(formData.entries());
  try {
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal membuat booking");
    customerBookingResult.textContent = "Booking berhasil dikirim.";
    customerBookingForm.reset();
    loadCustomerBookings();
  } catch (error) {
    customerBookingResult.textContent = error.message;
  }
});
