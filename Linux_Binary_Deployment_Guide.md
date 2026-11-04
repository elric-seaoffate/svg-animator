# Deployment Guide: SVG Animator Studio (Linux)

This guide covers installing runtime dependencies (FFmpeg and Google Chrome / Chromium), running `svg-animator` directly from your home directory (`~/svg-animator`), configuring `config.json`, and running the application as a persistent `systemd` service with the listening port controlled either by `config.json` or specified at service start.

---

## 1. Prerequisites & Dependencies

The application binary embeds all web assets and uses pure-Go SQLite (`modernc.org/sqlite`), so no external database server is required. For video/bitmap exports and audio inspection, the host requires **FFmpeg** and **Google Chrome** (or uncontainerized **Chromium**). Do not use Snap-confined Chromium if avoidable, as Snap sandboxing restricts access to local temporary render directories.

### Install FFmpeg and Google Chrome (Debian / Ubuntu / Mint)
```bash
sudo apt update
sudo apt install -y ffmpeg wget gnupg ca-certificates

wget -q -O - [https://dl.google.com/linux/linux_signing_key.pub](https://dl.google.com/linux/linux_signing_key.pub) | sudo gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] [http://dl.google.com/linux/chrome/deb/](http://dl.google.com/linux/chrome/deb/) stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list
sudo apt update
sudo apt install -y google-chrome-stable
```

Verify both tools are available:
```bash
ffmpeg -version
google-chrome --version
```

---

## 2. Option A: Running Directly from Your Home Directory (`~/svg-animator`)

1. Create the directory and place the binary inside `~/svg-animator`:
   ```bash
   mkdir -p ~/svg-animator
   cp ./bin/svg-animator-linux ~/svg-animator/svg-animator
   chmod +x ~/svg-animator/svg-animator
   ```

2. Create or edit `~/svg-animator/config.json` (if you do not create it manually, the binary will automatically generate this default file on first launch):
   ```bash
   cat << 'EOF' > ~/svg-animator/config.json
   {
     "host": "0.0.0.0",
     "port": 8088,
     "data_dir": "."
   }
   EOF
   ```

3. Run the application from `~/svg-animator`:
   ```bash
   cd ~/svg-animator
   ./svg-animator
   ```

4. Override the port on the command line at any time without editing `config.json`:
   ```bash
   cd ~/svg-animator
   ./svg-animator -port 8090
   ```

When started from `~/svg-animator`, the SQLite project library is stored at `~/svg-animator/studio_library.db` and temporary frame pipes use `~/svg-animator/render_workspace`.

---

## 3. Option B: Running as a Persistent `systemd` Service

You can run the service directly out of `/home/<your-user>/svg-animator` (or `/opt/svg-animator`). Below are two `systemd` unit configurations depending on how you prefer to manage the port.

### Method 1: Parameterized Service (`svg-animator@.service`) — Specify Port at Service Start
This allows you to specify the port directly in the `systemctl` command (for example, `systemctl start svg-animator@8088` or `systemctl start svg-animator@8095`).

Create `/etc/systemd/system/svg-animator@.service` (replace `YOUR_USER` with your Linux username, or use `/opt/svg-animator`):
```ini
[Unit]
Description=SVG Animator Studio Web IDE (Port %i)
After=network.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/home/YOUR_USER/svg-animator
ExecStart=/home/YOUR_USER/svg-animator/svg-animator -config /home/YOUR_USER/svg-animator/config.json -datadir /home/YOUR_USER/svg-animator -port %i
Restart=on-failure
RestartSec=3
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
```

Reload `systemd`, enable on boot, and start on port `8088`:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now svg-animator@8088
```

To switch to port `8090` at any time:
```bash
sudo systemctl stop svg-animator@8088
sudo systemctl start svg-animator@8090
```

### Method 2: Standard Service (`svg-animator.service`) Using `config.json` or `/etc/default/svg-animator`
If you prefer a standard service name (`svg-animator.service`) that reads its port from `~/svg-animator/config.json` (and optionally allows overriding via `/etc/default/svg-animator`):

Create `/etc/systemd/system/svg-animator.service`:
```ini
[Unit]
Description=SVG Animator Studio Web IDE
After=network.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/home/YOUR_USER/svg-animator
EnvironmentFile=-/etc/default/svg-animator
ExecStart=/home/YOUR_USER/svg-animator/svg-animator -config /home/YOUR_USER/svg-animator/config.json -datadir /home/YOUR_USER/svg-animator $EXTRA_ARGS
Restart=on-failure
RestartSec=3
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
```

Optionally create `/etc/default/svg-animator` to override the port at service start:
```bash
# Uncomment either line to override config.json at service start:
# SVG_ANIMATOR_PORT=8088
# EXTRA_ARGS="-port 8088"
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now svg-animator
```

### Checking Service Status & Logs
```bash
sudo systemctl status svg-animator
sudo journalctl -u svg-animator -f
```