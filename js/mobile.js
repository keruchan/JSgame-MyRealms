"use strict";

window.RealmfrontMobile = (() => {
  let blocked = false,
    touch = false,
    onChange = () => {};
  const buttons = ["fullscreen", "startFullscreen", "rotateFullscreen"].map(
    (id) => document.getElementById(id),
  );
  const status = document.getElementById("fullscreenStatus");
  const saleDialog = document.getElementById("touchSellDialog");
  let saleCallback = null;
  // Activate a stationary finger release immediately. Some browsers defer the
  // compatibility click after a canvas gesture; suppress that later duplicate.
  const presses = new Map();
  const canvasClicks = new Map();
  let canvasFallbackUntil = 0;
  const activated = new WeakMap();
  document.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    canvasClicks.delete(event.pointerId);
    canvasFallbackUntil = 0;
    const button = event.target.closest("#touchControls > button, #mobileUnitCommands > button, #touchDeselect, #gameTitle, #timeStat");
    if (button && !button.disabled) presses.set(event.pointerId, { button, x: event.clientX, y: event.clientY });
  }, true);
  document.addEventListener("pointercancel", (event) => presses.delete(event.pointerId), true);
  document.addEventListener("pointerup", (event) => {
    const press = presses.get(event.pointerId);
    presses.delete(event.pointerId);
    if (!press || press.button.disabled || !press.button.isConnected ||
      event.target.closest("button") !== press.button || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) return;
    event.preventDefault();
    activated.set(press.button, performance.now());
    press.button.click();
  }, true);
  document.addEventListener("click", (event) => {
    const canvasTime = canvasClicks.get(event.pointerId);
    if (event.isTrusted && event.detail > 0 &&
      ((canvasTime !== undefined && performance.now() - canvasTime < 750) ||
        (!("pointerId" in event) && performance.now() < canvasFallbackUntil))) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const time = activated.get(event.target.closest("button"));
    if (event.isTrusted && event.detail > 0 && time !== undefined && performance.now() - time < 750) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  saleDialog.addEventListener("close", () => {
    if (!saleDialog.open) saleCallback = null;
  });
  saleDialog.querySelector("form").addEventListener("submit", (event) => {
    event.preventDefault();
    const result = event.submitter?.value || "cancel", callback = saleCallback;
    saleCallback = null;
    saleDialog.close(result);
    if (result === "sell") callback?.();
  });
  const header = document.querySelector(".top");
  function sizeHeader() {
    document.documentElement.style.setProperty("--game-header-bottom", `${header.getBoundingClientRect().bottom}px`);
  }
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(sizeHeader).observe(header);
  const roster = document.getElementById("actions").parentElement;
  const movable = [
    [roster, document.getElementById("mobileActionHost")],
    [document.getElementById("factionsAlive"), document.querySelector(".worldwrap")],
    [document.getElementById("touchAttack"), document.getElementById("mobileUnitCommands")],
    [document.getElementById("touchStop"), document.getElementById("mobileUnitCommands")],
  ].map(([element, destination]) => {
    const home = document.createComment("Desktop control position");
    element.before(home);
    return { element, destination, home };
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      presses.clear();
      canvasClicks.clear();
      canvasFallbackUntil = 0;
      if (saleDialog.open) saleDialog.close("cancel");
    }
  });
  const fullscreenElement = () =>
    document.fullscreenElement || document.webkitFullscreenElement;
  function update() {
    touch =
      matchMedia("(pointer: coarse)").matches ||
      (navigator.maxTouchPoints > 0 &&
        Math.min(innerWidth, innerHeight) <= 900);
    blocked = touch && innerHeight > innerWidth;
    document.body.classList.toggle("touch-ui", touch);
    for (const { element, destination, home } of movable) {
      if (touch && element.parentElement !== destination) destination.append(element);
      else if (!touch && element.parentNode !== home.parentNode) home.after(element);
    }
    if (blocked && saleDialog.open) saleDialog.close("cancel");
    document.querySelector(".minimap-hint").textContent = touch ? "Tap or drag map to navigate" : "Click map to move camera";
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
    sizeHeader();
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
  window.visualViewport?.addEventListener("resize", update);
  update();
  return {
    get blocked() {
      return blocked;
    },
    get touch() {
      return touch;
    },
    get confirmingSale() { return saleDialog.open; },
    suppressCanvasClick(pointerId) {
      const now = performance.now();
      for (const [id, time] of canvasClicks) if (now - time > 750) canvasClicks.delete(id);
      canvasClicks.set(pointerId, now);
      canvasFallbackUntil = now + 750;
    },
    confirmSale(description, callback) {
      if (saleDialog.open) return;
      document.getElementById("touchSellDescription").textContent = description;
      saleCallback = callback;
      saleDialog.returnValue = "";
      saleDialog.showModal();
    },
    setup(callback) {
      onChange = callback;
      update();
    },
  };
})();
