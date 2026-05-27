// FSC EUDR Portal — Backend Configuration
// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: Auth System
//
// SETUP INSTRUCTIONS:
// 1. Deploy Google Apps Script Web App (see Code.gs in this folder)
// 2. Copy the Web App URL from Apps Script → Deploy → Manage Deployments
// 3. Replace 'YOUR_APPS_SCRIPT_WEB_APP_URL_HERE' below with the actual URL
// 4. Save this file and push to GitHub Pages
//
// While APPS_SCRIPT_URL is still a placeholder, the system runs in DEMO MODE:
//   Username: admin  /  Password: Admin@1234
// ─────────────────────────────────────────────────────────────────────────────

export const APPS_SCRIPT_URL = 'YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';

// Session duration (hours) — must match SESSION_DURATION_HOURS in Code.gs
export const SESSION_HOURS = 8;

// Automatically true when URL is still a placeholder → uses built-in demo credentials
export const DEMO_MODE = APPS_SCRIPT_URL === 'YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';
