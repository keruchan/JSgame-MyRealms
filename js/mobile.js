"use strict";

window.RealmfrontMobile = (() => {
  let blocked = false,
    touch = false,
    onChange = () => {};
  const buttons = ["fullscreen", "startFullscreen", "rotateFullscreen"].map(
    (id) => document.getElementById(id),
  );
  const status = document.getElementById("fullscreenStatus");
  const fullscreenElement = () =>
    document.fullscreenElement || document.webkitFullscreenElement;
  function update() {
    touch =
      matchMedia("(pointer: coarse)").matches ||
      (navigator.maxTouchPoints > 0 &&
        Math.min(innerWidth, innerHeight) <= 900);
    blocked = touch && innerHeight > innerWidth;
    document.body.classList.toggle("touch-ui", touch);
    document
      .getElementById("landscapePrompt")
      .classList.toggle("hidden", !blocked);
    if (blocked) window.RealmfrontHelp?.close();
    for (const button of buttons) {
      const active = !!fullscreenElement();
      button.setAttribute("aria-pressed", String(active));
      button.textContent = active
        ? "Exit fullscreen"
        : button.id === "rotateFullscreen"
          ? "Fullscreen & Landscape"
          : "Fullscreen";
    }
    onChange();
  }
  async function toggleFullscreen() {
    try {
      if (fullscreenElement()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        await exit.call(document);
        try {
          screen.orientation?.unlock?.();
        } catch {}
      } else {
        const root = document.documentElement;
        const enter = root.requestFullscreen || root.webkitRequestFullscreen;
        if (!enter) {
          showStatus(
            "Fullscreen is unavailable in this browser. You can still play by rotating your device to landscape.",
          );
          return;
        }
        await enter.call(root);
        if (touch) {
          try {
            await screen.orientation?.lock?.("landscape");
          } catch {
            showStatus(
              "Fullscreen is on. Rotate your device to landscape if it did not turn automatically.",
            );
          }
        }
      }
    } catch {
      showStatus(
        "Fullscreen could not start. Try the button again, or play in landscape in your browser.",
      );
    }
    update();
  }
  function showStatus(text) {
    status.textContent = text;
    document.getElementById("startFullscreenStatus").textContent = text;
    window.dispatchEvent(
      new CustomEvent("realmfront:notice", { detail: text }),
    );
  }
  for (const button of buttons)
    button.addEventListener("click", toggleFullscreen);
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);
  document.addEventListener("fullscreenchange", update);
  document.addEventListener("webkitfullscreenchange", update);
  update();
  return {
    get blocked() {
      return blocked;
    },
    get touch() {
      return touch;
    },
    setup(callback) {
      onChange = callback;
      update();
    },
  };
})();
