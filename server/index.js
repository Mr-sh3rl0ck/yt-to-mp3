const express = require("express");
const cors = require("cors");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3001;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors({
    exposedHeaders: ["Content-Disposition"],
}));
app.use(express.json());

// Simple rate-limit: max 10 requests per IP per minute
const rateMap = new Map();
const RATE_LIMIT = 10;
const RATE_WINDOW = 60_000;

function rateLimit(req, res, next) {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const now = Date.now();
    if (!rateMap.has(ip)) rateMap.set(ip, []);
    const timestamps = rateMap.get(ip).filter((t) => now - t < RATE_WINDOW);
    if (timestamps.length >= RATE_LIMIT) {
        return res.status(429).json({ error: "Too many requests. Try again later." });
    }
    timestamps.push(now);
    rateMap.set(ip, timestamps);
    next();
}

app.use("/api", rateLimit);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const YT_REGEX =
    /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/|music\.youtube\.com\/watch\?v=)/;

function isValidYouTubeUrl(url) {
    return typeof url === "string" && YT_REGEX.test(url.trim());
}

/** Strip playlist/tracking params and normalize the URL to just the video */
function cleanYouTubeUrl(rawUrl) {
    const url = rawUrl.trim();

    // Extract video ID from various formats
    let videoId = null;

    // youtu.be/VIDEO_ID
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) videoId = shortMatch[1];

    // youtube.com/watch?v=VIDEO_ID or music.youtube.com/watch?v=VIDEO_ID
    const longMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (longMatch) videoId = longMatch[1];

    // youtube.com/shorts/VIDEO_ID
    const shortsMatch = url.match(/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) videoId = shortsMatch[1];

    if (videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
    }

    // Fallback: return as-is
    return url;
}

/** Common yt-dlp args to avoid errors on datacenter IPs */
const YT_DLP_BASE_ARGS = [
    "--no-playlist",
    "--no-warnings",
    "--no-check-formats",
    "--extractor-args", "youtube:player_client=ios,web",
];

// --- Cookie authentication for YouTube ---
// Option 1: Local dev — use browser cookies directly
if (process.env.USE_BROWSER_COOKIES) {
    YT_DLP_BASE_ARGS.push("--cookies-from-browser", process.env.USE_BROWSER_COOKIES);
}

// Option 2: Production (Render) — use cookies from env var
// Set YT_COOKIES env var with base64-encoded content of a cookies.txt file
const COOKIES_PATH = path.join(os.tmpdir(), "yt_cookies.txt");
if (process.env.YT_COOKIES) {
    try {
        const decoded = Buffer.from(process.env.YT_COOKIES, "base64").toString("utf-8");
        fs.writeFileSync(COOKIES_PATH, decoded);
        YT_DLP_BASE_ARGS.push("--cookies", COOKIES_PATH);
        console.log("YouTube cookies loaded from YT_COOKIES env var");
    } catch (e) {
        console.error("Failed to load YT_COOKIES:", e.message);
    }
}

/** Run yt-dlp with given args and return stdout */
function runYtDlp(args) {
    return new Promise((resolve, reject) => {
        const fullArgs = [...YT_DLP_BASE_ARGS, ...args];
        console.log("Running yt-dlp with args:", fullArgs.join(" "));
        execFile("yt-dlp", fullArgs, { timeout: 300_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr || err.message));
            resolve(stdout.trim());
        });
    });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check
app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Get video metadata
app.post("/api/info", async (req, res) => {
    try {
        const { url } = req.body;
        if (!isValidYouTubeUrl(url)) {
            return res.status(400).json({ error: "Invalid YouTube URL." });
        }
        const cleanUrl = cleanYouTubeUrl(url);
        console.log("Clean URL:", cleanUrl);

        const raw = await runYtDlp([
            "--dump-json",
            cleanUrl,
        ]);

        const data = JSON.parse(raw);
        res.json({
            title: data.title,
            duration: data.duration, // seconds
            thumbnail: data.thumbnail,
            channel: data.channel || data.uploader,
        });
    } catch (err) {
        console.error("INFO ERROR:", err.message);
        res.status(500).json({ error: err.message || "Could not fetch video info." });
    }
});

// Convert & download MP3
app.post("/api/convert", async (req, res) => {
    const { url } = req.body;
    if (!isValidYouTubeUrl(url)) {
        return res.status(400).json({ error: "Invalid YouTube URL." });
    }

    // Create a temp file path
    const tmpDir = os.tmpdir();
    const id = crypto.randomBytes(8).toString("hex");
    const outTemplate = path.join(tmpDir, `yt2mp3_${id}.%(ext)s`);
    const expectedFile = path.join(tmpDir, `yt2mp3_${id}.mp3`);

    try {
        const cleanUrl = cleanYouTubeUrl(url);

        // Get title first for the filename
        const rawInfo = await runYtDlp(["--dump-json", cleanUrl]);
        const info = JSON.parse(rawInfo);
        const safeTitle = info.title.replace(/[^\w\s\-()[\]]/g, "").trim() || "audio";

        // Download & convert to MP3
        await runYtDlp([
            "-S", "vcodec:h264,res:720,acodec:aac",
            "-x",
            "--audio-format", "mp3",
            "--audio-quality", "0",
            "-o", outTemplate,
            cleanUrl,
        ]);

        // Check file exists
        if (!fs.existsSync(expectedFile)) {
            throw new Error("Converted file not found.");
        }

        const stat = fs.statSync(expectedFile);

        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Content-Length", stat.size);
        res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(safeTitle)}.mp3"`);

        const stream = fs.createReadStream(expectedFile);
        stream.pipe(res);
        stream.on("end", () => {
            // Clean up temp file
            fs.unlink(expectedFile, () => { });
        });
        stream.on("error", (err) => {
            console.error("STREAM ERROR:", err.message);
            fs.unlink(expectedFile, () => { });
            if (!res.headersSent) {
                res.status(500).json({ error: "Error streaming file." });
            }
        });
    } catch (err) {
        console.error("CONVERT ERROR:", err.message);
        // Clean up on error
        fs.unlink(expectedFile, () => { });
        if (!res.headersSent) {
            res.status(500).json({ error: "Conversion failed. The video may be too long or unavailable." });
        }
    }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
