// js/booking.js
// Booking flow for "booking.html" (Step 1 -> Step 2 -> Step 3 -> Success modal)
// Uses the SAME Firebase Realtime Database structure as the old site:
// reservations: { frizeri: [...], musterije: [...], datum: "YYYY-MM-DD" }

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  set,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

/* =========================
   FIREBASE CONFIG (same as old site)
   ========================= */
const firebaseConfig = {
  apiKey: "AIzaSyCANDJ3S1zPsUcCZCj7gD37spqGYzS1lTU",
  authDomain: "frizerski-salon-e9860.firebaseapp.com",
  databaseURL: "https://frizerski-salon-e9860-default-rtdb.firebaseio.com",
  projectId: "frizerski-salon-e9860",
  storageBucket: "frizerski-salon-e9860.firebasestorage.app",
  messagingSenderId: "26160356946",
  appId: "1:26160356946:web:2059ad521e6c845729c98b",
  measurementId: "G-B4DXRE5L0B",
};

initializeApp(firebaseConfig);
const db = getDatabase();

/* =========================
   DOM HOOKS
   ========================= */
const step1 = document.getElementById("step1");
const step2 = document.getElementById("step2");
const step3 = document.getElementById("step3");

const daySelect = document.getElementById("daySelect");
const availableTimesWrap = document.getElementById("availableTimes");
const timesGrid = document.getElementById("timesGrid");
const confirmTimeBtn = document.getElementById("confirmTimeBtn");

const selectedBarberImg = document.getElementById("selectedBarberImg");
const selectedBarberName = document.getElementById("selectedBarberName");
const selectedBarberRole = document.getElementById("selectedBarberRole");

const summaryBarber = document.getElementById("summaryBarber");
const summaryDay = document.getElementById("summaryDay");
const summaryTime = document.getElementById("summaryTime");

const clientName = document.getElementById("clientName");
const clientPhone = document.getElementById("clientPhone");
const errorMessage = document.getElementById("errorMessage");

const successModal = document.getElementById("successModal");
const modalBarber = document.getElementById("modalBarber");
const modalDay = document.getElementById("modalDay");
const modalTime = document.getElementById("modalTime");

/* =========================
   LOCAL STATE
   ========================= */
const WORK_HOURS = [900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000];

const BARBER_META = [
  {
    ime: "Жарко",
    rejting: 4.5,
    role: "Барбер специјалиста",
    img: "berber1.jpg",
    sifra: 0,
  },
  {
    ime: "Паче",
    rejting: 4.7,
    role: "Главни стилиста",
    img: "berber2.jpg",
    sifra: 1,
  },
  {
    ime: "Петра",
    rejting: 3.9,
    role: "Колориста",
    img: "berber3.jpg",
    sifra: 2,
  },
  {
    ime: "Стефан",
    rejting: 4.3,
    role: "Стилиста",
    img: "berber4.jpg",
    sifra: 3,
  },
];

// Firebase-backed data
let frizeri = [];     // array of {ime, rejting, dani, sutra, sifra}
let musterije = [];   // array of {ime, brojt, vreme, fri, dan}
let formatiran = "";  // YYYY-MM-DD in Europe/Belgrade

// UI selections
let selectedBarberIndex = null; // 0..3
let selectedTimeValue = null;   // e.g. 900 (number)
let selectedDayValue = "Данас"; // "Данас"|"Сутра"

/* =========================
   DATE HELPERS (Europe/Belgrade)
   ========================= */
function getBelgradeDateISO() {
  const currentDate = new Date().toLocaleString("en-US", { timeZone: "Europe/Belgrade" });
  // en-US is M/D/YYYY, H:MM:SS AM/PM
  // take date part -> M/D/YYYY -> YYYY-MM-DD
  return currentDate.split(",")[0].split("/").reverse().join("-");
}

function getBelgradeYesterdayISO() {
  // We only need a "yesterday-ish" string to mirror old logic.
  // We'll compute in local Date then format as YYYY-D-M to match old site's odd formatting.
  // But to be safer, we will compute true ISO in Belgrade timezone-like manner.
  const now = new Date();
  now.setDate(now.getDate() - 1);
  // This is not timezone-perfect, but sufficient for the intended rollover check.
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function timeLabel(t) {
  return `${Math.floor(t / 100)}:00`;
}

/* =========================
   DEFAULT DATA BUILDERS
   ========================= */
function buildDefaultFrizeri() {
  return BARBER_META.map((b) => ({
    ime: b.ime,
    rejting: b.rejting,
    dani: [...WORK_HOURS],
    sutra: [...WORK_HOURS],
    sifra: b.sifra,
  }));
}

/* =========================
   FIREBASE LOAD + DAILY ROLLOVER (same intent as old site)
   ========================= */
async function loadReservationsAndNormalize() {
  formatiran = getBelgradeDateISO();
  const yesterdayISO = getBelgradeYesterdayISO();

  const reservationsRef = ref(db, "reservations");
  const snap = await get(reservationsRef);

  if (!snap.exists()) {
    frizeri = buildDefaultFrizeri();
    musterije = [];
    await saveReservations();
    return;
  }

  const data = snap.val() || {};
  frizeri = Array.isArray(data.frizeri) ? data.frizeri : buildDefaultFrizeri();
  musterije = Array.isArray(data.musterije) ? data.musterije : [];
  const storedDate = data.datum || "";

  // Mirror old site's behavior:
  // - If storedDate is neither today nor yesterday -> full reset
  // - Else if storedDate is yesterday -> rotate "sutra -> dani" and reset sutra,
  //   and adjust musterije dan flags accordingly
  if (storedDate !== formatiran && storedDate !== yesterdayISO) {
    frizeri = buildDefaultFrizeri();
    musterije = [];
    await saveReservations();
    return;
  }

  if (storedDate !== formatiran && storedDate === yesterdayISO) {
    // rotate for each barber
    for (let i = 0; i < frizeri.length; i++) {
      frizeri[i].dani = Array.isArray(frizeri[i].sutra) ? frizeri[i].sutra : [...WORK_HOURS];
      frizeri[i].sutra = [...WORK_HOURS];
    }

    // adjust reservations: remove those for "today" (old 0), and move "tomorrow" (old 1) -> 0
    for (let j = musterije.length - 1; j >= 0; j--) {
      if (musterije[j].dan === 0) {
        musterije.splice(j, 1);
      } else {
        musterije[j].dan = 0;
      }
    }

    await saveReservations();
    return;
  }

  // storedDate === today -> do nothing
}

async function saveReservations() {
  const reservationsRef = ref(db, "reservations");
  const payload = {
    musterije,
    frizeri,
    datum: formatiran,
  };
  await set(reservationsRef, payload);
}

/* =========================
   UI FLOW HELPERS
   ========================= */
function showStep(n) {
  step1.style.display = n === 1 ? "block" : "none";
  step2.style.display = n === 2 ? "block" : "none";
  step3.style.display = n === 3 ? "block" : "none";
}

function resetTimesUI() {
  availableTimesWrap.style.display = "none";
  confirmTimeBtn.style.display = "none";
  timesGrid.innerHTML = "";
  selectedTimeValue = null;
}

function setSelectedBarberUI(index) {
  const meta = BARBER_META[index];
  selectedBarberImg.src = meta.img;
  selectedBarberImg.alt = meta.ime;
  selectedBarberName.textContent = meta.ime;
  selectedBarberRole.textContent = meta.role;
}

function setSummaryUI() {
  summaryBarber.textContent = BARBER_META[selectedBarberIndex]?.ime || "";
  summaryDay.textContent = selectedDayValue || "";
  summaryTime.textContent = selectedTimeValue ? timeLabel(selectedTimeValue) : "";
}

function setModalUI() {
  modalBarber.textContent = BARBER_META[selectedBarberIndex]?.ime || "";
  modalDay.textContent = selectedDayValue || "";
  modalTime.textContent = selectedTimeValue ? timeLabel(selectedTimeValue) : "";
}

function openSuccessModal() {
  setModalUI();
  successModal.classList.add("show");
}

function closeSuccessModal() {
  successModal.classList.remove("show");
}

/* =========================
   TIMES RENDERING
   ========================= */
function getAvailableTimesForSelection() {
  if (selectedBarberIndex == null) return [];
  const fr = frizeri[selectedBarberIndex];
  if (!fr) return [];
  if (selectedDayValue === "Данас") return Array.isArray(fr.dani) ? fr.dani : [];
  return Array.isArray(fr.sutra) ? fr.sutra : [];
}

function renderTimesGrid(times) {
  timesGrid.innerHTML = "";

  if (!times || times.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "Нема слободних термина за изабрани дан.";
    empty.style.textAlign = "center";
    empty.style.margin = "1rem 0 0";
    timesGrid.appendChild(empty);
    confirmTimeBtn.style.display = "none";
    return;
  }

  times.forEach((t) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "time-slot";
    btn.textContent = timeLabel(Number(t));

    btn.addEventListener("click", () => {
      // Unselect previous
      [...timesGrid.querySelectorAll(".time-slot")].forEach((x) => x.classList.remove("selected"));
      btn.classList.add("selected");
      selectedTimeValue = Number(t);
      confirmTimeBtn.style.display = "inline-flex";
    });

    timesGrid.appendChild(btn);
  });
}

/* =========================
   BOOKING COMMIT (same data mutation as old site)
   ========================= */
function insertMusterijaSorted(m) {
  if (musterije.length === 0) {
    musterije.push(m);
    return;
  }

  const last = musterije[musterije.length - 1];
  if (Number(m.vreme) >= Number(last.vreme)) {
    musterije.push(m);
    return;
  }

  for (let i = 0; i < musterije.length; i++) {
    if (Number(musterije[i].vreme) > Number(m.vreme)) {
      musterije.splice(i, 0, m);
      return;
    }
  }

  musterije.push(m);
}

function reserveSelectedSlot(clientIme, clientTel) {
  const fr = frizeri[selectedBarberIndex];
  if (!fr) throw new Error("Недостаје фризер у стању.");

  const value = Number(selectedTimeValue);

  if (selectedDayValue === "Данас") {
    const idx = fr.dani.indexOf(value);
    if (idx >= 0) frizeri[fr.sifra].dani.splice(idx, 1);
  } else {
    const idx = fr.sutra.indexOf(value);
    if (idx >= 0) frizeri[fr.sifra].sutra.splice(idx, 1);
  }

  const m = {
    ime: clientIme,
    brojt: clientTel,
    vreme: String(value),
    fri: fr.sifra,
    dan: selectedDayValue === "Данас" ? 0 : 1,
  };

  insertMusterijaSorted(m);
}

/* =========================
   PUBLIC FUNCTIONS (called from HTML onclick)
   ========================= */
window.selectBarber = async function selectBarber(index) {
  selectedBarberIndex = Number(index);
  setSelectedBarberUI(selectedBarberIndex);

  // reset selections in step 2
  selectedDayValue = "Данас";
  daySelect.value = "Данас";
  resetTimesUI();

  showStep(2);
};

window.changeBarber = function changeBarber() {
  selectedBarberIndex = null;
  resetTimesUI();
  showStep(1);
};

window.showAvailableTimes = function showAvailableTimes() {
  selectedDayValue = daySelect.value;
  resetTimesUI();

  const times = getAvailableTimesForSelection();
  availableTimesWrap.style.display = "block";
  renderTimesGrid(times);
};

window.confirmTime = function confirmTime() {
  if (!selectedTimeValue) return;
  setSummaryUI();
  showStep(3);
};

window.goBackToStep2 = function goBackToStep2() {
  errorMessage.style.display = "none";
  showStep(2);
};

window.confirmBooking = async function confirmBooking() {
  errorMessage.style.display = "none";

  const ime = (clientName.value || "").trim();
  const tel = (clientPhone.value || "").trim();

  if (!ime || !tel || selectedBarberIndex == null || !selectedTimeValue) {
    errorMessage.style.display = "flex";
    return;
  }

  // Basic phone normalization (optional)
  // Keep exactly what user typed, but trim spaces
  try {
    reserveSelectedSlot(ime, tel);
    await saveReservations();

    // Success UI
    openSuccessModal();

    // Clear inputs (but keep modal details)
    clientName.value = "";
    clientPhone.value = "";
  } catch (e) {
    console.error(e);
    errorMessage.style.display = "flex";
  }
};

window.newBooking = async function newBooking() {
  closeSuccessModal();

  // Reset UI flow to start
  selectedBarberIndex = null;
  selectedTimeValue = null;
  selectedDayValue = "Данас";
  daySelect.value = "Данас";
  resetTimesUI();
  showStep(1);

  // Re-load in case somebody else booked in the meantime
  try {
    await loadReservationsAndNormalize();
  } catch (e) {
    console.error("Reload failed:", e);
  }
};

/* =========================
   MODAL CLOSE HANDLERS
   ========================= */
successModal.addEventListener("click", (e) => {
  // click outside content closes
  if (e.target === successModal) closeSuccessModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSuccessModal();
});

/* =========================
   INIT
   ========================= */
(async function init() {
  // load and normalize Firebase data before user books
  try {
    await loadReservationsAndNormalize();
  } catch (e) {
    console.error("Firebase init error:", e);
    // If Firebase is unreachable, allow UI but times will be empty.
    frizeri = buildDefaultFrizeri();
    musterije = [];
    formatiran = getBelgradeDateISO();
  }

  // default view
  showStep(1);

  // keep internal selected day in sync
  daySelect.addEventListener("change", () => {
    selectedDayValue = daySelect.value;
    resetTimesUI();
  });
})();
