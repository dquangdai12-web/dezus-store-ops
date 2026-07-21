/*
  Dezus Store Ops Web - NO SQLite / NO Python build version
  Database: data/store_ops.json
  Run: npm install && npm start
*/
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_DEZUS_STORE_OPS_SECRET';
const ROOT = __dirname;
const STORAGE_ROOT = process.env.STORAGE_ROOT || ROOT;
const DATA_DIR = process.env.DATA_DIR || path.join(STORAGE_ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'store_ops.json');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(STORAGE_ROOT, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /image|pdf|word|excel|spreadsheet|octet-stream/.test(file.mimetype || '') || /\.(jpg|jpeg|png|webp|pdf|docx?|xlsx?|csv)$/i.test(file.originalname || '');
    cb(ok ? null : new Error('File không hợp lệ'), ok);
  }
});

app.use(express.json({ limit: '6mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(ROOT, 'public')));

const ROLE_DEFAULTS = {
  admin: {
    can_assign_tasks: 1, can_manage_violations: 1, can_grade_checklists: 1,
    can_manage_sales: 1, can_view_reports: 1, can_manage_users: 1, can_export: 1
  },
  manager: {
    can_assign_tasks: 1, can_manage_violations: 1, can_grade_checklists: 1,
    can_manage_sales: 1, can_view_reports: 1, can_manage_users: 0, can_export: 1
  },
  employee: {
    can_assign_tasks: 0, can_manage_violations: 0, can_grade_checklists: 0,
    can_manage_sales: 0, can_view_reports: 0, can_manage_users: 0, can_export: 0
  }
};

function nowIso() { return new Date().toISOString(); }
function dateOnly(d) { return new Date(d).toISOString().slice(0, 10); }
function toNumber(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function slugCode(name) { return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').toUpperCase(); }

function defaultDb() {
  const stores = ['Bà Triệu', 'Đà Nẵng', 'Quận 1', 'Quận 7', 'Hanoi Centre'].map((name, i) => ({ id: i + 1, name, code: slugCode(name), status: 'active' }));
  const hash = bcrypt.hashSync('123456', 10);
  const sid = (name) => stores.find(s => s.name === name).id;
  const users = [
    { id: 1, full_name: 'Admin PKD', username: 'admin', password_hash: hash, role: 'admin', store_id: null, status: 'active', created_at: nowIso() },
    { id: 2, full_name: 'QL Bà Triệu', username: 'qly.bt', password_hash: hash, role: 'manager', store_id: sid('Bà Triệu'), status: 'active', created_at: nowIso() },
    { id: 3, full_name: 'ĐSKD Bà Triệu 01', username: 'nv.bt1', password_hash: hash, role: 'employee', store_id: sid('Bà Triệu'), status: 'active', created_at: nowIso() },
    { id: 4, full_name: 'ĐSKD Bà Triệu 02', username: 'nv.bt2', password_hash: hash, role: 'employee', store_id: sid('Bà Triệu'), status: 'active', created_at: nowIso() },
    { id: 5, full_name: 'QL Đà Nẵng', username: 'qly.dn', password_hash: hash, role: 'manager', store_id: sid('Đà Nẵng'), status: 'active', created_at: nowIso() },
    { id: 6, full_name: 'ĐSKD Đà Nẵng 01', username: 'nv.dn1', password_hash: hash, role: 'employee', store_id: sid('Đà Nẵng'), status: 'active', created_at: nowIso() }
  ];
  const permissions = users.map(u => ({ user_id: u.id, ...ROLE_DEFAULTS[u.role] }));
  return {
    version: 2,
    nextIds: { stores: 6, users: 7, tasks: 1, task_assignees: 1, violations: 1, assessments: 1, assessment_items: 1, sales: 1 },
    stores, users, permissions,
    tasks: [], task_assignees: [], violations: [], assessments: [], assessment_items: [], sales: []
  };
}

let db = loadDb();

function loadDb() {
  if (!fs.existsSync(DB_PATH)) {
    const fresh = defaultDb();
    fs.writeFileSync(DB_PATH, JSON.stringify(fresh, null, 2), 'utf8');
    return fresh;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    const base = defaultDb();
    return {
      ...base,
      ...parsed,
      nextIds: { ...base.nextIds, ...(parsed.nextIds || {}) },
      stores: parsed.stores || base.stores,
      users: parsed.users || base.users,
      permissions: parsed.permissions || base.permissions,
      tasks: parsed.tasks || [],
      task_assignees: parsed.task_assignees || [],
      violations: parsed.violations || [],
      assessments: parsed.assessments || [],
      assessment_items: parsed.assessment_items || [],
      sales: parsed.sales || []
    };
  } catch (err) {
    const backup = DB_PATH + `.broken-${Date.now()}.bak`;
    fs.copyFileSync(DB_PATH, backup);
    const fresh = defaultDb();
    fs.writeFileSync(DB_PATH, JSON.stringify(fresh, null, 2), 'utf8');
    console.error('Database JSON lỗi, đã tạo lại file mới. Backup:', backup);
    return fresh;
  }
}

function saveDb() {
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_PATH);
}

function nextId(name) {
  const id = Number(db.nextIds[name] || 1);
  db.nextIds[name] = id + 1;
  return id;
}

function getStore(id) { return db.stores.find(s => Number(s.id) === Number(id)); }
function getUser(id) { return db.users.find(u => Number(u.id) === Number(id)); }
function getActiveUser(id) { const u = getUser(id); return u && u.status === 'active' ? u : null; }
function getPermissions(userId, role) {
  const defaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.employee;
  const row = db.permissions.find(p => Number(p.user_id) === Number(userId)) || {};
  const out = { ...defaults };
  Object.keys(defaults).forEach(k => out[k] = Number(row[k] ?? defaults[k]));
  return out;
}
function setPermissions(userId, role, permissions) {
  const base = { ...ROLE_DEFAULTS[role], ...(permissions || {}) };
  let row = db.permissions.find(p => Number(p.user_id) === Number(userId));
  if (!row) {
    row = { user_id: Number(userId) };
    db.permissions.push(row);
  }
  Object.keys(ROLE_DEFAULTS.admin).forEach(k => row[k] = Number(base[k] || 0));
}
function withStore(row) {
  if (!row) return null;
  const s = row.store_id ? getStore(row.store_id) : null;
  return { ...row, store_name: s ? s.name : null };
}
function publicUser(row) {
  if (!row) return null;
  const u = withStore(row);
  return {
    id: u.id,
    full_name: u.full_name,
    username: u.username,
    role: u.role,
    store_id: u.store_id,
    store_name: u.store_name || null,
    status: u.status,
    permissions: getPermissions(u.id, u.role)
  };
}
function canAccessStore(req, storeId) { return req.user.role === 'admin' || Number(req.user.store_id) === Number(storeId); }

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const row = getActiveUser(payload.id);
    if (!row) return res.status(401).json({ error: 'Tài khoản không tồn tại hoặc đã bị khóa' });
    req.user = publicUser(row);
    next();
  } catch (_err) {
    return res.status(401).json({ error: 'Phiên đăng nhập hết hạn' });
  }
}
function requirePerm(permission) {
  return (req, res, next) => {
    if (req.user.role === 'admin' || Number(req.user.permissions[permission]) === 1) return next();
    return res.status(403).json({ error: 'Không có quyền thao tác mục này' });
  };
}

function saveUploadedFile(file) {
  if (!file) return null;
  const ext = path.extname(file.originalname || '').slice(0, 12) || '';
  const newName = `${file.filename}${ext}`;
  const nextPath = path.join(UPLOAD_DIR, newName);
  fs.renameSync(file.path, nextPath);
  return `/uploads/${newName}`;
}
function taskStatus(row) {
  if (row.completed_at) return new Date(row.completed_at) <= new Date(row.due_at) ? 'completed_on_time' : 'completed_late';
  return new Date() > new Date(row.due_at) ? 'overdue' : 'assigned';
}
function periodRange(period, ref) {
  const d = ref ? new Date(ref) : new Date();
  if (Number.isNaN(d.getTime())) throw new Error('Ngày không hợp lệ');
  let start, end;
  if (period === 'quarter') {
    const q = Math.floor(d.getMonth() / 3);
    start = new Date(Date.UTC(d.getFullYear(), q * 3, 1));
    end = new Date(Date.UTC(d.getFullYear(), q * 3 + 3, 1));
  } else if (period === 'year') {
    start = new Date(Date.UTC(d.getFullYear(), 0, 1));
    end = new Date(Date.UTC(d.getFullYear() + 1, 0, 1));
  } else {
    start = new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1));
    end = new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 1));
  }
  return { start: dateOnly(start), end: dateOnly(end) };
}
function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}
function toCsv(rows) {
  if (!rows.length) return 'Không có dữ liệu\n';
  const headers = Object.keys(rows[0]);
  return [headers.join(','), ...rows.map(r => headers.map(h => csvEscape(r[h])).join(','))].join('\n');
}
function loadChecklists() {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'checklists.json'), 'utf8'));
}
function dateVal(v) { return dateOnly(v || new Date()); }

function taskRowsForUser(user) {
  let rows = db.task_assignees.map(ta => {
    const t = db.tasks.find(x => Number(x.id) === Number(ta.task_id));
    const ass = getUser(ta.user_id);
    if (!t || !ass) return null;
    const s = getStore(t.store_id);
    const creator = getUser(t.created_by);
    return {
      assignment_id: ta.id,
      assignee_id: ta.user_id,
      assignee_name: ass.full_name,
      completed_at: ta.completed_at || null,
      evidence_path: ta.evidence_path || null,
      evidence_note: ta.evidence_note || '',
      points_delta: ta.points_delta || 0,
      ...t,
      store_name: s ? s.name : '',
      created_by_name: creator ? creator.full_name : ''
    };
  }).filter(Boolean);
  if (user.role === 'employee') rows = rows.filter(r => Number(r.assignee_id) === Number(user.id));
  else if (user.role === 'manager') rows = rows.filter(r => Number(r.store_id) === Number(user.store_id));
  return rows.map(r => ({ ...r, status: taskStatus(r) })).sort((a, b) => new Date(a.due_at) - new Date(b.due_at) || new Date(b.created_at) - new Date(a.created_at));
}

function violationRowsForUser(user) {
  let rows = db.violations.map(v => {
    const emp = getUser(v.user_id);
    const s = getStore(v.store_id);
    const c = getUser(v.created_by);
    return { ...v, employee_name: emp ? emp.full_name : '', store_name: s ? s.name : '', created_by_name: c ? c.full_name : '' };
  });
  if (user.role === 'employee') rows = rows.filter(v => Number(v.user_id) === Number(user.id));
  else if (user.role === 'manager') rows = rows.filter(v => Number(v.store_id) === Number(user.store_id));
  return rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function assessmentRowsForUser(user, templateId) {
  let rows = db.assessments.map(a => {
    const s = getStore(a.store_id);
    const emp = getUser(a.employee_id);
    const c = getUser(a.created_by);
    return { ...a, store_name: s ? s.name : '', employee_name: emp ? emp.full_name : '', created_by_name: c ? c.full_name : '' };
  });
  if (user.role === 'employee') {
    rows = rows.filter(a => (a.target_type === 'employee' && Number(a.employee_id) === Number(user.id)) || (a.target_type === 'store' && Number(a.store_id) === Number(user.store_id)));
  } else if (user.role === 'manager') {
    rows = rows.filter(a => Number(a.store_id) === Number(user.store_id));
  }
  if (templateId) rows = rows.filter(a => a.template_id === templateId);
  return rows.sort((a, b) => new Date(b.assessed_at) - new Date(a.assessed_at)).slice(0, 300);
}

function leaderboardRows(user, period, refDate) {
  const { start, end } = periodRange(period, refDate);
  let people = db.users.filter(u => u.status === 'active' && ['employee', 'manager'].includes(u.role));
  if (user.role === 'manager') people = people.filter(u => Number(u.store_id) === Number(user.store_id));
  if (user.role === 'employee') people = people.filter(u => Number(u.id) === Number(user.id));
  const rows = people.map(u => {
    const saleRows = db.sales.filter(sa => Number(sa.user_id) === Number(u.id) && String(sa.sale_date) >= start && String(sa.sale_date) < end);
    const revenue = saleRows.reduce((s, r) => s + Number(r.revenue || 0), 0);
    const bill_count = saleRows.reduce((s, r) => s + Number(r.bill_count || 0), 0);
    const guestsRows = db.assessments.filter(a => a.template_id === 'GUESTS' && Number(a.employee_id) === Number(u.id) && dateVal(a.assessed_at) >= start && dateVal(a.assessed_at) < end);
    const guests_percent = guestsRows.length ? guestsRows.reduce((s, a) => s + Number(a.percent || 0), 0) / guestsRows.length : 0;
    return { user_id: u.id, full_name: u.full_name, role: u.role, store_name: getStore(u.store_id)?.name || '', revenue, bill_count, guests_percent };
  }).sort((a, b) => b.revenue - a.revenue || b.guests_percent - a.guests_percent);
  const total = rows.reduce((s, r) => s + Number(r.revenue || 0), 0);
  return { period, start, end, leaderboard: rows.map((r, idx) => ({ ...r, rank: idx + 1, revenue_percent: total ? Math.round((r.revenue / total) * 10000) / 100 : 0 })) };
}

function computePerformance(scopeUser) {
  const now = new Date();
  let users = db.users.filter(u => u.status === 'active' && ['employee', 'manager'].includes(u.role));
  if (scopeUser.role === 'manager') users = users.filter(u => Number(u.store_id) === Number(scopeUser.store_id));
  if (scopeUser.role === 'employee') users = users.filter(u => Number(u.id) === Number(scopeUser.id));
  const revenueByUser = new Map();
  db.sales.forEach(sa => revenueByUser.set(Number(sa.user_id), (revenueByUser.get(Number(sa.user_id)) || 0) + Number(sa.revenue || 0)));
  const maxRevenue = Math.max(0, ...Array.from(revenueByUser.values()));
  return users.map(u => {
    const assignments = db.task_assignees.filter(ta => Number(ta.user_id) === Number(u.id)).map(ta => {
      const t = db.tasks.find(x => Number(x.id) === Number(ta.task_id));
      return t ? { completed_at: ta.completed_at, due_at: t.due_at } : null;
    }).filter(Boolean);
    let onTime = 0, late = 0, overdue = 0;
    assignments.forEach(a => {
      if (a.completed_at) {
        if (new Date(a.completed_at) <= new Date(a.due_at)) onTime += 1; else late += 1;
      } else if (now > new Date(a.due_at)) overdue += 1;
    });
    const totalTasks = assignments.length;
    const taskScore = totalTasks ? Math.max(0, Math.round((onTime / totalTasks) * 100 - late * 5 - overdue * 10)) : 100;
    const vRows = db.violations.filter(v => Number(v.user_id) === Number(u.id));
    const violationDeductions = vRows.reduce((s, v) => s + Number(v.points_deducted || 0), 0);
    const violationScore = Math.max(0, 100 - violationDeductions);
    const gRows = db.assessments.filter(a => a.template_id === 'GUESTS' && Number(a.employee_id) === Number(u.id));
    const guestScore = gRows.length ? Math.round(gRows.reduce((s, a) => s + Number(a.percent || 0), 0) / gRows.length) : 0;
    const revenue = revenueByUser.get(Number(u.id)) || 0;
    const revenueScore = maxRevenue ? Math.round((revenue / maxRevenue) * 100) : 0;
    const finalScore = Math.round(taskScore * 0.35 + violationScore * 0.20 + guestScore * 0.25 + revenueScore * 0.20);
    return {
      user_id: u.id,
      full_name: u.full_name,
      store_name: getStore(u.store_id)?.name || '',
      tasks_total: totalTasks,
      tasks_on_time: onTime,
      tasks_late: late,
      tasks_overdue: overdue,
      task_score: taskScore,
      violations_count: vRows.length,
      violation_deductions: violationDeductions,
      violation_score: violationScore,
      guests_score: guestScore,
      revenue,
      revenue_score: revenueScore,
      final_score: Math.min(100, Math.max(0, finalScore))
    };
  });
}

function storeSummaryRows(user) {
  let stores = db.stores.filter(s => s.status === 'active');
  if (user.role === 'manager') stores = stores.filter(s => Number(s.id) === Number(user.store_id));
  if (user.role === 'employee') stores = stores.filter(s => Number(s.id) === Number(user.store_id));
  return stores.map(s => {
    const ops = db.assessments.filter(a => Number(a.store_id) === Number(s.id) && a.template_id === 'OPS');
    const vm = db.assessments.filter(a => Number(a.store_id) === Number(s.id) && a.template_id === 'VM');
    const avg = rows => rows.length ? rows.reduce((sum, a) => sum + Number(a.percent || 0), 0) / rows.length : 0;
    const violations = db.violations.filter(v => Number(v.store_id) === Number(s.id)).length;
    return { store_id: s.id, store_name: s.name, ops_score: avg(ops), vm_score: avg(vm), violations };
  });
}

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const row = db.users.find(u => u.status === 'active' && String(u.username).toLowerCase() === String(username || '').trim().toLowerCase());
  if (!row || !bcrypt.compareSync(String(password || ''), row.password_hash)) return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
  const token = jwt.sign({ id: row.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: publicUser(row) });
});

app.get('/api/me', requireAuth, (req, res) => res.json({ user: req.user }));

app.get('/api/bootstrap', requireAuth, (req, res) => {
  const stores = db.stores.filter(s => s.status === 'active').sort((a, b) => a.id - b.id).map(clone);
  let users = db.users.filter(u => u.status === 'active');
  if (req.user.role === 'manager') users = users.filter(u => Number(u.store_id) === Number(req.user.store_id));
  users = users.sort((a, b) => Number(a.store_id || 0) - Number(b.store_id || 0) || a.role.localeCompare(b.role) || a.full_name.localeCompare(b.full_name, 'vi')).map(publicUser);
  res.json({ stores, users, currentUser: req.user });
});

app.get('/api/users', requireAuth, requirePerm('can_manage_users'), (req, res) => {
  const users = db.users
    .filter(u => u.status === 'active')
    .slice()
    .sort((a, b) => Number(a.store_id || 0) - Number(b.store_id || 0) || a.role.localeCompare(b.role) || a.full_name.localeCompare(b.full_name, 'vi'))
    .map(publicUser);
  res.json({ users });
});

app.post('/api/users', requireAuth, requirePerm('can_manage_users'), (req, res) => {
  const { full_name, username, password, role, store_id, permissions } = req.body || {};
  if (!full_name || !username || !password || !['admin', 'manager', 'employee'].includes(role)) return res.status(400).json({ error: 'Thiếu thông tin tài khoản' });
  if (db.users.some(u => String(u.username).toLowerCase() === String(username).trim().toLowerCase())) return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
  const id = nextId('users');
  db.users.push({ id, full_name: String(full_name).trim(), username: String(username).trim(), password_hash: bcrypt.hashSync(String(password), 10), role, store_id: store_id ? Number(store_id) : null, status: 'active', created_at: nowIso() });
  setPermissions(id, role, permissions || {});
  saveDb();
  res.json({ ok: true, id });
});

app.patch('/api/users/:id', requireAuth, requirePerm('can_manage_users'), (req, res) => {
  const id = Number(req.params.id);
  const existing = getUser(id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
  const { full_name, role, store_id, status, password, permissions } = req.body || {};
  if (full_name) existing.full_name = full_name;
  if (role && ['admin', 'manager', 'employee'].includes(role)) existing.role = role;
  existing.store_id = store_id === undefined ? existing.store_id : (store_id ? Number(store_id) : null);
  if (status) existing.status = status;
  if (password) existing.password_hash = bcrypt.hashSync(String(password), 10);
  setPermissions(id, existing.role, permissions || getPermissions(id, existing.role));
  saveDb();
  res.json({ ok: true });
});

app.delete('/api/users/:id', requireAuth, requirePerm('can_manage_users'), (req, res) => {
  const id = Number(req.params.id);
  const existing = getUser(id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
  if (Number(existing.id) === Number(req.user.id)) return res.status(400).json({ error: 'Không thể xóa chính tài khoản đang đăng nhập' });
  if (existing.role === 'admin') {
    const activeAdmins = db.users.filter(u => u.status === 'active' && u.role === 'admin');
    if (activeAdmins.length <= 1) return res.status(400).json({ error: 'Không thể xóa admin cuối cùng của hệ thống' });
  }
  existing.status = 'inactive';
  existing.deleted_at = nowIso();
  existing.deleted_by = req.user.id;
  existing.username = `${existing.username}__deleted_${existing.id}_${Date.now()}`;
  saveDb();
  res.json({ ok: true });
});

app.get('/api/tasks', requireAuth, (req, res) => res.json({ tasks: taskRowsForUser(req.user) }));

app.post('/api/tasks', requireAuth, requirePerm('can_assign_tasks'), (req, res) => {
  const { title, description, due_at, priority, store_id, assignee_ids, score_value } = req.body || {};
  if (!title || !due_at || !Array.isArray(assignee_ids) || assignee_ids.length === 0) return res.status(400).json({ error: 'Thiếu tiêu đề, hạn hoàn thành hoặc nhân viên nhận việc' });
  const storeId = req.user.role === 'admin' ? Number(store_id || req.user.store_id) : Number(req.user.store_id);
  if (!storeId || !canAccessStore(req, storeId)) return res.status(403).json({ error: 'Không có quyền giao việc cửa hàng này' });
  const validUsers = assignee_ids.map(Number).filter(uid => {
    const u = getActiveUser(uid);
    return u && Number(u.store_id) === Number(storeId);
  });
  if (!validUsers.length) return res.status(400).json({ error: 'Không có nhân viên hợp lệ để giao việc' });
  const taskId = nextId('tasks');
  db.tasks.push({ id: taskId, title, description: description || '', priority: priority || 'medium', due_at, store_id: storeId, score_value: Number(score_value || 10), created_by: req.user.id, created_at: nowIso() });
  [...new Set(validUsers)].forEach(uid => db.task_assignees.push({ id: nextId('task_assignees'), task_id: taskId, user_id: uid, completed_at: null, evidence_path: null, evidence_note: '', points_delta: 0 }));
  saveDb();
  res.json({ ok: true, id: taskId });
});

app.post('/api/tasks/:assignmentId/complete', requireAuth, upload.single('evidence'), (req, res) => {
  const assignmentId = Number(req.params.assignmentId);
  const ta = db.task_assignees.find(x => Number(x.id) === assignmentId);
  const t = ta ? db.tasks.find(x => Number(x.id) === Number(ta.task_id)) : null;
  if (!ta || !t) return res.status(404).json({ error: 'Không tìm thấy công việc' });
  const isOwner = Number(ta.user_id) === Number(req.user.id);
  const canManagerAct = req.user.role !== 'employee' && canAccessStore(req, t.store_id);
  if (!isOwner && !canManagerAct) return res.status(403).json({ error: 'Chỉ nhân viên được giao hoặc quản lý cửa hàng được hoàn thành việc này' });
  const evidencePath = saveUploadedFile(req.file);
  const completedAt = nowIso();
  const late = new Date(completedAt) > new Date(t.due_at);
  ta.completed_at = completedAt;
  if (evidencePath) ta.evidence_path = evidencePath;
  ta.evidence_note = req.body.note || '';
  ta.points_delta = late ? -Math.abs(Number(t.score_value || 10)) : 0;
  saveDb();
  res.json({ ok: true, status: late ? 'completed_late' : 'completed_on_time', points_delta: ta.points_delta });
});

app.get('/api/violations', requireAuth, (req, res) => res.json({ violations: violationRowsForUser(req.user) }));

app.post('/api/violations', requireAuth, requirePerm('can_manage_violations'), upload.single('evidence'), (req, res) => {
  const { user_id, violation_type, description, points_deducted } = req.body || {};
  const target = getActiveUser(Number(user_id));
  if (!target) return res.status(400).json({ error: 'Nhân viên không hợp lệ' });
  if (req.user.role !== 'admin' && Number(target.store_id) !== Number(req.user.store_id)) return res.status(403).json({ error: 'Không có quyền ghi nhận vi phạm nhân viên này' });
  const id = nextId('violations');
  db.violations.push({ id, user_id: target.id, store_id: target.store_id, violation_type: violation_type || 'Vi phạm vận hành', description: description || '', points_deducted: Math.abs(Number(points_deducted || 0)), evidence_path: saveUploadedFile(req.file), created_by: req.user.id, created_at: nowIso() });
  saveDb();
  res.json({ ok: true, id });
});

app.get('/api/checklist/templates', requireAuth, (_req, res) => res.json({ templates: loadChecklists() }));

app.post('/api/checklist/assessments', requireAuth, requirePerm('can_grade_checklists'), (req, res) => {
  const { template_id, store_id, employee_id, assessed_at, general_note, scores } = req.body || {};
  const template = loadChecklists().find(t => t.id === template_id);
  if (!template) return res.status(400).json({ error: 'Checklist không hợp lệ' });
  let storeId = Number(store_id || req.user.store_id);
  let empId = employee_id ? Number(employee_id) : null;
  if (template.target_type === 'employee') {
    const emp = getActiveUser(empId);
    if (!emp || !emp.store_id) return res.status(400).json({ error: 'Đại sứ kinh doanh không hợp lệ' });
    if (req.user.role !== 'admin' && Number(emp.store_id) !== Number(req.user.store_id)) return res.status(403).json({ error: 'Không có quyền chấm nhân viên này' });
    storeId = Number(emp.store_id);
  } else {
    empId = null;
  }
  if (!storeId || !canAccessStore(req, storeId)) return res.status(403).json({ error: 'Không có quyền chấm cửa hàng này' });
  const scoreMap = scores || {};
  let total = 0;
  template.items.forEach(item => {
    const raw = typeof scoreMap[item.id] === 'object' ? scoreMap[item.id].score : scoreMap[item.id];
    total += Math.max(0, Math.min(Number(item.max_score), toNumber(raw, 0)));
  });
  const max = template.max_score || template.items.reduce((s, i) => s + Number(i.max_score || 0), 0);
  const percent = max ? Math.round((total / max) * 10000) / 100 : 0;
  const assessmentId = nextId('assessments');
  db.assessments.push({ id: assessmentId, template_id: template.id, target_type: template.target_type, store_id: storeId, employee_id: empId, assessed_at: assessed_at || nowIso(), total_score: total, max_score: max, percent, general_note: general_note || '', created_by: req.user.id, created_at: nowIso() });
  template.items.forEach(item => {
    const input = scoreMap[item.id];
    const raw = typeof input === 'object' ? input.score : input;
    const note = typeof input === 'object' ? input.note : '';
    const score = Math.max(0, Math.min(Number(item.max_score), toNumber(raw, 0)));
    db.assessment_items.push({ id: nextId('assessment_items'), assessment_id: assessmentId, item_id: item.id, score, note: note || '' });
  });
  saveDb();
  res.json({ ok: true, id: assessmentId, total_score: total, max_score: max, percent });
});

app.get('/api/checklist/assessments', requireAuth, (req, res) => res.json({ assessments: assessmentRowsForUser(req.user, req.query.template_id) }));

app.get('/api/checklist/assessments/:id', requireAuth, (req, res) => {
  const a = assessmentRowsForUser(req.user).find(x => Number(x.id) === Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'Không tìm thấy phiếu chấm hoặc không có quyền xem' });
  const items = db.assessment_items.filter(i => Number(i.assessment_id) === Number(a.id));
  res.json({ assessment: a, items });
});

app.post('/api/sales', requireAuth, requirePerm('can_manage_sales'), (req, res) => {
  const { user_id, sale_date, revenue, bill_count, note } = req.body || {};
  const target = getActiveUser(Number(user_id));
  if (!target) return res.status(400).json({ error: 'Nhân viên không hợp lệ' });
  if (req.user.role !== 'admin' && Number(target.store_id) !== Number(req.user.store_id)) return res.status(403).json({ error: 'Không có quyền nhập doanh thu nhân viên này' });
  const id = nextId('sales');
  db.sales.push({ id, user_id: target.id, store_id: target.store_id, sale_date: sale_date || dateOnly(new Date()), revenue: Number(revenue || 0), bill_count: Number(bill_count || 0), note: note || '', created_by: req.user.id, created_at: nowIso() });
  saveDb();
  res.json({ ok: true, id });
});

app.get('/api/sales/leaderboard', requireAuth, (req, res) => {
  const { period = 'month', date } = req.query;
  res.json(leaderboardRows(req.user, period, date));
});

app.get('/api/reports/performance', requireAuth, (req, res) => {
  if (req.user.role !== 'employee' && Number(req.user.permissions.can_view_reports) !== 1) return res.status(403).json({ error: 'Không có quyền xem tổng hợp' });
  const performance = computePerformance(req.user).sort((a, b) => b.final_score - a.final_score);
  res.json({ performance, storeSummary: storeSummaryRows(req.user) });
});

app.get('/api/export/:type.csv', requireAuth, requirePerm('can_export'), (req, res) => {
  const type = req.params.type;
  let rows = [];
  if (type === 'tasks') {
    rows = taskRowsForUser(req.user).map(r => ({ task_id: r.id, title: r.title, priority: r.priority, due_at: r.due_at, store_name: r.store_name, assignee_name: r.assignee_name, completed_at: r.completed_at, evidence_path: r.evidence_path, evidence_note: r.evidence_note, points_delta: r.points_delta, status: r.status }));
  } else if (type === 'violations') {
    rows = violationRowsForUser(req.user);
  } else if (type === 'assessments') {
    rows = assessmentRowsForUser(req.user);
  } else if (type === 'sales') {
    rows = db.sales.map(sa => ({ ...sa, employee_name: getUser(sa.user_id)?.full_name || '', store_name: getStore(sa.store_id)?.name || '' }));
    if (req.user.role === 'manager') rows = rows.filter(r => Number(r.store_id) === Number(req.user.store_id));
    rows = rows.sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date));
  } else if (type === 'performance') {
    rows = computePerformance(req.user);
  } else {
    return res.status(404).json({ error: 'Loại xuất dữ liệu không hợp lệ' });
  }
  res.header('Content-Type', 'text/csv; charset=utf-8');
  res.attachment(`${type}-${dateOnly(new Date())}.csv`);
  res.send('\uFEFF' + toCsv(rows));
});

app.get('*', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log('==========================================');
  console.log('DEZUS STORE OPS WEB IS RUNNING');
  console.log(`Open: http://localhost:${PORT}`);
  console.log('Default login: admin / 123456');
  console.log('Data file: data/store_ops.json');
  console.log('==========================================');
});
