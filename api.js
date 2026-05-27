// FSC EUDR Portal — API Client
// ─────────────────────────────────────────────────────────────────────────────
// Wraps calls to Google Apps Script Web App with CORS-safe text/plain encoding.
// When DEMO_MODE=true (URL not configured), uses local demo credentials.
// ─────────────────────────────────────────────────────────────────────────────
import { APPS_SCRIPT_URL, DEMO_MODE } from './config.js';

// ─── Demo users (ใช้เมื่อ APPS_SCRIPT_URL ยังเป็น placeholder) ──────────────
// username → { password, user }
const DEMO_USERS = {
    'admin': {
        password: 'Admin@1234',
        user: {
            id: 'USR-000001',
            username: 'admin',
            fullName: 'นายสมศักดิ์ ดูแลระบบ (Demo)',
            role: 'admin',
            roleLevel: 5,
            department: 'IT'
        }
    },
    'manager': {
        password: 'Manager@1234',
        user: {
            id: 'USR-000002',
            username: 'manager',
            fullName: 'นายวิชัย จัดการงาน (Demo)',
            role: 'manager',
            roleLevel: 4,
            department: 'Management'
        }
    },
    'fsc_staff': {
        password: 'FscStaff@1234',
        user: {
            id: 'USR-000003',
            username: 'fsc_staff',
            fullName: 'นางสาวพิมพ์ใจ ตรวจสอบ (Demo)',
            role: 'fsc_staff',
            roleLevel: 3,
            department: 'FSC Compliance'
        }
    },
    'proc_mgr': {
        password: 'ProcMgr@1234',
        user: {
            id: 'USR-000004',
            username: 'proc_mgr',
            fullName: 'นายประสิทธิ์ จัดซื้ออาวุโส (Demo)',
            role: 'procurement_mgr',
            roleLevel: 2,
            department: 'จัดซื้อ'
        }
    },
    'procurement': {
        password: 'Proc@1234',
        user: {
            id: 'USR-000005',
            username: 'procurement',
            fullName: 'นางสาวมณี รับซื้อไม้ (Demo)',
            role: 'procurement',
            roleLevel: 1,
            department: 'จัดซื้อ'
        }
    },
};

// Map token → username (in-memory session store for demo mode)
const DEMO_SESSIONS = {};

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
        await new Promise(r => setTimeout(r, 700)); // simulate latency
        const entry = DEMO_USERS[username];
        if (entry && entry.password === password) {
            const token = 'demo-' + username + '-' + Date.now();
            DEMO_SESSIONS[token] = username;
            return {
                success: true,
                token,
                user: entry.user,
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
        if (!token || !token.startsWith('demo-')) return { valid: false };
        // Try in-memory session first (same page load)
        const username = DEMO_SESSIONS[token];
        if (username && DEMO_USERS[username]) {
            return { valid: true, user: DEMO_USERS[username].user };
        }
        // Token from previous page load — extract username from token format
        // Format: demo-<username>-<timestamp>
        const parts = token.split('-');
        if (parts.length >= 3) {
            // username is everything between first and last segment
            const uname = parts.slice(1, -1).join('-');
            if (DEMO_USERS[uname]) {
                DEMO_SESSIONS[token] = uname;
                return { valid: true, user: DEMO_USERS[uname].user };
            }
        }
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
    if (DEMO_MODE) {
        delete DEMO_SESSIONS[token];
        return { success: true };
    }
    try {
        return await apiCall('logout', { token });
    } catch {
        return { success: true }; // Silent fail — session already cleared client-side
    }
}
