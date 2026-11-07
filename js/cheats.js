"use strict";

window.RealmfrontCheats = (() => {
  const button = document.getElementById("cheatButton"),
    panel = document.getElementById("cheatPanel");
  const amount = document.getElementById("cheatAmount"),
    fast = document.getElementById("fastTraining"),
    status = document.getElementById("cheatStatus"),
    army = document.getElementById("cheatArmySlots");
  let visible = false,
    step = 0,
    hooks = {};
  const resourceButtons = [...panel.querySelectorAll("[data-cheat-resource]")];
  function close() {
    panel.classList.add("hidden");
    button.setAttribute("aria-expanded", "false");
  }
  function refresh() {
    const state = hooks.getState?.(),
      active = !!state && !state.ended;
    for (const control of [...resourceButtons, fast])
      control.disabled = !active;
    fast.checked = !!state?.cheats.fastTraining;
    army.disabled = !active || state.factions[0].cap >= 100;
  }
  document.addEventListener("click", (event) => {
    if (window.RealmfrontMobile?.blocked) {
      step = 0;
      close();
      return;
    }
    const title = event.target.closest("#realmfrontTitle"),
      time = event.target.closest("#timeStat");
    if (step < 5 && title) step++;
    else if (step === 5 && time) step = 6;
    else if (step === 6 && title) {
      visible = !visible;
      step = 0;
      button.classList.toggle("hidden", !visible);
      if (!visible) close();
      hooks.notice?.(visible ? "Cheat button unlocked" : "Cheat button hidden");
    } else step = title ? 1 : 0;
    if (!panel.contains(event.target) && !button.contains(event.target))
      close();
  });
  button.onclick = () => {
    if (!visible) return;
    const opening = panel.classList.contains("hidden");
    panel.classList.toggle("hidden", !opening);
    button.setAttribute("aria-expanded", String(opening));
    refresh();
    const state = hooks.getState?.();
    status.textContent =
      state && !state.ended
        ? "Add resources, army slots, or toggle fast training."
        : "Start a skirmish to use cheats.";
  };
  document.getElementById("closeCheats").onclick = close;
  panel.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      button.focus();
    }
  });
  amount.addEventListener("input", () => amount.setCustomValidity(""));
  for (const control of resourceButtons)
    control.onclick = () => {
      if (!visible) return;
      const value = Number(amount.value);
      if (
        amount.value.trim() === "" ||
        !Number.isSafeInteger(value) ||
        value < 1 ||
        value > 1000000000
      ) {
        amount.setCustomValidity(
          "Enter a whole number from 1 to 1,000,000,000.",
        );
        amount.reportValidity();
        return;
      }
      amount.setCustomValidity("");
      if (hooks.addResource?.(control.dataset.cheatResource, value))
        status.textContent = `Added ${value.toLocaleString()} ${control.dataset.cheatResource === "wood" ? "lumber" : control.dataset.cheatResource}.`;
    };
  fast.onchange = () => {
    if (!visible || !hooks.setFastTraining?.(fast.checked)) {
      refresh();
      return;
    }
    status.textContent = fast.checked
      ? "Fast training enabled: your recruitment runs at 20× speed."
      : "Fast training disabled: normal training speed restored.";
  };
  army.onclick = () => {
    if (!visible) return;
    const added = hooks.addArmySlots?.() || 0;
    status.textContent = added
      ? `Added ${added} army slots without houses.`
      : "Army capacity is already at the 100-unit limit.";
    refresh();
  };
  return {
    setup(value) {
      hooks = value;
      refresh();
    },
    refresh,
    close,
    get visible() {
      return visible;
    },
  };
})();
