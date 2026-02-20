// =====================================================================
// YT2MP3 — Client Script
// =====================================================================

// 🔧 Change this to your Render backend URL once deployed
const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3001"
    : "https://YOUR-RENDER-SERVICE.onrender.com"; // <-- Replace with your Render URL

// --- DOM refs -------------------------------------------------------
const urlInput = document.getElementById("url-input");
const convertBtn = document.getElementById("convert-btn");
const btnText = convertBtn.querySelector(".btn-text");
const btnLoader = convertBtn.querySelector(".btn-loader");
const inputError = document.getElementById("input-error");
const previewCard = document.getElementById("preview-card");
const previewThumb = document.getElementById("preview-thumb");
const previewDuration = document.getElementById("preview-duration");
const previewTitle = document.getElementById("preview-title");
const previewChannel = document.getElementById("preview-channel");
const progressSection = document.getElementById("progress-section");
const progressFill = document.getElementById("progress-fill");
const progressText = document.getElementById("progress-text");
const downloadSection = document.getElementById("download-section");
const downloadLink = document.getElementById("download-link");
const newConvertBtn = document.getElementById("new-convert-btn");
const toast = document.getElementById("toast");
const toastMsg = document.getElementById("toast-msg");

// --- Helpers --------------------------------------------------------
const YT_REGEX =
    /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/|music\.youtube\.com\/watch\?v=)/;

function isValidUrl(url) {
    return YT_REGEX.test(url.trim());
}

function formatDuration(seconds) {
    if (!seconds) return "0:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
}

function showToast(msg, duration = 4000) {
    toastMsg.textContent = msg;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => (toast.hidden = true), 300);
    }, duration);
}

function setLoading(loading) {
    convertBtn.disabled = loading;
    urlInput.disabled = loading;
    btnText.hidden = loading;
    btnLoader.hidden = !loading;
}

function resetUI() {
    previewCard.hidden = true;
    progressSection.hidden = true;
    downloadSection.hidden = true;
    inputError.hidden = true;
    progressFill.style.width = "0%";
    progressFill.classList.remove("indeterminate");
    // Clean up blob URL and click handler
    if (downloadLink.href && downloadLink.href.startsWith("blob:")) {
        URL.revokeObjectURL(downloadLink.href);
    }
    downloadLink.href = "";
    downloadLink.onclick = null;
    urlInput.value = "";
    urlInput.focus();
    setLoading(false);
}

// --- Main flow ------------------------------------------------------
async function handleConvert() {
    const url = urlInput.value.trim();

    // Validate
    if (!url || !isValidUrl(url)) {
        inputError.hidden = false;
        urlInput.focus();
        return;
    }
    inputError.hidden = true;

    setLoading(true);
    previewCard.hidden = true;
    progressSection.hidden = true;
    downloadSection.hidden = true;

    // Step 1: Fetch video info
    try {
        const infoRes = await fetch(`${API_BASE}/api/info`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
        });

        if (!infoRes.ok) {
            const err = await infoRes.json().catch(() => ({}));
            throw new Error(err.error || "Could not fetch video info.");
        }

        const info = await infoRes.json();

        // Show preview
        previewThumb.src = info.thumbnail || "";
        previewTitle.textContent = info.title || "Sin título";
        previewChannel.textContent = info.channel || "";
        previewDuration.textContent = formatDuration(info.duration);
        previewCard.hidden = false;
    } catch (err) {
        setLoading(false);
        showToast(err.message || "Error al obtener info del video.");
        return;
    }

    // Step 2: Convert to MP3
    progressSection.hidden = false;
    progressFill.classList.add("indeterminate");
    progressText.textContent = "Convirtiendo a MP3… esto puede tardar un momento";

    try {
        const convertRes = await fetch(`${API_BASE}/api/convert`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
        });

        if (!convertRes.ok) {
            const err = await convertRes.json().catch(() => ({}));
            throw new Error(err.error || "Conversion failed.");
        }

        // Get the blob
        const blob = await convertRes.blob();

        // Extract filename from Content-Disposition header
        const disposition = convertRes.headers.get("Content-Disposition") || "";
        let filename = "audio.mp3";
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match) filename = decodeURIComponent(match[1]);

        // Create download URL
        const blobUrl = URL.createObjectURL(blob);
        downloadLink.href = blobUrl;
        downloadLink.download = filename;

        // Attach click handler to force download via temp anchor
        downloadLink.onclick = (e) => {
            e.preventDefault();
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };

        // Show success
        progressSection.hidden = true;
        progressFill.classList.remove("indeterminate");
        downloadSection.hidden = false;
        setLoading(false);
    } catch (err) {
        progressSection.hidden = true;
        progressFill.classList.remove("indeterminate");
        setLoading(false);
        showToast(err.message || "Error en la conversión.");
    }
}

// --- Events ---------------------------------------------------------
convertBtn.addEventListener("click", handleConvert);

urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleConvert();
});

urlInput.addEventListener("input", () => {
    inputError.hidden = true;
});

newConvertBtn.addEventListener("click", resetUI);

// Auto-paste from clipboard on focus (if allowed)
urlInput.addEventListener("focus", async () => {
    if (urlInput.value) return;
    try {
        const text = await navigator.clipboard.readText();
        if (isValidUrl(text)) {
            urlInput.value = text;
        }
    } catch {
        // Clipboard permission denied — no‑op
    }
});
