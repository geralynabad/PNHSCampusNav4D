function initLogoutConfirmation(button, onConfirm) {
  const dialog = document.getElementById("logoutDialog");
  const cancelButton = document.getElementById("logoutCancel");
  const confirmButton = document.getElementById("logoutConfirm");

  function close() {
    dialog.classList.add("hidden-form");
    dialog.setAttribute("aria-hidden", "true");
  }

  button.addEventListener("click", () => {
    dialog.classList.remove("hidden-form");
    dialog.setAttribute("aria-hidden", "false");
    cancelButton.focus();
  });
  cancelButton.addEventListener("click", close);
  confirmButton.addEventListener("click", () => {
    close();
    onConfirm();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
}
