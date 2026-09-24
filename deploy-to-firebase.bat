@echo off
cd /d "%~dp0"
title CleanIQ - Deploy to Firebase Hosting
color 0b
echo ===============================================================
echo                CleanIQ Firebase Deployment
echo ===============================================================
echo.
echo [1/2] Connecting to Firebase...
echo A browser window will open shortly.
echo Please sign in with: ctabdulhadhi@gmail.com
echo.
call firebase login
echo.
echo [2/2] Deploying site to Firebase Hosting (cleaniq-a1f4f)...
call firebase deploy --only hosting
echo.
echo ===============================================================
echo  Your site is live at: https://cleaniq-a1f4f.web.app
echo ===============================================================
pause
