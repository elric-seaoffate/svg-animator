@echo off
echo ========================================================
echo   Compiling SVG Animator Studio for Windows...
echo ========================================================

:: Ensure dependencies are tidy
go mod tidy

:: Build the binary
go build -o svg-animator.exe .\cmd\svg-animator\main.go

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Build failed. Please check your Go installation.
    pause
    exit /b %ERRORLEVEL%
)

echo ========================================================
echo   Build successful! Binary created: svg-animator.exe
echo   Starting Web Studio on http://localhost:8088 ...
echo   (Press Ctrl+C to stop the server)
echo ========================================================

:: Run the server
svg-animator.exe -serve :8088
pause
