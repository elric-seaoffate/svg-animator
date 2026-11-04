# Deployment Guide: SVG Animator Studio (Windows)

This guide covers installing runtime dependencies (FFmpeg and native Google Chrome), running `svg-animator.exe` from your user home folder (`%USERPROFILE%\svg-animator`), configuring `config.json`, and setting up `svg-animator.exe` as a persistent Windows Service via NSSM with a configurable port[cite: 3].

---

## 1. Prerequisites & Dependencies

The rasterization pipeline requires native **Google Chrome** and **FFmpeg** accessible on the system `PATH`[cite: 3].

### Install Native Google Chrome
Open PowerShell and run:
```powershell
Invoke-WebRequest -Uri "[https://dl.google.com/chrome/install/latest/chrome_installer.exe](https://dl.google.com/chrome/install/latest/chrome_installer.exe)" -OutFile "$env:TEMP\chrome_installer.exe"
Start-Process -FilePath "$env:TEMP\chrome_installer.exe" -ArgumentList "/silent /install" -Wait
Remove-Item "$env:TEMP\chrome_installer.exe"
```

Verify headless execution:
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --version
```

### Install FFmpeg
Open an Administrator PowerShell prompt and run:
```powershell
winget install "Gyan.FFmpeg"
```

Restart your PowerShell window and verify FFmpeg is on your `PATH`:
```powershell
ffmpeg -version
```

---

## 2. Option A: Running from Your Home Directory (`%USERPROFILE%\svg-animator`)

1. Create the folder in your user home directory and copy the executable:
   ```powershell
   New-Item -ItemType Directory -Path "$HOME\svg-animator" -Force
   Copy-Item -Path ".\bin\svg-animator-windows.exe" -Destination "$HOME\svg-animator\svg-animator.exe" -Force
   ```

2. Create `$HOME\svg-animator\config.json` (if omitted, `svg-animator.exe` automatically generates this file on first launch):
   ```powershell
   @"
   {
     "host": "0.0.0.0",
     "port": 8088,
     "data_dir": "."
   }
   "@ | Set-Content -Path "$HOME\svg-animator\config.json" -Encoding UTF8
   ```

3. Run the application from `$HOME\svg-animator`:
   ```powershell
   cd "$HOME\svg-animator"
   .\svg-animator.exe
   ```

4. Override the port on the command line at startup:
   ```powershell
   cd "$HOME\svg-animator"
   .\svg-animator.exe -port 8090
   ```

---

## 3. Option B: Running as a Persistent Windows Service (via NSSM)

1. Install NSSM from an Administrator PowerShell prompt[cite: 3]:
   ```powershell
   winget install "NSSM.NSSM"
   ```

2. Deploy the binary and `config.json` to either `C:\svg-animator` or `$HOME\svg-animator` (below uses `C:\svg-animator`):
   ```powershell
   New-Item -ItemType Directory -Path "C:\svg-animator" -Force
   Copy-Item -Path ".\bin\svg-animator-windows.exe" -Destination "C:\svg-animator\svg-animator.exe" -Force
   ```

3. Register the Windows Service with `-config`, `-datadir`, and `-port` specified at service start:
   ```powershell
   nssm install SVGAnimator "C:\svg-animator\svg-animator.exe"
   nssm set SVGAnimator AppParameters "-config C:\svg-animator\config.json -datadir C:\svg-animator -port 8088"
   nssm set SVGAnimator AppDirectory "C:\svg-animator"
   nssm set SVGAnimator DisplayName "SVG Animator Studio Web Service"
   nssm set SVGAnimator Description "Persistent web IDE and rasterization pipeline for SVG Animator Studio."
   nssm set SVGAnimator Start SERVICE_AUTO_START
   nssm set SVGAnimator AppStdout "C:\svg-animator\service.log"
   nssm set SVGAnimator AppStderr "C:\svg-animator\service_error.log"
   ```
   *(Note: If you want the service to use the port inside `C:\svg-animator\config.json` instead of forcing `-port 8088` on the command line, omit `-port 8088` from `AppParameters`.)*

4. Start and verify the service[cite: 3]:
   ```powershell
   Start-Service -Name "SVGAnimator"
   Get-Service -Name "SVGAnimator"
   ```

5. Change the service port at any time via PowerShell:
   ```powershell
   Stop-Service -Name "SVGAnimator"
   nssm set SVGAnimator AppParameters "-config C:\svg-animator\config.json -datadir C:\svg-animator -port 8090"
   Start-Service -Name "SVGAnimator"
   ```

---

## 4. Logs & Troubleshooting

Tail the live service logs in PowerShell[cite: 3]:
```powershell
Get-Content -Path "C:\svg-animator\service.log" -Tail 50 -Wait
```