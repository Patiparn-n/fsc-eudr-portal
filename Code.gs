// ─────────────────────────────────────────────────────────────────────────────
// FSC EUDR Portal — Google Apps Script Backend (Phase 1: Auth)
// ─────────────────────────────────────────────────────────────────────────────
// SETUP:
// 1. Go to https://script.google.com → New Project → paste this code
// 2. Update SPREADSHEET_ID below (create a new Google Sheet first)
// 3. Run setupSpreadsheet() ONCE to create sheets and seed admin user
// 4. Deploy: Deploy → New Deployment → Web App
//      Execute as: Me
//      Who has access: Anyone
// 5. Copy the Web App URL → paste into config.js on the frontend
// ─────────────────────────────────────────────────────────────────────────────

const SPREADSHEET_ID = 'YOUR_GOOGLE_SPREADSHEET_ID_HERE'; // ← แทนด้วย Sheet ID จริง
const SESSION_DURATION_HOURS = 8;

// ─── Main Entry Point ─────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    let result;

    switch (data.action) {
      case 'login':          result = handleLogin(data);         break;
      case 'validateToken':  result = handleValidateToken(data); break;
      case 'logout':         result = handleLogout(data);        break;
      case 'getUsers':       result = handleGetUsers(data);      break;
      case 'createUser':     result = handleCreateUser(data);    break;
      case 'updateUser':     result = handleUpdateUser(data);    break;
      default:
        result = { success: false, message: 'Unknown action: ' + data.action };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── Handle Login ─────────────────────────────────────────────────────────────
function handleLogin(data) {
  const { username, password } = data;
  if (!username || !password) {
    return { success: false, message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' };
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const usersSheet = ss.getSheetByName('Users');
  const rows = usersSheet.getDataRange().getValues();
  const headers = rows[0];
  const usernameCol = headers.indexOf('username');
  const passwordHashCol = headers.indexOf('password_hash');
  const activeCol = headers.indexOf('active');
  const idCol = headers.indexOf('id');
  const fullNameCol = headers.indexOf('full_name');
  const roleCol = headers.indexOf('role');
  const roleLevelCol = headers.indexOf('role_level');
  const deptCol = headers.indexOf('department');

  const inputHash = hashPassword(password);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row[usernameCol] === username) {
      if (String(row[activeCol]).toLowerCase() !== 'true' && row[activeCol] !== true) {
        return { success: false, message: 'บัญชีผู้ใช้นี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ' };
      }
      if (row[passwordHashCol] !== inputHash) {
        return { success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
      }
      // Password correct — create session
      const token = Utilities.getUuid();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + SESSION_DURATION_HOURS * 3600 * 1000);

      const sessionsSheet = ss.getSheetByName('Sessions');
      sessionsSheet.appendRow([token, row[idCol], now.toISOString(), expiresAt.toISOString()]);

      // Audit log
      logAudit(ss, row[idCol], row[fullNameCol], 'LOGIN', 'Sessions', token, '', '');

      return {
        success: true,
        token: token,
        expiresAt: expiresAt.toISOString(),
        user: {
          id: row[idCol],
          username: row[usernameCol],
          fullName: row[fullNameCol],
          role: row[roleCol],
          roleLevel: row[roleLevelCol],
          department: row[deptCol]
        }
      };
    }
  }
  return { success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
}

// ─── Handle Validate Token ────────────────────────────────────────────────────
function handleValidateToken(data) {
  const { token } = data;
  if (!token) return { valid: false };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sessionsSheet = ss.getSheetByName('Sessions');
  const rows = sessionsSheet.getDataRange().getValues();
  const headers = rows[0];
  const tokenCol = headers.indexOf('token');
  const userIdCol = headers.indexOf('user_id');
  const expiresAtCol = headers.indexOf('expires_at');

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row[tokenCol] === token) {
      const expiresAt = new Date(row[expiresAtCol]);
      if (new Date() > expiresAt) {
        // Expired — remove session row
        sessionsSheet.deleteRow(i + 1);
        return { valid: false };
      }
      // Token valid — fetch user data
      const userId = row[userIdCol];
      const user = getUserById(ss, userId);
      if (!user) return { valid: false };
      return { valid: true, user: user };
    }
  }
  return { valid: false };
}

// ─── Handle Logout ────────────────────────────────────────────────────────────
function handleLogout(data) {
  const { token } = data;
  if (!token) return { success: true };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sessionsSheet = ss.getSheetByName('Sessions');
  const rows = sessionsSheet.getDataRange().getValues();
  const headers = rows[0];
  const tokenCol = headers.indexOf('token');

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][tokenCol] === token) {
      sessionsSheet.deleteRow(i + 1);
      break;
    }
  }
  return { success: true };
}

// ─── Helper: Get User by ID ───────────────────────────────────────────────────
function getUserById(ss, userId) {
  const usersSheet = ss.getSheetByName('Users');
  const rows = usersSheet.getDataRange().getValues();
  const headers = rows[0];
  const idCol = headers.indexOf('id');
  const usernameCol = headers.indexOf('username');
  const fullNameCol = headers.indexOf('full_name');
  const roleCol = headers.indexOf('role');
  const roleLevelCol = headers.indexOf('role_level');
  const deptCol = headers.indexOf('department');
  const activeCol = headers.indexOf('active');

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idCol] === userId) {
      if (String(rows[i][activeCol]).toLowerCase() !== 'true' && rows[i][activeCol] !== true) {
        return null; // Account disabled
      }
      return {
        id: rows[i][idCol],
        username: rows[i][usernameCol],
        fullName: rows[i][fullNameCol],
        role: rows[i][roleCol],
        roleLevel: rows[i][roleLevelCol],
        department: rows[i][deptCol]
      };
    }
  }
  return null;
}

// ─── Helper: SHA-256 Password Hash ───────────────────────────────────────────
function hashPassword(password) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password,
    Utilities.Charset.UTF_8
  );
  return digest.map(function(b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

// ─── Helper: Audit Log ───────────────────────────────────────────────────────
function logAudit(ss, userId, userName, action, table, recordId, oldVal, newVal) {
  const auditSheet = ss.getSheetByName('AuditLog');
  if (!auditSheet) return;
  auditSheet.appendRow([
    new Date().toISOString(),
    userId, userName, action, table, recordId,
    JSON.stringify(oldVal), JSON.stringify(newVal)
  ]);
}

// ─── Handle Get Users (Phase 3) ───────────────────────────────────────────────
function handleGetUsers(data) {
  const { token } = data;
  const requester = requireRole(token, 5); // admin only
  if (!requester.success) return requester;

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const rows = ss.getSheetByName('Users').getDataRange().getValues();
  const h = rows[0];
  const users = [];
  for (let i = 1; i < rows.length; i++) {
    users.push({
      id: rows[i][h.indexOf('id')], username: rows[i][h.indexOf('username')],
      fullName: rows[i][h.indexOf('full_name')], role: rows[i][h.indexOf('role')],
      roleLevel: rows[i][h.indexOf('role_level')], department: rows[i][h.indexOf('department')],
      active: rows[i][h.indexOf('active')], createdBy: rows[i][h.indexOf('created_by')],
      createdAt: rows[i][h.indexOf('created_at')]
    });
  }
  return { success: true, users };
}

// ─── Handle Create User (Phase 3) ────────────────────────────────────────────
function handleCreateUser(data) {
  const { token } = data;
  const requester = requireRole(token, 5);
  if (!requester.success) return requester;
  if (data.roleLevel >= requester.user.roleLevel) {
    return { success: false, message: 'ไม่สามารถสร้างผู้ใช้ที่มี role สูงกว่าหรือเท่ากับตนเองได้' };
  }
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Users');
  const rows = sheet.getDataRange().getValues();
  const h = rows[0];
  // Check duplicate username
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][h.indexOf('username')] === data.username) {
      return { success: false, message: `ชื่อผู้ใช้ "${data.username}" มีในระบบอยู่แล้ว` };
    }
  }
  const newId = 'USR-' + String(rows.length).padStart(6, '0');
  sheet.appendRow([newId, data.username, hashPassword(data.password), data.fullName,
    data.role, data.roleLevel, data.department, true, data.createdBy, new Date().toISOString()]);
  logAudit(ss, requester.user.id, requester.user.fullName, 'CREATE_USER', 'Users', newId, '', data.username);
  return { success: true, userId: newId };
}

// ─── Handle Update User (Phase 3) ────────────────────────────────────────────
function handleUpdateUser(data) {
  const { token } = data;
  const requester = requireRole(token, 5);
  if (!requester.success) return requester;

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Users');
  const rows = sheet.getDataRange().getValues();
  const h = rows[0];

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][h.indexOf('id')] === data.userId) {
      if (data.fullName  !== undefined) sheet.getRange(i + 1, h.indexOf('full_name') + 1).setValue(data.fullName);
      if (data.department !== undefined) sheet.getRange(i + 1, h.indexOf('department') + 1).setValue(data.department);
      if (data.role      !== undefined) sheet.getRange(i + 1, h.indexOf('role') + 1).setValue(data.role);
      if (data.roleLevel !== undefined) sheet.getRange(i + 1, h.indexOf('role_level') + 1).setValue(data.roleLevel);
      if (data.active    !== undefined) sheet.getRange(i + 1, h.indexOf('active') + 1).setValue(data.active);
      if (data.password  !== undefined) sheet.getRange(i + 1, h.indexOf('password_hash') + 1).setValue(hashPassword(data.password));
      logAudit(ss, requester.user.id, requester.user.fullName, 'UPDATE_USER', 'Users', data.userId, '', '');
      return { success: true };
    }
  }
  return { success: false, message: 'ไม่พบผู้ใช้งาน' };
}

// ─── Helper: Require Role Level ───────────────────────────────────────────────
function requireRole(token, minLevel) {
  const v = handleValidateToken({ token });
  if (!v.valid) return { success: false, message: 'Session หมดอายุหรือไม่ถูกต้อง' };
  if ((v.user.roleLevel || 0) < minLevel) return { success: false, message: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' };
  return { success: true, user: v.user };
}

// ─────────────────────────────────────────────────────────────────────────────
// SETUP FUNCTION — Run this ONCE after creating the Google Sheet
// Go to Apps Script editor → Run → setupSpreadsheet
// ─────────────────────────────────────────────────────────────────────────────
function setupSpreadsheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // ── Users Sheet ──
  let usersSheet = ss.getSheetByName('Users');
  if (!usersSheet) usersSheet = ss.insertSheet('Users');
  usersSheet.clearContents();
  usersSheet.appendRow([
    'id', 'username', 'password_hash', 'full_name', 'role', 'role_level',
    'department', 'active', 'created_by', 'created_at'
  ]);
  // Seed admin user: admin / Admin@1234
  usersSheet.appendRow([
    'USR-000001',
    'admin',
    hashPassword('Admin@1234'),
    'ผู้ดูแลระบบ',
    'admin',
    5,
    'IT',
    true,
    'system',
    new Date().toISOString()
  ]);

  // ── Sessions Sheet ──
  let sessionsSheet = ss.getSheetByName('Sessions');
  if (!sessionsSheet) sessionsSheet = ss.insertSheet('Sessions');
  sessionsSheet.clearContents();
  sessionsSheet.appendRow(['token', 'user_id', 'created_at', 'expires_at']);

  // ── AuditLog Sheet ──
  let auditSheet = ss.getSheetByName('AuditLog');
  if (!auditSheet) auditSheet = ss.insertSheet('AuditLog');
  auditSheet.clearContents();
  auditSheet.appendRow([
    'timestamp', 'user_id', 'user_name', 'action', 'table', 'record_id', 'old_value', 'new_value'
  ]);

  // ── Plantations Sheet (Phase 2 — structure only) ──
  let pltSheet = ss.getSheetByName('Plantations');
  if (!pltSheet) pltSheet = ss.insertSheet('Plantations');
  if (pltSheet.getLastRow() === 0) {
    pltSheet.appendRow(['id', 'plotCode', 'owner', 'status', 'createdBy', 'createdAt', 'approvedBy', 'approvedAt']);
  }

  Logger.log('Setup complete! Admin: admin / Admin@1234');
  Logger.log('Users: ' + usersSheet.getLastRow() + ' rows');
}

// ─────────────────────────────────────────────────────────────────────────────
// Role Level Reference:
//   5 = admin
//   4 = manager
//   3 = fsc_staff
//   2 = procurement_mgr
//   1 = procurement
//
// To add a new user, run addUser() in Apps Script console:
//   addUser('john', 'Password@123', 'นายจอห์น ดี', 'procurement', 1, 'จัดซื้อ', 'admin')
// ─────────────────────────────────────────────────────────────────────────────
function addUser(username, password, fullName, role, roleLevel, department, createdBy) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const usersSheet = ss.getSheetByName('Users');
  const lastId = usersSheet.getLastRow(); // simple auto-increment
  const newId = 'USR-' + String(lastId).padStart(6, '0');
  usersSheet.appendRow([
    newId, username, hashPassword(password), fullName, role, roleLevel,
    department, true, createdBy, new Date().toISOString()
  ]);
  Logger.log('Added user: ' + username + ' (' + newId + ')');
}
