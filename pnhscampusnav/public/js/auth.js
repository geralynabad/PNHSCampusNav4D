const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const authError = document.getElementById("authError");
const toRegister = document.getElementById("toRegister");
const toLogin = document.getElementById("toLogin");
const toRegisterLabel = document.getElementById("toRegisterLabel");
const toLoginLabel = document.getElementById("toLoginLabel");
const guestBtn = document.getElementById("guestBtn");
const authCard = document.querySelector(".auth-card");

function showError(message) {
  authError.textContent = message;
  authError.classList.add("show");
  // Small attention cue — replays the shake if the same error fires twice.
  authCard.classList.remove("shake");
  void authCard.offsetWidth;
  authCard.classList.add("shake");
}
function clearError() {
  authError.textContent = "";
  authError.classList.remove("show", "success");
}
function showNotice(message) {
  authError.textContent = message;
  authError.classList.add("show", "success");
}

function setBusy(form, busy) {
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = busy;
  btn.classList.toggle("is-loading", busy);
}

function goToApp(user) {
  localStorage.setItem("pnhs_token", user.token);
  localStorage.setItem("pnhs_user", JSON.stringify(user.user));
  document.body.classList.add("leaving");
  setTimeout(() => {
    window.location.href = user.user.role === "admin" ? "/admin.html" : "/map.html";
  }, 150);
}

toRegister.addEventListener("click", () => {
  clearError();
  loginForm.classList.add("hidden-form");
  registerForm.classList.remove("hidden-form");
  toRegisterLabel.classList.add("hidden-form");
  toLoginLabel.classList.remove("hidden-form");
});
toLogin.addEventListener("click", () => {
  clearError();
  registerForm.classList.add("hidden-form");
  loginForm.classList.remove("hidden-form");
  toLoginLabel.classList.add("hidden-form");
  toRegisterLabel.classList.remove("hidden-form");
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();
  setBusy(loginForm, true);
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) { setBusy(loginForm, false); return showError(data.error || "Could not sign in."); }
    goToApp(data);
  } catch (err) {
    setBusy(loginForm, false);
    showError("Could not reach the server. Is it running?");
  }
});

// LRN (students) / Staff ID (staff): label and format follow the selected role
const regRole = document.getElementById("regRole");
const regIdLabel = document.getElementById("regIdLabel");
const regIdNumber = document.getElementById("regIdNumber");
function syncIdField() {
  const staff = regRole.value === "staff";
  regIdLabel.textContent = staff ? "Staff ID" : "LRN (12 digits)";
  regIdNumber.placeholder = staff ? "Enter your staff ID" : "e.g. 123456789012";
  regIdNumber.inputMode = staff ? "text" : "numeric";
  regIdNumber.maxLength = staff ? 20 : 12;
  regIdNumber.value = "";
}
regRole.addEventListener("change", syncIdField);
regIdNumber.addEventListener("input", () => {
  if (regRole.value !== "staff") regIdNumber.value = regIdNumber.value.replace(/\D/g, "");
});
syncIdField();

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();
  setBusy(registerForm, true);
  const full_name = document.getElementById("regName").value.trim();
  const username = document.getElementById("regUsername").value.trim();
  const password = document.getElementById("regPassword").value;
  const role = document.getElementById("regRole").value;
  const id_number = regIdNumber.value.trim();
  if (!id_number) { setBusy(registerForm, false); return showError(role === "staff" ? "Staff ID is required." : "LRN is required."); }
  if (role !== "staff" && !/^\d{12}$/.test(id_number)) { setBusy(registerForm, false); return showError("LRN must be exactly 12 digits."); }
  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name, username, password, role, id_number }),
    });
    const data = await res.json();
    if (!res.ok) { setBusy(registerForm, false); return showError(data.error || "Could not create account."); }
    if (data.pending) {
      setBusy(registerForm, false);
      loginForm.classList.remove("hidden-form");
      registerForm.classList.add("hidden-form");
      toLoginLabel.classList.add("hidden-form");
      toRegisterLabel.classList.remove("hidden-form");
      return showNotice(data.message);
    }
    goToApp(data);
  } catch (err) {
    setBusy(registerForm, false);
    showError("Could not reach the server. Is it running?");
  }
});

guestBtn.addEventListener("click", () => {
  localStorage.removeItem("pnhs_token");
  localStorage.removeItem("pnhs_user");
  document.body.classList.add("leaving");
  setTimeout(() => (window.location.href = "/map.html"), 150);
});
