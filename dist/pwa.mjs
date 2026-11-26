const installButton = document.getElementById("install-app");
const installHelp = document.getElementById("install-help");
const displayMode = window.matchMedia("(display-mode: standalone)");
let installPrompt;
let installed = false;

function updateInstallButton() {
  installButton.hidden = installed || displayMode.matches || navigator.standalone === true;
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  updateInstallButton();
});

window.addEventListener("appinstalled", () => {
  installed = true;
  installPrompt = null;
  updateInstallButton();
});

displayMode.addEventListener("change", updateInstallButton);
updateInstallButton();

installButton.addEventListener("click", async () => {
  if (installPrompt) {
    const prompt = installPrompt;
    installPrompt = null;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") {
        installed = true;
        updateInstallButton();
      }
      return;
    } catch {
      // Some browser contexts only offer installation through their menu.
    }
  }
  installHelp.showModal();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register(new URL("./sw.js", import.meta.url), { updateViaCache: "none" }).catch(() => {
    // The browser version remains available if offline storage is disabled.
  });
}
