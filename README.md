# SVG Animator Studio

SVG Animator Studio is a powerful, self-hosted web application and CLI tool built in **Go** with embedded frontend assets (`//go:embed`). It provides a 3-column professional IDE layout for designing interactive vector diagrams, animated network topologies, and dynamic photo effects, with zero external web dependencies once compiled.

---

## Choose Your Installation Method

You can either **download the pre-compiled binary** for your operating system or **compile it yourself** from source code.

---

### Option A: Download Pre-Compiled Binaries (Easiest)

#### 🪟 Windows Installation Guide
If you want to run the application immediately on Windows without installing Go, follow these step-by-step instructions:

1. **Create an Application Folder:**
   Open File Explorer, go to your `C:\` drive, and create a new folder named **`SVGAnimator`** (so the full path is `C:\SVGAnimator`).

2. **Download the Windows Binary:**
   Go to the project's **Releases** page on GitHub or Gitea, download **`svg-animator-windows.exe`**, and place it inside your `C:\SVGAnimator` folder. Optionally, rename it to `svg-animator.exe`.

3. **Add FFmpeg (Required for Animated Export Studio):**
   * Go to the official FFmpeg Windows builds page: **[Gyan.dev FFmpeg Builds](https://www.gyan.dev/ffmpeg/builds/)**.
   * Download **`ffmpeg-release-essentials.zip`**.
   * Open the zip file, look inside the inner `bin` folder, and extract **`ffmpeg.exe`**.
   * Copy `ffmpeg.exe` and paste it directly into `C:\SVGAnimator` right alongside your application binary.

4. **Create a Desktop Shortcut:**
   Right-click `svg-animator.exe` inside your folder, hover over **Send to**, and click **Desktop (create shortcut)**. 

5. **Run the Studio:**
   Double-click your new shortcut, open your web browser, and navigate to:
   ```text
   http://localhost:8088
   ```

---

#### 🐧 Linux Installation Guide
If you are running Linux (such as Ubuntu or Debian) and want to use the pre-built binary:

1. **Create an Application Directory:**
   Open your terminal and create a dedicated folder:
   ```bash
   mkdir -p ~/svg-animator && cd ~/svg-animator
   ```

2. **Download the Linux Binary:**
   Download **`svg-animator-linux`** from the project's **Releases** page and place it into your `~/svg-animator` folder.

3. **Make the Binary Executable:**
   Grant execution permissions to the file:
   ```bash
   chmod +x svg-animator-linux
   ```

4. **Install System Dependencies (Chrome & FFmpeg):**
   * **FFmpeg:** Install via your package manager:
     ```bash
     sudo apt update && sudo apt install ffmpeg
     ```
   * **Google Chrome (Crucial for Linux Frame Writing):** 
     Modern Ubuntu distributions often package Chromium via **Snap**, which enforces strict containerized sandboxing that blocks raw frame writes to `/tmp`. You must use the official unconfined Google Chrome `.deb` package:
     ```bash
     sudo snap remove chromium
     wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
     sudo dpkg -i google-chrome-stable_current_amd64.deb
     sudo apt-get install -f
     ```

5. **Run the Studio:**
   Start the application locally:
   ```bash
   ./svg-animator-linux -serve :8088
   ```
   Open your browser and navigate to `http://localhost:8088`.

---

### Option B: Compile From Source (For Developers)

If you prefer building the application yourself from the source code:

#### Prerequisites
* **Go (1.20+)** installed on your system.
* **Google Chrome / Chromium** & **FFmpeg**.

#### Building on Linux / macOS
```bash
go mod tidy
GOOS=linux GOARCH=amd64 go build -o bin/svg-animator-linux ./cmd/svg-animator/main.go
./bin/svg-animator-linux -serve :8088
```

#### Building on Windows (PowerShell / CMD)
```cmd
go mod tidy
GOOS=windows GOARCH=amd64 go build -o bin/svg-animator-windows.exe .\cmd\svg-animator\main.go
.\bin\svg-animator-windows.exe -serve :8088
```

---

## License & Contributing
Licensed under the MIT License. Contributions, bug reports, and feature requests are welcome via Gitea or GitHub issues.
