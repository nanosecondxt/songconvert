const form = document.querySelector("#form");
const input = document.querySelector("#audio");
const drop = document.querySelector("#drop");
const fileText = document.querySelector("#fileText");
const title = document.querySelector("#title");
const rights = document.querySelector("#rights");
const button = document.querySelector("#convert");
const status = document.querySelector("#status");

function refresh() {
  button.disabled = !(input.files.length && rights.checked);
}

input.addEventListener("change", () => {
  if (input.files[0]) {
    fileText.textContent = input.files[0].name;
    if (!title.value) {
      title.value = input.files[0].name.replace(/\.[^/.]+$/, "");
    }
  }
  refresh();
});

rights.addEventListener("change", refresh);

["dragenter", "dragover"].forEach(type => {
  drop.addEventListener(type, e => {
    e.preventDefault();
    drop.classList.add("drag");
  });
});

["dragleave", "drop"].forEach(type => {
  drop.addEventListener(type, e => {
    e.preventDefault();
    drop.classList.remove("drag");
  });
});

drop.addEventListener("drop", e => {
  const dt = e.dataTransfer;
  if (!dt.files.length) return;
  input.files = dt.files;
  input.dispatchEvent(new Event("change"));
});

form.addEventListener("submit", async e => {
  e.preventDefault();
  button.disabled = true;
  status.className = "status";
  status.textContent = "Converting…";

  try {
    const data = new FormData(form);
    const response = await fetch("/api/convert", { method: "POST", body: data });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Conversion failed.");
    }

    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/i);
    const filename = match ? match[1] : `${title.value || "converted"}.mp3`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    status.className = "status good";
    status.textContent = "Done — your MP3 was created and the temporary server files were removed.";
  } catch (err) {
    status.className = "status bad";
    status.textContent = err.message;
  } finally {
    refresh();
  }
});