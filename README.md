# Song Converter — Render-ready

A local-first audio-to-MP3 converter for audio you own or are licensed to use.

## Run locally

Requirements:
- Node.js 18+ (Node 22 is recommended)
- FFmpeg in PATH

```bash
npm install
npm start
```

Open `http://localhost:10000`.

## Deploy to Render

This project includes a `Dockerfile` and `render.yaml`, so Render can build FFmpeg into the service automatically.

### Option A — Blueprint
1. Put this project in a GitHub/GitLab repository.
2. In Render, choose **New → Blueprint**.
3. Select the repository.
4. Render will read `render.yaml` and create the web service.

### Option B — Web Service
Create a Web Service for the repo and select **Docker** as the runtime. No custom FFmpeg install command is needed because the Docker image installs FFmpeg.

The service listens on Render's `PORT` variable and exposes:
- `/` — web UI
- `/health` — health check
- `POST /api/convert` — conversion endpoint

### Important Render note
The converter uses temporary disk storage. That is intentional: uploaded files and generated MP3s are deleted after processing/download. Do not use this service as permanent file storage.

## Configuration

- `MAX_FILE_MB` — default `250`
- `MAX_CONCURRENT` — default `2`
- `FFMPEG_PATH` — optional override when running outside Docker

## Security / safety design

- No YouTube URL downloader.
- No remote code, analytics, ads, or tracking scripts.
- No shell command is built from user input.
- FFmpeg arguments use an argument array rather than shell evaluation.
- Filenames are sanitized.
- File size and MIME type are constrained.
- Temporary source/output files are removed after processing.
- Client disconnects attempt to terminate the FFmpeg process and clean up files.
- Concurrent conversions are bounded to avoid exhausting a small Render instance.

## Spotify

Spotify supports Local Files. After obtaining/converting audio you have the rights to use, enable Local Files in Spotify and add the folder containing the MP3 files.

This project intentionally does not implement arbitrary YouTube downloading.
