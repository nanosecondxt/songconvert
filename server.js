const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const app = express();
const PORT = Number(process.env.PORT || 10000);
const MAX_MB = Number(process.env.MAX_FILE_MB || 250);
const MAX_BYTES = MAX_MB * 1024 * 1024;
const MAX_CONCURRENT = Math.max(1, Number(process.env.MAX_CONCURRENT || 2));
const TMP = path.join(require("os").tmpdir(), "song-converter");
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const allowedMime = new Set([
  "audio/mpeg", "audio/wav", "audio/x-wav", "audio/wave", "audio/flac",
  "audio/mp4", "audio/aac", "audio/ogg", "audio/webm", "video/mp4", "video/webm"
]);

fs.mkdirSync(TMP, { recursive: true });
let activeJobs = 0;

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

const upload = multer({
  dest: TMP,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    cb(null, allowedMime.has(file.mimetype));
  }
});

function safeName(name) {
  return String(name || "converted")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "converted";
}

function unlinkQuiet(file) {
  try { if (file) fs.unlinkSync(file); } catch {}
}

function available(response) {
  if (activeJobs >= MAX_CONCURRENT) {
    response.status(429).json({ error: "The converter is busy. Try again in a moment." });
    return false;
  }
  activeJobs += 1;
  return true;
}

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "song-converter",
    ffmpeg: FFMPEG,
    activeJobs,
    maxConcurrent: MAX_CONCURRENT
  });
});

app.post("/api/convert", upload.single("audio"), (req, res) => {
  if (!available(res)) {
    if (req.file) unlinkQuiet(req.file.path);
    return;
  }

  if (!req.file) {
    activeJobs -= 1;
    return res.status(400).json({ error: "No supported audio file was supplied." });
  }

  const input = req.file.path;
  const requested = safeName(req.body.title || path.parse(req.file.originalname).name);
  const output = path.join(TMP, `${crypto.randomBytes(18).toString("hex")}.mp3`);
  const bitrate = new Set(["128k", "192k", "256k", "320k"]).has(req.body.bitrate)
    ? req.body.bitrate : "192k";

  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    activeJobs = Math.max(0, activeJobs - 1);
    unlinkQuiet(input);
  };

  const ffmpeg = spawn(FFMPEG, [
    "-hide_banner", "-loglevel", "error",
    "-nostdin",
    "-i", input,
    "-vn",
    "-map", "0:a:0?",
    "-codec:a", "libmp3lame",
    "-b:a", bitrate,
    "-map_metadata", "0",
    "-id3v2_version", "3",
    "-y", output
  ]);

  let stderr = "";
  ffmpeg.stderr.on("data", chunk => {
    stderr += chunk.toString();
    if (stderr.length > 5000) stderr = stderr.slice(-5000);
  });

  ffmpeg.on("error", err => {
    unlinkQuiet(output);
    finish();
    if (!res.headersSent) {
      res.status(500).json({
        error: `FFmpeg could not be started: ${err.message}`
      });
    }
  });

  ffmpeg.on("close", code => {
    if (code !== 0 || !fs.existsSync(output)) {
      unlinkQuiet(output);
      finish();
      return res.status(422).json({
        error: "Conversion failed. The file may be unsupported or damaged.",
        detail: process.env.NODE_ENV === "production" ? undefined : stderr.trim()
      });
    }

    // Release the upload before the response is sent. The MP3 stays until download completes.
    unlinkQuiet(input);
    res.download(output, `${requested}.mp3`, err => {
      unlinkQuiet(output);
      activeJobs = Math.max(0, activeJobs - 1);
      settled = true;
      if (err && !res.headersSent) res.status(500).end();
    });
  });

  req.on("aborted", () => {
    try { ffmpeg.kill("SIGKILL"); } catch {}
    unlinkQuiet(input);
    unlinkQuiet(output);
    if (!settled) {
      settled = true;
      activeJobs = Math.max(0, activeJobs - 1);
    }
  });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE"
      ? `File is too large. Maximum size is ${MAX_MB} MB.`
      : err.message;
    return res.status(400).json({ error: message });
  }
  if (err) return res.status(400).json({ error: err.message || "Request failed." });
  next();
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Song Converter listening on port ${PORT}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}; shutting down.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
