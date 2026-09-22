@echo off
title 素质测评填表助手（新版）
cd /d "%~dp0"

echo ============================================
echo    徐海学院素质测评填表助手（新版）启动
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 没有检测到 Node.js。
  echo 请先到 https://nodejs.org 下载安装 LTS 版，装完后重新双击本文件。
  echo.
  pause
  exit /b 1
)

echo 启动中，几秒后会自动打开浏览器...
echo 使用期间请不要关闭本黑窗口；关闭窗口即停止程序。
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8002"
node server.mjs

pause
