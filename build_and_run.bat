@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

if not exist "bin" mkdir "bin"
if not exist "release" mkdir "release"
if not exist "render_workspace" mkdir "render_workspace"

if not exist "config.json" (
    (
        echo {
        echo   "host": "0.0.0.0",
        echo   "port": 8088,
        echo   "data_dir": "."
        echo }
    ) > config.json
    echo ^>^> Created default config.json
)

echo ^>^> Tidying Go module dependencies...
go mod tidy
if %ERRORLEVEL% neq 0 (
    echo [ERROR] go mod tidy failed.
    exit /b %ERRORLEVEL%
)

echo ^>^> Building Windows executable (svg-animator.exe and bin\svg-animator-windows.exe)...
set CGO_ENABLED=0
set GOOS=windows
set GOARCH=amd64
go build -trimpath -ldflags="-s -w" -o bin\svg-animator-windows.exe .\cmd\svg-animator\main.go
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Windows build failed.
    exit /b %ERRORLEVEL%
)
copy /Y "bin\svg-animator-windows.exe" "svg-animator.exe" >nul

if "%BUILD_LINUX%"=="1" (
    echo ^>^> Cross-compiling Linux executable (bin\svg-animator-linux)...
    set CGO_ENABLED=0
    set GOOS=linux
    set GOARCH=amd64
    go build -trimpath -ldflags="-s -w" -o bin\svg-animator-linux .\cmd\svg-animator\main.go
)

if "%BUILD_ONLY%"=="1" (
    echo ^>^> Build complete (BUILD_ONLY=1).
    exit /b 0
)

echo ^>^> Starting SVG Animator Studio...
.\svg-animator.exe %*