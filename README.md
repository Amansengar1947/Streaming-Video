# MediaDeck — Personal Video Streaming Platform

A private, high-performance web application for streaming video and audio from arbitrary URLs, direct links, and cloud storage hosts through your own browser interface.

Built with a **Vite + React 19 + TypeScript** frontend, a high-throughput **Fastify v5** backend, **Shaka Player**, an **on-the-fly zero-transcode MKV remuxing engine**, dynamic **bandwidth pacing**, and a **1DM-style In-App Browser Sniffer**.

---

## 🌟 Key Features

### 🎥 Unified Playback Engine
- **Direct Progressive Media**: MP4, WebM, OGG, MOV.
- **Adaptive Streaming**: HLS (`.m3u8`) and DASH (`.mpd`) manifests with automatic and manual quality track switching.
- **Audio Streams**: MP3, AAC, FLAC, WAV.
- **Embedded Media**: Official sandboxed embeds for YouTube, Vimeo, Dailymotion, SoundCloud, etc.

### ⚡ On-The-Fly Zero-Transcode MKV Remuxing
- **No More Waiting for 3 GB+ Downloads**: Raw Matroska (`.mkv`) files cannot be progressively streamed over HTTP by standard web browsers without downloading the whole file first.
- MediaDeck features an on-the-fly remuxer using FFmpeg in stream-copy mode (`-c copy`).
- Video and audio streams are repackaged into fragmented MP4 (`fMP4`) containers on-the-fly without decoding or re-encoding frames.
- **Zero quality loss**, **< 5% CPU usage**, and playback starts in seconds!

### 🌊 Bandwidth Pacing Engine (`PacedStream`)
- Prevents browsers from aggressively buffering multi-gigabyte files at maximum network speed.
- Delivers an immediate **16 MB fast-start burst** for instant video buffering.
- Transitions to steady-state pacing at **1.5 MB/s (~12 Mbps)**, sufficient for smooth 1080p/4K playback while saving gigabytes of bandwidth and disk space.

### 🕵️ 1DM In-App Browser & Media Sniffer
- **Multi-Tab Web Browser**: Browse streaming and file-sharing websites inside the player interface.
- **Built-in Ad Blocker**: Automatically filters out popup ads, banner clutter, and malicious redirect scripts.
- **Unlock-Link Interception**: Safely resolves protected download buttons, link shorteners, and timer redirects without opening intrusive external popups.
- **One-Click Playback**: As soon as a video or audio stream is detected by network inspection, an animated banner and 1DM sniffer drawer appear with a 1-click **Play** button.

### 📊 Authoritative Live Telemetry & "Stats for Nerds"
- **Server-Side Stream Tracker**: Real-time byte count and 1-second rolling speed window.
- **Live Buffering Overlay**: Shows exact streaming speed and loaded percentage while buffering (e.g. `⚡ 1.5 MB/s • 0.8% (32.4 MB of 3.93 GB loaded)`).
- **Advanced Stats Modal (<kbd>D</kbd> key)**: Displays buffer health, timeline buffer ahead, resolution, video dimensions, container format, and direct URL copy.

### 🛡️ Production-Grade SSRF Defenses
- **DNS Pinning**: Single DNS resolution with socket pinning to prevent Time-of-Check to Time-of-Use (TOCTOU) DNS rebinding.
- **Private Network Blocking**: Automatically blocks loopback (`127.0.0.0/8`, `::1`), RFC 1918 private subnets, carrier-grade NAT, and cloud metadata endpoints (`169.254.169.254`).
- **HMAC-Signed Proxy Tokens**: Media streams routed through the proxy require signed HMAC tokens to prevent open-relay abuse.

---

## 📋 Prerequisites

Before running MediaDeck, make sure you have the following installed on your machine:

1. **Node.js**: Version **20 or higher** (Tested on Node v20–v26)
   - Check version: `node -v`
2. **pnpm**: Fast, disk space efficient package manager
   - Install globally: `npm install -g pnpm`
   - Check version: `pnpm -v`
3. **FFmpeg**: Required for on-the-fly MKV remuxing
   - **Ubuntu / Debian**: `sudo apt update && sudo apt install -y ffmpeg`
   - **Arch Linux**: `sudo pacman -S ffmpeg`
   - **macOS (Homebrew)**: `brew install ffmpeg`
   - **Windows**: Install via `winget install Gyan.FFmpeg` or download from [ffmpeg.org](https://ffmpeg.org) and add to `PATH`.
   - Verify installation: `ffmpeg -version`

---

## 🚀 How to Run

### 1. Clone the Repository
```bash
git clone git@github.com:Amansengar1947/Streaming-Video.git
cd Streaming-Video
```

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Start Development Servers
```bash
pnpm dev
```
This runs both the backend and frontend concurrently:
- **Web Player UI**: [http://localhost:5173](http://localhost:5173)
- **Backend API Server**: [http://localhost:3001](http://localhost:3001)

You can also run them in separate terminals if preferred:
```bash
pnpm dev:server   # Starts Fastify backend at http://localhost:3001
pnpm dev:web      # Starts Vite frontend at http://localhost:5173
```

### 4. Running in Production Mode
```bash
# Build shared types, backend, and frontend
pnpm build

# Start the production backend server
pnpm --filter @video-player/server start
```

---

## 🎮 How to Use

### 1. Playing a Direct Video Link
1. Open [http://localhost:5173](http://localhost:5173).
2. Paste any direct video URL (`.mp4`, `.webm`, `.m3u8`, `.mpd`, or supported cloud host) into the address bar.
3. Click **Play Video** or press <kbd>Enter</kbd>.

### 2. Streaming MKV Files On-Demand
- When you paste an `.mkv` link (or sniff an MKV from cloud storage), MediaDeck automatically selects the **`MP4 (Universal Stream - Fast Start)`** stream copy route.
- Playback begins immediately without downloading the full 3 GB–10 GB file.
- The player paces the connection at ~1.5 MB/s to conserve bandwidth.

### 3. Using the 1DM Web Sniffer Browser
1. Click the **"In-App Browser"** globe button next to the URL input (or in the top navigation bar).
2. Enter the website URL (e.g. streaming or file download sites like MobileJSR, Pixeldrain, 10xflix, etc.).
3. Browse the page freely:
   - Annoying popups and banner ads are automatically blocked.
   - Click "Unlock Links" or navigation buttons as you normally would.
4. As soon as the page loads a video or triggers a media stream, a **Download/Stream Intercepted** notification banner will appear at the top, and the **1DM Sniffer Drawer** will badge the stream.
5. Click **▶ Play Stream** to immediately play the video in the main player.

### 4. Inspecting Live Speed & Buffer ("Stats for Nerds")
- While playing or buffering, press <kbd>D</kbd> or click the 📊 **Advanced Data** button in the player controls.
- View:
  - **Live Stream Speed** (e.g. `⚡ 1.5 MB/s`)
  - **Data Streamed** (e.g. `32.4 MB / 3.93 GB (0.8%)`)
  - **Buffer Ahead** (e.g. `+24.5s ahead`)
  - **Stream Format & Resolution**
  - **Direct Stream URL** with 1-click copy button
- Press <kbd>Esc</kbd>, <kbd>D</kbd>, or click **Close** to dismiss.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Space</kbd> or <kbd>K</kbd> | Play / Pause |
| <kbd>←</kbd> / <kbd>→</kbd> | Seek backward / forward 5 seconds |
| <kbd>Shift</kbd> + <kbd>←</kbd> / <kbd>→</kbd> | Seek backward / forward 10 seconds |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Increase / decrease volume 5% |
| <kbd>M</kbd> | Mute / Unmute audio |
| <kbd>F</kbd> | Toggle Fullscreen |
| <kbd>P</kbd> | Toggle Picture-in-Picture (PiP) |
| <kbd>D</kbd> | Toggle "Stats for Nerds" telemetry modal |
| <kbd>Esc</kbd> | Close any open modal (Stats, Shortcuts) |
| <kbd>0</kbd> – <kbd>9</kbd> | Jump to 0% – 90% of video duration |
| <kbd>?</kbd> | Open Keyboard Shortcuts help sheet |

---

## 🧪 Testing & Code Quality

Run the automated test suite covering SSRF defenses, URL sanitization, HMAC signatures, resolver logic, and pacing:

```bash
# Run all tests across the monorepo
pnpm test

# Run TypeScript typechecks
pnpm typecheck

# Run backend tests only
pnpm --filter @video-player/server test

# Run frontend tests only
pnpm --filter @video-player/web test
```

---

## 🔒 Security & Fair Use Notice

- MediaDeck is an open-source personal media streaming application.
- It does **not** host, store, or distribute copyrighted media files.
- It does **not** bypass DRM, paywalls, or authentication logins.
- All proxying is secured with SSRF IP filtering and HMAC signature validation.
