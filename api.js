// FSC EUDR Portal — API Client
// ─────────────────────────────────────────────────────────────────────────────
// Wraps calls to Google Apps Script Web App with CORS-safe text/plain encoding.
// When DEMO_MODE=true (URL not configured), uses local demo credentials.
// ─────────────────────────────────────────────────────────────────────────────
import { APPS_SCRIPT_URL, DEMO_MODE } from './config.js';

// ─── Demo data (used when APPS_SCRIPT_URL is still a placeholder) ─────────────
const DEMO_CREDENTIALS = { username: 'admin', password: 'Admin@1234' };
const DEMO_USER = {
    id: 'USR-000001',
    username: 'admin',
    fullName: 'ผู้ดูแลระบบ (Demo Mode)',
    role: 'admin',
    roleLevel: 5,
    department: 'FSC Staff'
};

// ─── Core fetch wrapper ────────────────────────────────────────────────────────
// Uses Content-Type: text/plain to avoid CORS preflight on Apps Script Web Apps
async function apiCall(action, data = {}) {
    const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, ...data }),
        redirect: 'follow',
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
}

// ─── Auth: Login ──────────────────────────────────────────────────────────────
export async function authLogin(username, password) {
    if (DEMO_MODE) {
        // Simulate network latency so the loading state is visible
        await new Promise(r => setTimeout(r, 700));
        if (username === DEMO_CREDENTIALS.username && password === DEMO_CREDENTIALS.password) {
            return {
                success: true,
                token: 'demo-' + Date.now(),
                user: DEMO_USER,
                expiresAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
            };
        }
        return { success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
    }
    return apiCall('login', { username, password });
}

// ─── Auth: Validate Token ─────────────────────────────────────────────────────
export async function authValidateToken(token) {
    if (DEMO_MODE) {
        // Demo tokens start with 'demo-'
        if (token && token.startsWith('demo-')) return { valid: true, user: DEMO_USER };
        return { valid: false };
    }
    try {
        return await apiCall('validateToken', { token });
    } catch {
        return { valid: false };
    }
}

// ─── Auth: Logout ─────────────────────────────────────────────────────────────
export async function authLogout(token) {
    if (DEMO_MODE) return { success: true };
    try {
        return await apiCall('logout', { token });
    } catch {
        return { success: true }; // Silent fail — session already cleared client-side
    }
}
