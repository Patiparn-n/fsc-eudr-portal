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

// Map token → user object (in-memory session store for demo mode)
const DEMO_SESSIONS = {};

// ─── Demo User Storage Helpers (Phase 3) ─────────────────────────────────────
// Users are persisted in localStorage so newly-created accounts survive refresh.
// On first access the store is seeded from DEMO_USERS above.
function getStoredDemoUsers() {
    try {
        const stored = localStorage.getItem('fsc_eudr_users');
        if (stored) return JSON.parse(stored);
    } catch {}
    // First-time seed from hardcoded DEMO_USERS
    const seeded = Object.entries(DEMO_USERS).map(([, entry]) => ({
        ...entry.user, password: entry.password,
        active: true, createdBy: 'system', createdAt: new Date().toISOString()
    }));
    localStorage.setItem('fsc_eudr_users', JSON.stringify(seeded));
    return seeded;
}
function saveStoredDemoUsers(users) {
    localStorage.setItem('fsc_eudr_users', JSON.stringify(users));
}
function demoUserToObj(u) {
    return { id: u.id, username: u.username, fullName: u.fullName, role: u.role, roleLevel: u.roleLevel, department: u.department };
}

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
        const users = getStoredDemoUsers();
        const u = users.find(u => u.username === username);
        if (!u) return { success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
        if (!u.active) return { success: false, message: 'บัญชีผู้ใช้นี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ' };
        if (u.password !== password) return { success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
        const token = 'demo-' + username + '-' + Date.now();
        const userObj = demoUserToObj(u);
        DEMO_SESSIONS[token] = userObj;
        return {
            success: true, token, user: userObj,
            expiresAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
        };
    }
    return apiCall('login', { username, password });
}

// ─── Auth: Validate Token ─────────────────────────────────────────────────────
export async function authValidateToken(token) {
    if (DEMO_MODE) {
        if (!token || !token.startsWith('demo-')) return { valid: false };
        // In-memory session hit (same page load)
        if (DEMO_SESSIONS[token]) return { valid: true, user: DEMO_SESSIONS[token] };
        // Re-hydrate from token format: demo-<username>-<timestamp>
        const parts = token.split('-');
        if (parts.length >= 3) {
            const uname = parts.slice(1, -1).join('-');
            const users = getStoredDemoUsers();
            const u = users.find(u => u.username === uname && u.active);
            if (u) {
                const userObj = demoUserToObj(u);
                DEMO_SESSIONS[token] = userObj;
                return { valid: true, user: userObj };
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

// ─── Users: Get All (Phase 3) ─────────────────────────────────────────────────
export async function getUsers(token) {
    if (DEMO_MODE) {
        const users = getStoredDemoUsers();
        return {
            success: true,
            users: users.map(u => ({
                id: u.id, username: u.username, fullName: u.fullName,
                role: u.role, roleLevel: u.roleLevel, department: u.department,
                active: u.active, createdBy: u.createdBy, createdAt: u.createdAt
            }))
        };
    }
    return apiCall('getUsers', { token });
}

// ─── Users: Create (Phase 3) ──────────────────────────────────────────────────
export async function createUser(token, userData) {
    if (DEMO_MODE) {
        const users = getStoredDemoUsers();
        if (users.find(u => u.username === userData.username)) {
            return { success: false, message: `ชื่อผู้ใช้ "${userData.username}" มีในระบบอยู่แล้ว` };
        }
        const maxNum = users.reduce((max, u) => {
            const n = parseInt(u.id.replace('USR-', '')) || 0;
            return n > max ? n : max;
        }, 0);
        const newId = 'USR-' + String(maxNum + 1).padStart(6, '0');
        users.push({
            id: newId,
            username: userData.username,
            password: userData.password,
            fullName: userData.fullName,
            role: userData.role,
            roleLevel: userData.roleLevel,
            department: userData.department,
            active: true,
            createdBy: userData.createdBy || 'admin',
            createdAt: new Date().toISOString()
        });
        saveStoredDemoUsers(users);
        return { success: true, userId: newId };
    }
    return apiCall('createUser', { token, ...userData });
}

// ─── Users: Update (Phase 3) ──────────────────────────────────────────────────
export async function updateUser(token, userId, changes) {
    if (DEMO_MODE) {
        const users = getStoredDemoUsers();
        const idx = users.findIndex(u => u.id === userId);
        if (idx === -1) return { success: false, message: 'ไม่พบผู้ใช้งาน' };
        users[idx] = { ...users[idx], ...changes };
        saveStoredDemoUsers(users);
        return { success: true };
    }
    return apiCall('updateUser', { token, userId, ...changes });
}
