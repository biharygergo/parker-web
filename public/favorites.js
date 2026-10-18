/* Favorites are private to this browser and never sent to a storage service. */
window.setupFavorites = function ({ getCenter, onSelect }) {
  const storageKey = "parker.favorites.v1";
  const control = document.querySelector(".favorites-control");
  const toggle = document.querySelector("#favoritesButton");
  const panel = document.querySelector("#favoritesPanel");
  const list = document.querySelector("#favoritesList");
  const form = document.querySelector("#favoriteForm");
  const nameInput = document.querySelector("#favoriteName");
  const message = document.querySelector("#favoritesMessage");
  let favorites = [];

  function validFavorite(value) {
    return value && typeof value.name === "string" && value.name.trim().length > 0 &&
      value.name.length <= 40 && Number.isFinite(value.lat) && Math.abs(value.lat) <= 90 &&
      Number.isFinite(value.lng) && Math.abs(value.lng) <= 180;
  }

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(saved)) throw new Error("Invalid favorites");
    favorites = saved.filter(validFavorite).map(({ name, lat, lng }) => ({ name, lat, lng }));
  } catch {
    message.textContent = "A kedvencek nem olvashatók. Új hely mentésével újrakezdheted.";
  }

  function close() {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  }

  function persist(next) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      favorites = next;
      return true;
    } catch {
      message.textContent = "A böngésző nem engedi a mentést. A kedvenceid nem változtak.";
      return false;
    }
  }

  function render() {
    list.replaceChildren();
    if (favorites.length === 0) {
      const empty = document.createElement("li");
      empty.className = "favorites-empty";
      empty.textContent = "Még nincs mentett helyed.";
      list.append(empty);
    }
    favorites.forEach((favorite, index) => {
      const row = document.createElement("li");
      const select = document.createElement("button");
      select.type = "button";
      select.className = "favorite-select";
      select.textContent = favorite.name;
      select.setAttribute("aria-label", `Parkolók keresése: ${favorite.name}`);
      select.addEventListener("click", () => {
        onSelect({ lat: favorite.lat, lng: favorite.lng });
        close();
        toggle.focus();
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "favorite-remove";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `${favorite.name} törlése`);
      remove.addEventListener("click", () => {
        if (!persist(favorites.filter((_, candidate) => candidate !== index))) return;
        message.textContent = `${favorite.name} törölve.`;
        render();
        (list.querySelector("button") || nameInput).focus();
      });
      row.append(select, remove);
      list.append(row);
    });
  }

  toggle.addEventListener("click", () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    toggle.setAttribute("aria-expanded", String(opening));
    if (opening) {
      (list.querySelector("button") || nameInput).focus();
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.setCustomValidity("Adj nevet a helynek.");
      nameInput.reportValidity();
      return;
    }
    const center = getCenter();
    if (!validFavorite({ name, ...center })) return;
    if (favorites.some((favorite) => favorite.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      message.textContent = "Ez a név már létezik. Válassz másik nevet, vagy töröld a régi helyet.";
      return;
    }
    if (!persist([...favorites, { name, lat: center.lat, lng: center.lng }])) return;
    message.textContent = `${name} elmentve.`;
    nameInput.value = "";
    render();
  });
  nameInput.addEventListener("input", () => nameInput.setCustomValidity(""));
  document.addEventListener("click", (event) => {
    if (!event.composedPath().includes(control)) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      close();
      toggle.focus();
    }
  });
  render();
};
