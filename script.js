/* ═══════════════════════════════════════════════════════
   Smart Parking System — Main Application Logic
   ═══════════════════════════════════════════════════════ */

const RATE_PER_HOUR = 20;
const SLOT_NUMBER = "01";

const statusLabels = {
  free: "FREE",
  booked: "BOOKED",
  occupied: "OCCUPIED"
};

const emptySlot = {
  status: "free",
  bookedBy: "",
  vehicleNumber: "",
  startTime: "",
  endTime: "",
  price: "",
  bookingId: ""
};

// ─── Bootstrap ───

document.addEventListener("DOMContentLoaded", () => {
  seedDatabaseIfEmpty();
  setupConnectionListener();
  setupBookingModal();
  setupDashboardPage();
  setupBookingPage();
  setupTicketPage();
  setupReleaseSlot();
});

function seedDatabaseIfEmpty() {
  slotRef.once("value").then((snapshot) => {
    if (!snapshot.exists()) {
      return slotRef.set(emptySlot);
    }
    return null;
  });
}

// ─── Firebase Connection Status ───

function setupConnectionListener() {
  const el = document.getElementById("connectionState");
  if (!el) return;

  database.ref(".info/connected").on("value", (snapshot) => {
    if (snapshot.val() === true) {
      el.textContent = "Connected";
      el.classList.remove("offline");
    } else {
      el.textContent = "Connecting";
      el.classList.add("offline");
    }
  });
}

// ─── Dashboard Page ───

function setupDashboardPage() {
  const parkingSlot = document.getElementById("parkingSlot");
  if (!parkingSlot) return;

  slotRef.on("value", (snapshot) => {
    const raw = snapshot.val();
    const data = normalizeSlot(raw);
    updateDashboard(data);
    updateSensorDisplay(raw);
  });
}

function updateDashboard(data) {
  const status = normalizeStatus(data.status);
  const label = statusLabels[status];
  const timing = formatTiming(data.startTime, data.endTime);

  // Stat cards
  setText("liveStatus", label);
  setText("liveBookedBy", data.bookedBy || "None");
  setText("liveVehicle", data.vehicleNumber || "None");
  setText("livePrice", data.price ? `₹${data.price}` : "₹0");

  // Status stat card highlight
  const statCard = document.getElementById("statStatus");
  if (statCard) {
    statCard.classList.remove("booked", "occupied");
    if (status === "booked") statCard.classList.add("booked");
    if (status === "occupied") statCard.classList.add("occupied");
  }

  // Parking bay
  setText("slotStatusText", label);
  const subText = getSlotSubText(status, data);
  setText("slotSubText", subText);
  setStateClass(document.getElementById("parkingSlot"), status);

  // Sidebar details
  setText("liveStatusSide", label);
  const sideStatus = document.getElementById("liveStatusSide");
  if (sideStatus) {
    sideStatus.classList.remove("green", "yellow", "red");
    sideStatus.classList.add(status === "free" ? "green" : status === "booked" ? "yellow" : "red");
  }
  setText("liveBookedBySide", data.bookedBy || "None");
  setText("liveTiming", timing || "Not booked");
  setText("livePriceSide", data.price ? `₹${data.price}` : "₹0");

  // Book button states
  const bookBtns = [document.getElementById("bookNowHero"), document.getElementById("bookNowSide")];
  bookBtns.forEach((btn) => {
    if (!btn) return;
    const canBook = status === "free";
    btn.classList.toggle("disabled", !canBook);
    btn.setAttribute("aria-disabled", String(!canBook));
    if (btn.tagName === "A") {
      const textNode = btn.lastChild || btn;
      if (btn.querySelector(".btn-icon")) {
        // Has SVG icon — only update text node
        const textParts = btn.childNodes;
        if (textParts.length > 1) {
          textParts[textParts.length - 1].textContent = canBook ? " Book Now" : status === "booked" ? " Already Booked" : " Slot Occupied";
        }
      } else {
        btn.textContent = canBook ? "Book Now" : status === "booked" ? "Already Booked" : "Slot Occupied";
      }
    }
  });
}

function updateSensorDisplay(rawData) {
  if (!rawData) return;

  const distance = rawData.lastDistanceCm;
  const lastUpdated = rawData.lastUpdated;

  setText("liveSensorDistance", distance != null ? `${Number(distance).toFixed(1)} cm` : "—");
  setText("liveSensorTime", lastUpdated ? formatSensorTime(lastUpdated) : "—");
  setText("bookingSensorDistance", distance != null ? `${Number(distance).toFixed(1)} cm` : "—");
}

function formatSensorTime(millis) {
  if (typeof millis !== "number" || millis <= 0) return "—";
  const seconds = Math.floor(millis / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

// ─── Booking Modal ───

function setupBookingModal() {
  const modal = document.getElementById("bookingModal");
  const closeButton = document.getElementById("closeBookingModal");

  if (!modal || !closeButton) return;

  closeButton.addEventListener("click", () => closeModal(modal));
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(modal); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(modal); });
}

function closeModal(modal) {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

// ─── Booking Page ───

function setupBookingPage() {
  const form = document.getElementById("bookingForm");
  if (!form) return;

  const startInput = document.getElementById("startTime");
  const endInput = document.getElementById("endTime");
  const submitButton = document.getElementById("confirmBookingBtn");
  const nowLocal = toLocalDateTimeValue(new Date(Date.now() + 5 * 60 * 1000));

  startInput.min = nowLocal;
  endInput.min = nowLocal;
  startInput.value = nowLocal;
  endInput.value = toLocalDateTimeValue(new Date(Date.now() + 65 * 60 * 1000));
  updatePricePreview();
  updateStepIndicator(1);

  startInput.addEventListener("change", () => {
    endInput.min = startInput.value;
    updatePricePreview();
  });

  endInput.addEventListener("change", () => {
    updatePricePreview();
    updateStepIndicator(2);
  });

  form.addEventListener("input", () => {
    const name = document.getElementById("userName").value.trim();
    const vehicle = document.getElementById("vehicleNumber").value.trim();
    if (name && vehicle) updateStepIndicator(2);
  });

  slotRef.on("value", (snapshot) => {
    const raw = snapshot.val();
    const data = normalizeSlot(raw);
    const status = normalizeStatus(data.status);
    setText("bookingLiveStatus", statusLabels[status]);
    setText("bookingStatusText", statusLabels[status]);
    setStateClass(document.getElementById("bookingMiniSlot"), status);
    submitButton.disabled = status !== "free";
    submitButton.textContent = status === "free" ? "Confirm Booking" : "Slot Not Available";
    updateSensorDisplay(raw);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();

    const name = document.getElementById("userName").value.trim();
    const vehicleNumber = document.getElementById("vehicleNumber").value.trim().toUpperCase();
    const startTime = startInput.value;
    const endTime = endInput.value;
    const price = calculatePrice(startTime, endTime);

    if (!name || !vehicleNumber || !startTime || !endTime) {
      showMessage("Please fill all booking details.", "error");
      return;
    }

    if (price <= 0) {
      showMessage("End time must be later than start time.", "error");
      return;
    }

    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="spinner"></span> Saving...';
    updateStepIndicator(3);

    try {
      const bookingId = createBookingId();
      let saved = false;
      const bookingData = {
        status: "booked",
        bookedBy: name,
        vehicleNumber,
        startTime,
        endTime,
        price: String(price),
        bookingId
      };

      await slotRef.transaction((currentData) => {
        const current = normalizeSlot(currentData);
        if (normalizeStatus(current.status) !== "free") return;
        saved = true;
        return bookingData;
      });

      if (!saved) {
        showMessage("Slot was just taken. Please check the dashboard.", "error");
        updateStepIndicator(2);
        return;
      }

      localStorage.setItem("smartParkLastBookingId", bookingId);
      localStorage.setItem("smartParkLastBooking", JSON.stringify(bookingData));
      window.location.href = `ticket.html?bookingId=${encodeURIComponent(bookingId)}`;
    } catch (error) {
      console.error(error);
      showMessage("Booking failed. Check Firebase config and try again.", "error");
      updateStepIndicator(2);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Confirm Booking";
    }
  });
}

function updateStepIndicator(activeStep) {
  const steps = document.querySelectorAll(".step");
  const lines = document.querySelectorAll(".step-line");
  if (!steps.length) return;

  steps.forEach((step, i) => {
    step.classList.remove("active", "completed");
    if (i + 1 < activeStep) step.classList.add("completed");
    else if (i + 1 === activeStep) step.classList.add("active");
  });

  lines.forEach((line, i) => {
    line.classList.toggle("completed", i + 1 < activeStep);
  });
}

// ─── Ticket Page ───

function setupTicketPage() {
  const qrContainer = document.getElementById("qrcode");
  if (!qrContainer) return;

  const requestedId = new URLSearchParams(window.location.search).get("bookingId");
  const lastBookingId = requestedId || localStorage.getItem("smartParkLastBookingId") || "";
  const storedBooking = getStoredBooking();

  slotRef.on("value", (snapshot) => {
    const data = normalizeSlot(snapshot.val());

    if (!data.bookingId && storedBooking && (!lastBookingId || storedBooking.bookingId === lastBookingId)) {
      renderTicket(storedBooking);
      return;
    }

    if (lastBookingId && data.bookingId && data.bookingId !== lastBookingId) {
      if (storedBooking && storedBooking.bookingId === lastBookingId) {
        renderTicket(storedBooking);
        return;
      }
      setText("ticketBookingId", "Booking not found");
      qrContainer.innerHTML = '<span class="qr-message">No booking data</span>';
      return;
    }

    renderTicket(data);
  });

  document.getElementById("downloadTicketBtn").addEventListener("click", () => {
    window.print();
  });
}

function renderTicket(data) {
  const d = normalizeSlot(data);

  setText("ticketBookingId", d.bookingId || "-");
  setText("ticketName", d.bookedBy || "-");
  setText("ticketVehicle", d.vehicleNumber || "-");
  setText("ticketStart", formatDateTime(d.startTime));
  setText("ticketEnd", formatDateTime(d.endTime));
  setText("ticketAmount", d.price ? `₹${d.price}` : "₹0");

  const qrContainer = document.getElementById("qrcode");
  if (!qrContainer) return;
  qrContainer.innerHTML = "";

  if (!d.bookingId) {
    qrContainer.innerHTML = '<span class="qr-message">Book a slot first</span>';
    return;
  }

  // Compact QR payload to stay within size limits
  const qrText = [d.bookingId, d.bookedBy, d.vehicleNumber, `S${SLOT_NUMBER}`, d.startTime, d.endTime, `₹${d.price || 0}`].join("|");

  if (window.QRCode) {
    new QRCode(qrContainer, {
      text: qrText,
      width: 176,
      height: 176,
      colorDark: "#111118",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  } else {
    qrContainer.innerHTML = '<img src="assets/qrcode.png" alt="Parking booking QR code" style="width:176px;height:176px">';
  }
}

// ─── Release Slot ───

function setupReleaseSlot() {
  const resetBtn = document.getElementById("resetSlotBtn");
  const overlay = document.getElementById("releaseConfirm");
  const cancelBtn = document.getElementById("cancelRelease");
  const confirmBtn = document.getElementById("confirmRelease");

  if (!resetBtn || !overlay) return;

  resetBtn.addEventListener("click", () => {
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
  });

  cancelBtn.addEventListener("click", () => closeModal(overlay));
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(overlay); });

  confirmBtn.addEventListener("click", () => {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span class="spinner"></span> Releasing...';
    
    slotRef.set(emptySlot).then(() => {
      closeModal(overlay);
      showToast("Slot released successfully", "success");
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Release Slot";
    }).catch((err) => {
      console.error(err);
      showToast("Failed to release slot", "error");
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Release Slot";
    });
  });
}

// ─── Toast ───

function showToast(message, type) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove("show"), 3000);
}

// ─── Pricing ───

function updatePricePreview() {
  const s = document.getElementById("startTime").value;
  const e = document.getElementById("endTime").value;
  const hrs = calculateDurationHours(s, e);
  const price = calculatePrice(s, e);
  setText("durationText", hrs > 0 ? `${hrs.toFixed(1)} hr` : "0 hr");
  setText("priceText", `₹${price}`);
}

function calculateDurationHours(start, end) {
  const ms = new Date(end) - new Date(start);
  return Number.isFinite(ms) && ms > 0 ? ms / 3600000 : 0;
}

function calculatePrice(start, end) {
  const hrs = calculateDurationHours(start, end);
  return hrs > 0 ? Math.ceil(hrs * RATE_PER_HOUR) : 0;
}

// ─── Utilities ───

function normalizeSlot(data) {
  return { ...emptySlot, ...(data || {}) };
}

function normalizeStatus(status) {
  const s = String(status || "free").toLowerCase();
  return ["free", "booked", "occupied"].includes(s) ? s : "free";
}

function setStateClass(el, status) {
  if (!el) return;
  el.classList.remove("state-free", "state-booked", "state-occupied");
  el.classList.add(`state-${status}`);
}

function getSlotSubText(status, data) {
  if (status === "occupied") return "Vehicle detected by sensor";
  if (status === "booked") return `Reserved ${formatTiming(data.startTime, data.endTime)}`;
  return "Slot is available now";
}

function formatTiming(start, end) {
  if (!start || !end) return "";
  return `${formatDateTime(start)} – ${formatDateTime(end)}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function toLocalDateTimeValue(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

function createBookingId() {
  return `SP-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function getStoredBooking() {
  try {
    const raw = localStorage.getItem("smartParkLastBooking");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function showMessage(msg, type) {
  const el = document.getElementById("formMessage");
  if (el) { el.textContent = msg; el.className = `form-message ${type}`; }
}

function clearMessage() {
  showMessage("", "");
}