/* =========================================================================
   ArcApp Photo Logger
   =========================================================================
   Loaded by the main dashboard via <script src="photo-logger.js" defer>.
   Does nothing on page load except define window.ArcAppPhotoLogger — all the
   Google Identity Services / Drive plumbing only spins up the first time
   .open() is actually called, so it never slows down the dashboard itself.

   Behavior:
   - Desktop (no touch): resolves the Activity → Asset → Date folder chain in
     Drive, then opens that folder directly in a new tab. No in-app camera UI.
   - iPad / phone / touch devices: opens an in-page modal with two clear
     options — "Take New Photo" (camera) or "Choose Existing Photos" (library)
     — and uploads straight into the same folder chain.
   ========================================================================= */
(function () {
  "use strict";

  /* ---------- Config ----------
     Same Google Cloud OAuth client as ArcApp's other Drive-connected tools —
     each user authorizes with their own Google account, so photos land in
     their own Drive (or a shared Drive they have access to), not a server
     ArcApp controls. */
  const CLIENT_ID = "658720978828-hqbtvqgacp4elh18al77sc4245d18bol.apps.googleusercontent.com";
  const SCOPE = "https://www.googleapis.com/auth/drive";
  const ROOT_FOLDER_NAME = "ArcApp Equipment Photos";
  const MAX_LONG_EDGE = 1600; // downscale large phone photos before upload

  let gisScriptPromise = null;
  let tokenClient = null;
  let accessToken = null;
  let folderChainCache = {}; // key: "activity|asset|date" -> folder id promise

  /* ---------- Device detection ---------- */
  function isTouchTablet() {
    const ua = navigator.userAgent;
    const isIPad = /iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroidTablet = /Android/.test(ua) && !/Mobile/.test(ua);
    return isIPad || isAndroidTablet;
  }
  function isPhone() {
    const ua = navigator.userAgent;
    return /iPhone|iPod/.test(ua) || (/Android/.test(ua) && /Mobile/.test(ua));
  }
  function isDesktopDevice() {
    return !isTouchTablet() && !isPhone();
  }

  /* ---------- Google Identity Services (lazy) ---------- */
  function ensureGisScript() {
    if (window.google && window.google.accounts) return Promise.resolve();
    if (gisScriptPromise) return gisScriptPromise;
    gisScriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Couldn't load Google sign-in script."));
      document.head.appendChild(s);
    });
    return gisScriptPromise;
  }

  async function ensureTokenClient() {
    await ensureGisScript();
    if (tokenClient) return tokenClient;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: () => {}, // overwritten per-request in requestToken()
    });
    return tokenClient;
  }

  function requestToken(promptType) {
    return new Promise((resolve, reject) => {
      ensureTokenClient().then((client) => {
        client.callback = (resp) => {
          if (resp.error) { reject(new Error(resp.error)); return; }
          accessToken = resp.access_token;
          resolve(accessToken);
        };
        client.requestAccessToken({ prompt: promptType });
      }).catch(reject);
    });
  }

  async function ensureConnected() {
    if (accessToken) return accessToken;
    try {
      return await requestToken(""); // silent attempt (existing Google session)
    } catch (e) {
      return await requestToken("consent"); // explicit popup
    }
  }

  function handleAuthLost() {
    accessToken = null;
    folderChainCache = {};
  }

  /* ---------- Drive REST helpers ---------- */
  async function driveFetch(url, opts = {}) {
    opts.headers = Object.assign({}, opts.headers, { Authorization: "Bearer " + accessToken });
    const res = await fetch(url, opts);
    if (res.status === 401) { handleAuthLost(); throw new Error("Google session expired — try again."); }
    if (!res.ok) { const t = await res.text(); throw new Error("Drive API error: " + res.status + " " + t); }
    return res.json();
  }

  async function findFolder(name, parentId) {
    let q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (parentId) q += ` and '${parentId}' in parents`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;
    const data = await driveFetch(url);
    return data.files && data.files[0] ? data.files[0].id : null;
  }

  async function createFolder(name, parentId) {
    const metadata = { name, mimeType: "application/vnd.google-apps.folder" };
    if (parentId) metadata.parents = [parentId];
    const data = await driveFetch("https://www.googleapis.com/drive/v3/files?fields=id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    });
    return data.id;
  }

  async function findOrCreateFolder(name, parentId) {
    let id = await findFolder(name, parentId);
    if (!id) id = await createFolder(name, parentId);
    return id;
  }

  function sanitize(str) {
    return String(str).replace(/[\\/:*?"<>|]/g, "").trim() || "Unnamed";
  }

  // Resolves (and caches per activity/asset/date) the four-level folder chain.
  function resolveFolderChain(ctx, onStep) {
    const key = `${ctx.activity}|${ctx.asset}|${ctx.date}`;
    if (!folderChainCache[key]) {
      folderChainCache[key] = (async () => {
        onStep && onStep(`Finding "${ROOT_FOLDER_NAME}"…`);
        const rootId = await findOrCreateFolder(ROOT_FOLDER_NAME, null);
        onStep && onStep(`Finding "${ctx.activity}"…`);
        const activityId = await findOrCreateFolder(sanitize(ctx.activity), rootId);
        onStep && onStep(`Finding "${ctx.asset}"…`);
        const assetId = await findOrCreateFolder(sanitize(ctx.asset), activityId);
        onStep && onStep(`Finding "${ctx.date}"…`);
        const dateId = await findOrCreateFolder(sanitize(ctx.date), assetId);
        return dateId;
      })().catch((err) => { delete folderChainCache[key]; throw err; });
    }
    return folderChainCache[key];
  }

  async function uploadImage(blob, filename, parentId) {
    const metadata = { name: filename, parents: [parentId], mimeType: "image/jpeg" };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", blob);
    const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken },
      body: form,
    });
    if (res.status === 401) { handleAuthLost(); throw new Error("Google session expired — try again."); }
    if (!res.ok) { const t = await res.text(); throw new Error("Upload failed: " + res.status + " " + t); }
    return res.json();
  }

  function loadImageEl(dataUrl) {
    return new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.src = dataUrl; });
  }

  async function downscaleToJpeg(file) {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const img = await loadImageEl(dataUrl);
    let { naturalWidth: w, naturalHeight: h } = img;
    const longEdge = Math.max(w, h);
    if (longEdge > MAX_LONG_EDGE) {
      const scale = MAX_LONG_EDGE / longEdge;
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  }

  function pad(n) { return String(n).padStart(2, "0"); }
  function timeStamp() {
    const d = new Date();
    return `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  /* ---------- Toast (lightweight desktop-path feedback) ---------- */
  let toastEl = null;
  function ensureToastStyles() {
    if (document.getElementById("arcphoto-toast-style")) return;
    const style = document.createElement("style");
    style.id = "arcphoto-toast-style";
    style.textContent = `
      .arcphoto-toast{
        position:fixed; bottom:24px; left:50%; transform:translateX(-50%) translateY(12px);
        background:#0b0f1c; border:1px solid #2c3560; color:#eef1f8; border-radius:8px;
        padding:12px 18px; font-family:'JetBrains Mono',monospace; font-size:12.5px;
        box-shadow:0 12px 34px rgba(0,0,0,0.5); z-index:9999; opacity:0; transition:opacity .2s ease, transform .2s ease;
        max-width:88vw; text-align:center;
      }
      .arcphoto-toast.show{ opacity:1; transform:translateX(-50%) translateY(0); }
      .arcphoto-toast a{ color:#8ff2ae; }
    `;
    document.head.appendChild(style);
  }
  function showToast(html, duration) {
    ensureToastStyles();
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "arcphoto-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = html;
    requestAnimationFrame(() => toastEl.classList.add("show"));
    clearTimeout(showToast._t);
    if (duration !== 0) {
      showToast._t = setTimeout(() => toastEl.classList.remove("show"), duration || 4000);
    }
  }

  /* ---------- Desktop path: resolve + open Drive folder directly ---------- */
  async function openOnDesktop(ctx) {
    showToast("Connecting to Google Drive…", 0);
    try {
      await ensureConnected();
      showToast("Finding the Drive folder…", 0);
      const folderId = await resolveFolderChain(ctx, (msg) => showToast(msg, 0));
      window.open(`https://drive.google.com/drive/folders/${folderId}`, "_blank", "noopener");
      showToast(`Opened Drive: ${ROOT_FOLDER_NAME} / ${ctx.activity} / ${ctx.asset} / ${ctx.date}`, 4500);
    } catch (err) {
      showToast("Couldn't open Drive folder: " + err.message, 6000);
    }
  }

  /* ---------- Touch path: in-page capture modal ---------- */
  let modalEl = null;
  let photos = [];
  let nextPhotoId = 1;
  let activeCtx = null;

  function ensureModalStyles() {
    if (document.getElementById("arcphoto-modal-style")) return;
    const style = document.createElement("style");
    style.id = "arcphoto-modal-style";
    style.textContent = `
      .arcphoto-backdrop{ position:fixed; inset:0; background:rgba(2,4,10,0.72); z-index:300; display:none; align-items:flex-end; justify-content:center; }
      .arcphoto-backdrop.open{ display:flex; }
      .arcphoto-sheet{
        background:#0b0f1c; border:1px solid #1d2440; border-top-left-radius:16px; border-top-right-radius:16px;
        width:100%; max-width:560px; max-height:88vh; display:flex; flex-direction:column; overflow:hidden;
        font-family:'Inter',sans-serif; color:#eef1f8;
      }
      @media (min-width:640px){
        .arcphoto-backdrop{ align-items:center; }
        .arcphoto-sheet{ border-radius:12px; max-height:80vh; }
      }
      .arcphoto-head{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; padding:18px 20px; border-bottom:1px solid #1d2440; }
      .arcphoto-eyebrow{ font-family:'JetBrains Mono',monospace; font-size:10.5px; letter-spacing:0.8px; text-transform:uppercase; color:#3fe382; margin-bottom:6px; }
      .arcphoto-title{ font-family:'Orbitron',sans-serif; font-size:15px; font-weight:700; margin:0 0 5px; }
      .arcphoto-sub{ font-family:'JetBrains Mono',monospace; font-size:11px; color:#8991b5; }
      .arcphoto-close{ background:#111629; border:1px solid #1d2440; border-radius:6px; color:#8991b5; width:30px; height:30px; font-size:16px; cursor:pointer; }
      .arcphoto-close:hover{ border-color:#ff5c56; color:#ff5c56; }
      .arcphoto-body{ padding:18px 20px; overflow-y:auto; flex:1; }
      .arcphoto-conn{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:16px; font-size:13px; color:#8991b5; flex-wrap:wrap; }
      .arcphoto-dot{ width:8px; height:8px; border-radius:50%; background:#ff5c56; display:inline-block; margin-right:7px; }
      .arcphoto-dot.on{ background:#3fe382; }
      .arcphoto-btn{
        font-family:'Orbitron',sans-serif; font-size:11.5px; font-weight:600; letter-spacing:0.4px; text-transform:uppercase;
        border-radius:6px; padding:9px 14px; cursor:pointer; border:1px solid #2c3560; background:#111629; color:#eef1f8;
      }
      .arcphoto-btn:hover{ border-color:#3fe382; color:#3fe382; }
      .arcphoto-choices{ display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:16px; }
      @media (max-width:420px){ .arcphoto-choices{ grid-template-columns:1fr; } }
      .arcphoto-choice{
        display:flex; flex-direction:column; align-items:center; gap:8px; padding:18px 10px;
        background:rgba(63,227,130,0.1); border:1px solid #1c8a4c; border-radius:8px; color:#8ff2ae;
        font-family:'Orbitron',sans-serif; font-size:11.5px; font-weight:600; letter-spacing:0.3px; text-transform:uppercase;
        cursor:pointer;
      }
      .arcphoto-choice:hover{ background:#0d3d24; border-color:#3fe382; }
      .arcphoto-choice svg{ width:26px; height:26px; }
      .arcphoto-note{ font-family:'JetBrains Mono',monospace; font-size:10.5px; color:#565f84; margin-bottom:16px; line-height:1.5; }
      .arcphoto-grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(96px,1fr)); gap:9px; }
      .arcphoto-tile{ position:relative; border:1px solid #1d2440; border-radius:6px; overflow:hidden; background:#111629; aspect-ratio:1; }
      .arcphoto-tile img{ width:100%; height:100%; object-fit:cover; display:block; }
      .arcphoto-status{ position:absolute; left:0; right:0; bottom:0; padding:4px 6px; font-family:'JetBrains Mono',monospace; font-size:9.5px; text-transform:uppercase; display:flex; justify-content:space-between; }
      .arcphoto-status.pending{ background:rgba(240,168,64,0.85); color:#241300; }
      .arcphoto-status.uploading{ background:rgba(137,145,181,0.85); color:#0b0f1c; }
      .arcphoto-status.done{ background:rgba(63,227,130,0.9); color:#04170d; }
      .arcphoto-status.error{ background:rgba(255,92,86,0.9); color:#2a0908; }
      .arcphoto-status button{ background:none; border:none; color:inherit; font-family:inherit; font-size:inherit; font-weight:700; text-decoration:underline; cursor:pointer; padding:0; }
      .arcphoto-remove{ position:absolute; top:4px; right:4px; width:18px; height:18px; border-radius:50%; background:rgba(5,7,13,0.75); border:1px solid #2c3560; color:#eef1f8; display:flex; align-items:center; justify-content:center; font-size:12px; cursor:pointer; }
    `;
    document.head.appendChild(style);
  }

  function buildModal() {
    ensureModalStyles();
    const backdrop = document.createElement("div");
    backdrop.className = "arcphoto-backdrop";
    backdrop.innerHTML = `
      <div class="arcphoto-sheet">
        <div class="arcphoto-head">
          <div>
            <div class="arcphoto-eyebrow">Equipment Photos</div>
            <h3 class="arcphoto-title" id="arcphoto-title">Activity</h3>
            <div class="arcphoto-sub" id="arcphoto-sub">Asset · Date</div>
          </div>
          <button class="arcphoto-close" id="arcphoto-close">&times;</button>
        </div>
        <div class="arcphoto-body">
          <div class="arcphoto-conn">
            <span><span class="arcphoto-dot" id="arcphoto-dot"></span><span id="arcphoto-conn-label">Not connected</span></span>
            <button class="arcphoto-btn" id="arcphoto-connect">Authorize Drive</button>
          </div>
          <div class="arcphoto-choices">
            <button class="arcphoto-choice" id="arcphoto-take">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              Take New Photo
            </button>
            <button class="arcphoto-choice" id="arcphoto-choose">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              Choose Existing
            </button>
          </div>
          <div class="arcphoto-note" id="arcphoto-note">Photos are filed under Activity → Asset → Date in Drive.</div>
          <div class="arcphoto-grid" id="arcphoto-grid"></div>
        </div>
      </div>
      <input type="file" accept="image/*" capture="environment" id="arcphoto-input-take" style="display:none;">
      <input type="file" accept="image/*" multiple id="arcphoto-input-choose" style="display:none;">
    `;
    document.body.appendChild(backdrop);

    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
    backdrop.querySelector("#arcphoto-close").addEventListener("click", closeModal);
    backdrop.querySelector("#arcphoto-take").addEventListener("click", () => backdrop.querySelector("#arcphoto-input-take").click());
    backdrop.querySelector("#arcphoto-choose").addEventListener("click", () => backdrop.querySelector("#arcphoto-input-choose").click());
    backdrop.querySelector("#arcphoto-input-take").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
    backdrop.querySelector("#arcphoto-input-choose").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
    backdrop.querySelector("#arcphoto-connect").addEventListener("click", async () => {
      try {
        await ensureConnected();
        setModalConn(true);
        photos.filter((p) => p.status === "pending" || p.status === "error").forEach(uploadPhoto);
      } catch (err) {
        document.getElementById("arcphoto-note").textContent = "Authorization failed: " + err.message;
      }
    });

    return backdrop;
  }

  function setModalConn(on) {
    modalEl.querySelector("#arcphoto-dot").classList.toggle("on", on);
    modalEl.querySelector("#arcphoto-conn-label").textContent = on ? "Connected to Google Drive" : "Not connected";
    modalEl.querySelector("#arcphoto-connect").style.display = on ? "none" : "inline-block";
  }

  function renderGrid() {
    const grid = modalEl.querySelector("#arcphoto-grid");
    grid.innerHTML = "";
    photos.forEach((p) => {
      const tile = document.createElement("div");
      tile.className = "arcphoto-tile";
      let statusHtml = "";
      if (p.status === "pending") statusHtml = `<div class="arcphoto-status pending">Queued</div>`;
      else if (p.status === "uploading") statusHtml = `<div class="arcphoto-status uploading">Uploading…</div>`;
      else if (p.status === "done") statusHtml = `<div class="arcphoto-status done">Uploaded</div>`;
      else if (p.status === "error") statusHtml = `<div class="arcphoto-status error">Failed <button data-retry="${p.id}">Retry</button></div>`;
      tile.innerHTML = `<img src="${p.previewUrl}"><button class="arcphoto-remove" data-remove="${p.id}">&times;</button>${statusHtml}`;
      grid.appendChild(tile);
    });
    grid.querySelectorAll("[data-remove]").forEach((btn) => btn.addEventListener("click", () => {
      photos = photos.filter((p) => p.id !== Number(btn.dataset.remove));
      renderGrid();
    }));
    grid.querySelectorAll("[data-retry]").forEach((btn) => btn.addEventListener("click", () => {
      const p = photos.find((x) => x.id === Number(btn.dataset.retry));
      if (p) uploadPhoto(p);
    }));
  }

  async function addFiles(fileList) {
    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith("image/")) continue;
      const blob = await downscaleToJpeg(file);
      const previewUrl = URL.createObjectURL(blob);
      const photo = { id: nextPhotoId++, blob, previewUrl, status: "pending" };
      photos.push(photo);
      renderGrid();
      if (accessToken) uploadPhoto(photo);
    }
  }

  async function uploadPhoto(photo) {
    photo.status = "uploading";
    renderGrid();
    try {
      const dateFolderId = await resolveFolderChain(activeCtx, (msg) => {
        modalEl.querySelector("#arcphoto-note").textContent = msg;
      });
      const filename = `${sanitize(activeCtx.asset)} - ${activeCtx.date} - ${timeStamp()}.jpg`;
      const result = await uploadImage(photo.blob, filename, dateFolderId);
      photo.status = "done";
      modalEl.querySelector("#arcphoto-note").innerHTML =
        `Last upload: <a href="${result.webViewLink}" target="_blank" rel="noopener" style="color:#8ff2ae;">${filename} →</a>`;
    } catch (err) {
      photo.status = "error";
      modalEl.querySelector("#arcphoto-note").textContent = "Upload failed: " + err.message;
    }
    renderGrid();
  }

  function closeModal() {
    if (modalEl) modalEl.classList.remove("open");
    document.body.style.overflow = "";
  }

  async function openOnTouch(ctx) {
    activeCtx = ctx;
    photos = [];
    if (!modalEl) modalEl = buildModal();
    modalEl.querySelector("#arcphoto-title").textContent = ctx.activity;
    modalEl.querySelector("#arcphoto-sub").textContent = `${ctx.asset} · ${ctx.date}`;
    modalEl.querySelector("#arcphoto-note").textContent = "Photos are filed under Activity → Asset → Date in Drive.";
    setModalConn(!!accessToken);
    renderGrid();
    modalEl.classList.add("open");
    document.body.style.overflow = "hidden";

    // Best-effort silent connect so the queue can start uploading right away
    // without forcing a popup before the user has even taken a photo.
    if (!accessToken) {
      try { await requestToken(""); setModalConn(true); } catch (e) { /* stays disconnected until user taps Authorize */ }
    }
  }

  /* ---------- Public API ---------- */
  window.ArcAppPhotoLogger = {
    open(ctx) {
      const context = {
        activity: ctx.activity || "Unspecified Activity",
        asset: ctx.asset || "Unspecified Asset",
        date: ctx.date || new Date().toISOString().slice(0, 10),
      };
      if (isDesktopDevice()) {
        openOnDesktop(context);
      } else {
        openOnTouch(context);
      }
    },
  };
})();