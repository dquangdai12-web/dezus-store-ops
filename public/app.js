const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  token: localStorage.getItem('dezus_ops_token') || '',
  user: null,
  boot: { stores: [], users: [] },
  templates: [],
  route: localStorage.getItem('dezus_ops_route') || 'dashboard',
  checklistType: 'OPS',
  leaderboardPeriod: 'month',
};

const app = $('#app');

const PERM_LABELS = {
  can_assign_tasks: 'Giao việc',
  can_manage_violations: 'Ghi vi phạm',
  can_grade_checklists: 'Chấm checklist',
  can_manage_sales: 'Nhập doanh thu',
  can_view_reports: 'Xem tổng hợp',
  can_manage_users: 'Quản lý TK',
  can_export: 'Tải dữ liệu',
};

function toast(message, type = 'ok') {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast ${type}`;
  setTimeout(() => el.classList.add('hidden'), 3200);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>'"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[m]));
}

function money(v) {
  return new Intl.NumberFormat('vi-VN').format(Number(v || 0));
}

function dt(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return esc(v);
  return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function dOnly(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return esc(v);
  return d.toLocaleDateString('vi-VN');
}

function apiUrl(path) { return path; }

async function api(path, opts = {}) {
  const headers = opts.headers || {};
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(apiUrl(path), { ...opts, headers });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data.error || data || 'Có lỗi xảy ra');
  return data;
}

async function downloadExport(type) {
  try {
    const res = await fetch(`/api/export/${type}.csv`, { headers: { Authorization: `Bearer ${state.token}` } });
    if (!res.ok) throw new Error('Không tải được dữ liệu');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) { toast(err.message, 'danger'); }
}

function statusBadge(status) {
  const map = {
    assigned: ['Đang mở', 'dark'],
    overdue: ['Không hoàn thành đúng hạn', 'danger'],
    completed_on_time: ['Hoàn thành đúng hạn', 'ok'],
    completed_late: ['Hoàn thành trễ hạn / bị trừ điểm', 'warn'],
  };
  const [label, cls] = map[status] || [status, ''];
  return `<span class="badge ${cls}">${label}</span>`;
}

function roleLabel(role) {
  return role === 'admin' ? 'Admin' : role === 'manager' ? 'Quản lý' : 'Nhân viên';
}

function storeName(id) {
  return state.boot.stores.find(s => Number(s.id) === Number(id))?.name || '';
}

function employees() {
  return state.boot.users.filter(u => u.role !== 'admin');
}

function usersInStore(storeId) {
  return employees().filter(u => !storeId || Number(u.store_id) === Number(storeId));
}

function can(p) {
  return state.user?.role === 'admin' || Number(state.user?.permissions?.[p]) === 1;
}

function navItems() {
  const items = [
    ['dashboard', 'Tổng quan', '◆'],
    ['tasks', 'Công việc', '✓'],
    ['violations', 'Vi phạm', '!'],
    ['checklists', 'Checklist', '★'],
    ['sales', 'Doanh thu', '%'],
  ];
  if (state.user?.role !== 'employee' || can('can_view_reports')) items.push(['reports', 'Tổng hợp điểm', '100']);
  if (can('can_manage_users')) items.push(['admin', 'Admin', '⚙']);
  return items;
}

function shell(content, title = 'Tổng quan', subtitle = 'Vận hành cửa hàng Dezus') {
  const nav = navItems().map(([id, label, dot]) => `<button class="nav-btn ${state.route === id ? 'active' : ''}" data-route="${id}"><span>${label}</span><span class="nav-dot">${dot}</span></button>`).join('');
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="logo">
          <div class="mark">DZ</div>
          <div><h1>Dezus Store Ops</h1><p>Store Operations</p></div>
        </div>
        <nav class="side-nav">${nav}</nav>
        <div class="side-bottom">
          <div class="user-pill"><b>${esc(state.user.full_name)}</b><span>${roleLabel(state.user.role)}${state.user.store_name ? ' • ' + esc(state.user.store_name) : ''}</span></div>
          <button class="btn secondary" id="logoutBtn">Đăng xuất</button>
        </div>
      </aside>
      <main class="main">
        <div class="topbar">
          <div class="page-title"><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>
          <div class="row mobile-top"><button class="btn secondary" id="logoutBtn2">Đăng xuất</button></div>
        </div>
        ${content}
      </main>
    </div>`;
  $$('.nav-btn').forEach(btn => btn.onclick = () => { state.route = btn.dataset.route; localStorage.setItem('dezus_ops_route', state.route); render(); });
  $('#logoutBtn')?.addEventListener('click', logout);
  $('#logoutBtn2')?.addEventListener('click', logout);
  $$('[data-export]').forEach(btn => btn.addEventListener('click', () => downloadExport(btn.dataset.export)));
}

function logout() {
  localStorage.removeItem('dezus_ops_token');
  state.token = '';
  state.user = null;
  renderLogin();
}

function renderLogin() {
  app.innerHTML = `
    <div class="login-wrap">
      <form class="login-card" id="loginForm">
        <section class="login-form-panel">
          <div class="logo"><div class="mark">DZ</div><div><h1>Dezus Store Ops</h1><p>Store Operations</p></div></div>
          <div class="login-copy">
            <h2>Đăng nhập hệ thống</h2>
            <p>Giao diện mới dùng font gọn kiểu ChatGPT, tông màu đậm vừa phải, bảng rõ và dễ thao tác trên điện thoại.</p>
          </div>
          <div class="field"><label>Tài khoản</label><input class="input" name="username" placeholder="Nhập tài khoản" autocomplete="username" required></div>
          <div class="field"><label>Mật khẩu</label><input class="input" name="password" type="password" placeholder="Mật khẩu" autocomplete="current-password" required></div>
          <button class="btn" style="width:100%;margin-top:8px">Đăng nhập</button>
          
        </section>
        <section class="login-art-panel">
          <div class="glass-badge">DEZUS STORE OPS</div>
          <h3>Vận hành cửa hàng</h3>
          <p>Giao việc • Checklist • Vi phạm • KPI 100 điểm</p>
          <div class="mini-metrics">
            <div><b>100</b><span>Điểm tổng</span></div>
            <div><b>3</b><span>Checklist</span></div>
            <div><b>CSV</b><span>Tải dữ liệu</span></div>
          </div>
        </section>
      </form>
    </div>`;
  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(fd)) });
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('dezus_ops_token', data.token);
      await loadBase();
      render();
    } catch (err) { toast(err.message, 'danger'); }
  };
}

async function loadBase() {
  const boot = await api('/api/bootstrap');
  state.user = boot.currentUser;
  state.boot = boot;
  const t = await api('/api/checklist/templates');
  state.templates = t.templates;
}

async function start() {
  if (!state.token) return renderLogin();
  try { await loadBase(); render(); } catch (_err) { logout(); }
}

async function render() {
  if (!state.user) return renderLogin();
  const active = navItems().some(([id]) => id === state.route) ? state.route : 'dashboard';
  state.route = active;
  if (active === 'dashboard') return renderDashboard();
  if (active === 'tasks') return renderTasks();
  if (active === 'violations') return renderViolations();
  if (active === 'checklists') return renderChecklists();
  if (active === 'sales') return renderSales();
  if (active === 'reports') return renderReports();
  if (active === 'admin') return renderAdmin();
}

async function renderDashboard() {
  const [tasksData, violationsData, leaderboardData, reportData] = await Promise.all([
    api('/api/tasks'),
    api('/api/violations'),
    api('/api/sales/leaderboard?period=month'),
    (state.user.role !== 'employee' || can('can_view_reports')) ? api('/api/reports/performance').catch(() => ({ performance: [], storeSummary: [] })) : Promise.resolve({ performance: [], storeSummary: [] }),
  ]);
  const tasks = tasksData.tasks;
  const open = tasks.filter(t => t.status === 'assigned').length;
  const late = tasks.filter(t => t.status === 'overdue' || t.status === 'completed_late').length;
  const done = tasks.filter(t => t.status === 'completed_on_time').length;
  const total = Math.max(tasks.length, 1);
  const onTimeRate = Math.round((done / total) * 100);
  const myPerf = reportData.performance.find(p => Number(p.user_id) === Number(state.user.id)) || reportData.performance[0] || {};
  const top = leaderboardData.leaderboard.slice(0, 5);
  const today = new Date().toLocaleDateString('vi-VN', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
  shell(`
    <section class="card hero-card">
      <div>
        <span class="badge dark">${esc(today)}</span>
        <h3>Xin chào, ${esc(state.user.full_name)}</h3>
        <p>Kiểm soát vận hành cửa hàng theo thời gian thực: việc cần làm, vi phạm, checklist, doanh thu và điểm tổng hợp.</p>
      </div>
      <div class="hero-score">
        <span>Điểm tổng hợp</span>
        <b>${myPerf.final_score ?? '-'}</b>
        <small>/100</small>
      </div>
    </section>
    <section class="grid four dash-kpis">
      <div class="card kpi"><div class="label">Việc đang mở</div><div class="num">${open}</div><div class="hint">Cần xử lý trong hạn</div></div>
      <div class="card kpi"><div class="label">Đúng hạn</div><div class="num ok-text">${done}</div><div class="hint">Tỷ lệ đúng hạn ${onTimeRate}%</div></div>
      <div class="card kpi"><div class="label">Trễ / quá hạn</div><div class="num danger-text">${late}</div><div class="hint">Tự ghi nhận trừ điểm</div></div>
      <div class="card kpi"><div class="label">Top tháng</div><div class="num">${top[0] ? '#' + top[0].rank : '-'}</div><div class="hint">${top[0] ? esc(top[0].full_name) : 'Chưa có doanh thu'}</div></div>
    </section>
    <section class="grid two" style="margin-top:17px">
      <div class="card"><div class="section-title"><h3>Top doanh thu tháng này</h3><span class="badge">Cạnh tranh</span></div>${tableLeaderboard(top)}</div>
      <div class="card"><div class="section-title"><h3>Vi phạm gần đây</h3><span class="badge danger">Kiểm soát</span></div>${violationsData.violations.slice(0, 6).map(v => `<div class="activity-item"><div><b>${esc(v.employee_name)}</b><span>${esc(v.store_name || '')} • ${dt(v.created_at)}</span><p>${esc(v.description || '')}</p></div><span class="badge danger">-${v.points_deducted}</span></div>`).join('') || '<div class="empty">Chưa có vi phạm</div>'}</div>
    </section>
  `, 'Tổng quan', 'Màn hình điều hành nhanh cho cửa hàng và PKD');
}

function tableLeaderboard(rows) {
  if (!rows.length) return '<div class="empty">Chưa có doanh thu</div>';
  const podium = rows.slice(0, 3).map(r => `<div class="rank-card rank-${r.rank}"><div class="rank-no">#${r.rank}</div><b>${esc(r.full_name)}</b><span>${esc(r.store_name || '')}</span><strong>${money(r.revenue)}</strong><small>${r.revenue_percent}% doanh thu • GUESTS ${Math.round(r.guests_percent || 0)}%</small></div>`).join('');
  return `<div class="leaderboard-premium">${podium}</div><div class="table-wrap"><table><thead><tr><th>Top</th><th>Nhân viên</th><th>Cửa hàng</th><th>Doanh thu</th><th>% DT</th><th>GUESTS</th></tr></thead><tbody>${rows.map(r => `<tr><td><span class="badge dark">#${r.rank}</span></td><td><b>${esc(r.full_name)}</b></td><td>${esc(r.store_name || '')}</td><td>${money(r.revenue)}</td><td>${r.revenue_percent}%</td><td>${Math.round(r.guests_percent || 0)}%</td></tr>`).join('')}</tbody></table></div>`;
}

async function renderTasks() {
  const data = await api('/api/tasks');
  const tasks = data.tasks;
  const storeId = state.user.role === 'admin' ? (state.boot.stores[0]?.id || '') : state.user.store_id;
  const assignForm = can('can_assign_tasks') ? `
    <div class="card"><h3>Giao việc mới</h3>
      <form id="taskForm" class="grid two">
        <div class="field"><label>Tiêu đề công việc</label><input class="input" name="title" required placeholder="VD: Kiểm tra VM đầu ca"></div>
        <div class="field"><label>Hạn hoàn thành</label><input class="input" name="due_at" type="datetime-local" required></div>
        <div class="field"><label>Cửa hàng</label><select name="store_id" id="taskStore" ${state.user.role !== 'admin' ? 'disabled' : ''}>${state.boot.stores.map(s => `<option value="${s.id}" ${Number(s.id) === Number(storeId) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Mức độ</label><select name="priority"><option value="low">Thấp</option><option value="medium" selected>Trung bình</option><option value="high">Cao</option></select></div>
        <div class="field"><label>Điểm trừ nếu trễ</label><input class="input" name="score_value" type="number" value="10" min="0" max="100"></div>
        <div class="field"><label>Giao cho nhiều nhân viên</label><select name="assignee_ids" id="assigneeSelect" multiple size="5" required>${usersInStore(storeId).map(u => `<option value="${u.id}">${esc(u.full_name)} - ${esc(u.store_name || '')}</option>`).join('')}</select><span class="hint">Giữ Ctrl để chọn nhiều người.</span></div>
        <div class="field" style="grid-column:1/-1"><label>Mô tả / yêu cầu</label><textarea name="description" placeholder="Nội dung, tiêu chuẩn hoàn thành, chứng từ cần đính kèm..."></textarea></div>
        <div style="grid-column:1/-1"><button class="btn">Tạo & giao việc</button></div>
      </form>
    </div>` : '';
  const grouped = tasks.map(t => taskCard(t)).join('') || '<div class="empty">Chưa có công việc</div>';
  shell(`${assignForm}<div class="card" style="margin-top:16px"><div class="toolbar"><h3 style="margin-right:auto">Danh sách công việc</h3>${can('can_export') ? '<button class="btn secondary" data-export="tasks">Tải CSV</button>' : ''}</div><div class="grid">${grouped}</div></div>`, 'Công việc', 'Nhân viên chỉ thấy việc của mình; quản lý giao việc cho nhiều người');
  $('#taskStore')?.addEventListener('change', e => {
    $('#assigneeSelect').innerHTML = usersInStore(e.target.value).map(u => `<option value="${u.id}">${esc(u.full_name)} - ${esc(u.store_name || '')}</option>`).join('');
  });
  $('#taskForm')?.addEventListener('submit', submitTask);
  $$('.completeForm').forEach(f => f.addEventListener('submit', submitCompleteTask));
}

function taskCard(t) {
  const canComplete = (Number(t.assignee_id) === Number(state.user.id) || state.user.role !== 'employee') && !t.completed_at;
  return `<div class="card task-card">
    <div class="task-head">
      <div><h4>${esc(t.title)}</h4><div class="meta"><span>${esc(t.store_name || '')}</span><span>Giao cho: ${esc(t.assignee_name)}</span><span>Hạn: ${dt(t.due_at)}</span><span>Điểm trừ: ${t.score_value}</span></div></div>
      ${statusBadge(t.status)}
    </div>
    ${t.description ? `<p>${esc(t.description)}</p>` : ''}
    ${t.evidence_path ? `<div class="hint">Chứng từ: <a class="filelink" href="${esc(t.evidence_path)}" target="_blank">Mở file</a> • ${esc(t.evidence_note || '')}</div>` : ''}
    ${canComplete ? `<form class="completeForm row" data-id="${t.assignment_id}" enctype="multipart/form-data"><input class="input" name="note" placeholder="Ghi chú hoàn thành"><input class="input" name="evidence" type="file" accept="image/*,.pdf,.xlsx,.docx" multiple><button class="btn small">Hoàn thành</button></form>` : ''}
  </div>`;
}

async function submitTask(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const assignee_ids = $$('#assigneeSelect option:checked').map(o => Number(o.value));
  const payload = Object.fromEntries(fd);
  payload.assignee_ids = assignee_ids;
  if (state.user.role !== 'admin') payload.store_id = state.user.store_id;
  try { await api('/api/tasks', { method: 'POST', body: JSON.stringify(payload) }); toast('Đã giao việc thành công'); renderTasks(); } catch (err) { toast(err.message, 'danger'); }
}

async function submitCompleteTask(e) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  try { const res = await api(`/api/tasks/${form.dataset.id}/complete`, { method: 'POST', body: fd }); toast(res.status === 'completed_late' ? 'Hoàn thành nhưng đã trễ hạn, hệ thống tự trừ điểm' : 'Đã hoàn thành đúng hạn'); renderTasks(); } catch (err) { toast(err.message, 'danger'); }
}

async function renderViolations() {
  const data = await api('/api/violations');
  const form = can('can_manage_violations') ? `
    <div class="card"><h3>Ghi nhận vi phạm</h3>
      <form id="violationForm" class="grid two" enctype="multipart/form-data">
        <div class="field"><label>Nhân viên</label><select name="user_id" required>${usersInStore(state.user.role === 'admin' ? '' : state.user.store_id).map(u => `<option value="${u.id}">${esc(u.full_name)} - ${esc(u.store_name || '')}</option>`).join('')}</select></div>
        <div class="field"><label>Loại vi phạm</label><input class="input" name="violation_type" placeholder="VD: Quy trình thu ngân / Grooming / Hàng hóa" required></div>
        <div class="field"><label>Điểm trừ</label><input class="input" type="number" name="points_deducted" value="5" min="0" max="100"></div>
        <div class="field"><label>Ảnh/chứng từ</label><input class="input" type="file" name="evidence" accept="image/*,.pdf,.xlsx,.docx"></div>
        <div class="field" style="grid-column:1/-1"><label>Nội dung vi phạm</label><textarea name="description" required placeholder="Mô tả lỗi, thời gian, tình huống, yêu cầu khắc phục"></textarea></div>
        <div style="grid-column:1/-1"><button class="btn danger">Lưu vi phạm</button></div>
      </form>
    </div>` : '';
  const list = data.violations.length ? `<div class="table-wrap"><table><thead><tr><th>Ngày</th><th>Nhân viên</th><th>Cửa hàng</th><th>Loại</th><th>Điểm trừ</th><th>Nội dung</th><th>Chứng từ</th></tr></thead><tbody>${data.violations.map(v => `<tr><td>${dt(v.created_at)}</td><td><b>${esc(v.employee_name)}</b></td><td>${esc(v.store_name || '')}</td><td>${esc(v.violation_type)}</td><td><span class="badge danger">-${v.points_deducted}</span></td><td>${esc(v.description || '')}</td><td>${v.evidence_path ? `<a class="filelink" href="${esc(v.evidence_path)}" target="_blank">Mở</a>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Chưa có vi phạm</div>';
  shell(`${form}<div class="card" style="margin-top:16px"><div class="toolbar"><h3 style="margin-right:auto">Danh sách vi phạm</h3>${can('can_export') ? '<button class="btn secondary" data-export="violations">Tải CSV</button>' : ''}</div>${list}</div>`, 'Vi phạm', 'Quản lý ghi nhận; nhân viên chỉ xem vi phạm của mình');
  $('#violationForm')?.addEventListener('submit', async e => { e.preventDefault(); try { await api('/api/violations', { method: 'POST', body: new FormData(e.target) }); toast('Đã lưu vi phạm'); renderViolations(); } catch (err) { toast(err.message, 'danger'); } });
}

async function renderChecklists() {
  const [history] = await Promise.all([api('/api/checklist/assessments')]);
  const templates = state.templates;
  const selected = templates.find(t => t.id === state.checklistType) || templates[0];
  const tabs = `<div class="pillbar">${templates.map(t => `<button data-checklist="${t.id}" class="${selected.id === t.id ? 'active' : ''}">${esc(t.id)}</button>`).join('')}</div>`;
  const form = can('can_grade_checklists') ? checklistForm(selected) : '<div class="empty">Tài khoản này chỉ được xem lại phiếu đã chấm.</div>';
  const list = history.assessments.length ? `<div class="table-wrap"><table><thead><tr><th>Ngày chấm</th><th>Checklist</th><th>Đối tượng</th><th>Cửa hàng</th><th>Điểm</th><th>Người chấm</th><th>Ghi chú</th></tr></thead><tbody>${history.assessments.map(a => `<tr><td>${dt(a.assessed_at)}</td><td><span class="badge dark">${esc(a.template_id)}</span></td><td>${esc(a.employee_name || 'Cửa hàng')}</td><td>${esc(a.store_name || '')}</td><td><b>${a.total_score}/${a.max_score}</b> (${a.percent}%)</td><td>${esc(a.created_by_name || '')}</td><td>${esc(a.general_note || '')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Chưa có phiếu chấm</div>';
  shell(`<div class="card"><div class="toolbar"><h3 style="margin-right:auto">Chọn checklist</h3>${tabs}</div>${form}</div><div class="card" style="margin-top:16px"><div class="toolbar"><h3 style="margin-right:auto">Lịch sử chấm</h3>${can('can_export') ? '<button class="btn secondary" data-export="assessments">Tải CSV</button>' : ''}</div>${list}</div>`, 'Checklist', 'OPS/VM theo cửa hàng; GUESTS theo từng đại sứ kinh doanh');
  $$('.pillbar button').forEach(b => b.onclick = () => { state.checklistType = b.dataset.checklist; renderChecklists(); });
  $('#checklistForm')?.addEventListener('submit', submitChecklist);
}

function checklistForm(t) {
  const sections = t.sections || [];
  const storeOptions = state.boot.stores.map(s => `<option value="${s.id}" ${Number(s.id) === Number(state.user.store_id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  const target = t.target_type === 'employee' ? `<div class="field"><label>Đại sứ kinh doanh</label><select name="employee_id" id="checkEmployee" required>${usersInStore(state.user.role === 'admin' ? '' : state.user.store_id).map(u => `<option value="${u.id}">${esc(u.full_name)} - ${esc(u.store_name || '')}</option>`).join('')}</select></div>` : '';
  const sectionHtml = sections.map(sec => {
    const items = t.items.filter(i => i.section_id === sec.id);
    if (!items.length) return '';
    return `<details class="check-section" open><summary>${esc(sec.title)}</summary>${items.map(i => `<div class="check-item"><div><b>${esc(i.title)}</b><div class="max">Tối đa ${i.max_score} điểm</div></div><input class="input score-input" type="number" min="0" max="${i.max_score}" step="0.5" name="score_${i.id}" value="${i.max_score}"><input class="input" name="note_${i.id}" placeholder="Ghi chú mục này"></div>`).join('')}</details>`;
  }).join('');
  return `<form id="checklistForm" data-template="${t.id}">
    <div class="grid three">
      <div class="field"><label>Cửa hàng</label><select name="store_id" id="checkStore" ${state.user.role !== 'admin' ? 'disabled' : ''}>${storeOptions}</select></div>
      ${target}
      <div class="field"><label>Ngày chấm</label><input class="input" type="datetime-local" name="assessed_at" value="${new Date().toISOString().slice(0,16)}"></div>
    </div>
    <div class="hint">Checklist này có ${t.items.length} tiêu chí, tổng tối đa ${t.max_score} điểm. Mặc định đang để full điểm, người chấm chỉ cần giảm điểm và ghi chú ở mục chưa đạt.</div>
    ${sectionHtml}
    <div class="field"><label>Nhận xét tổng quan</label><textarea name="general_note" placeholder="Tổng quan điểm mạnh, điểm cần cải thiện, deadline khắc phục..."></textarea></div>
    <button class="btn">Lưu phiếu chấm</button>
  </form>`;
}

async function submitChecklist(e) {
  e.preventDefault();
  const form = e.target;
  const t = state.templates.find(x => x.id === form.dataset.template);
  const fd = new FormData(form);
  const scores = {};
  t.items.forEach(i => scores[i.id] = { score: Number(fd.get(`score_${i.id}`) || 0), note: fd.get(`note_${i.id}`) || '' });
  const payload = {
    template_id: t.id,
    store_id: state.user.role === 'admin' ? fd.get('store_id') : state.user.store_id,
    employee_id: fd.get('employee_id') || null,
    assessed_at: fd.get('assessed_at'),
    general_note: fd.get('general_note'),
    scores,
  };
  try { const res = await api('/api/checklist/assessments', { method: 'POST', body: JSON.stringify(payload) }); toast(`Đã lưu phiếu: ${res.total_score}/${res.max_score} điểm (${res.percent}%)`); renderChecklists(); } catch (err) { toast(err.message, 'danger'); }
}

async function renderSales() {
  const data = await api(`/api/sales/leaderboard?period=${state.leaderboardPeriod}`);
  const form = can('can_manage_sales') ? `<div class="card"><h3>Nhập doanh thu nhân viên</h3><form id="salesForm" class="grid three"><div class="field"><label>Nhân viên</label><select name="user_id" required>${usersInStore(state.user.role === 'admin' ? '' : state.user.store_id).map(u => `<option value="${u.id}">${esc(u.full_name)} - ${esc(u.store_name || '')}</option>`).join('')}</select></div><div class="field"><label>Ngày</label><input class="input" type="date" name="sale_date" value="${new Date().toISOString().slice(0,10)}" required></div><div class="field"><label>Doanh thu</label><input class="input" type="number" name="revenue" min="0" required placeholder="1500000"></div><div class="field"><label>Số bill</label><input class="input" type="number" name="bill_count" min="0" value="0"></div><div class="field" style="grid-column:span 2"><label>Ghi chú</label><input class="input" name="note" placeholder="VD: ca sáng / ca chiều"></div><div style="grid-column:1/-1"><button class="btn">Lưu doanh thu</button></div></form></div>` : '';
  const tabs = `<div class="pillbar"><button data-period="month" class="${state.leaderboardPeriod === 'month' ? 'active' : ''}">Tháng</button><button data-period="quarter" class="${state.leaderboardPeriod === 'quarter' ? 'active' : ''}">Quý</button><button data-period="year" class="${state.leaderboardPeriod === 'year' ? 'active' : ''}">Năm</button></div>`;
  shell(`${form}<div class="card" style="margin-top:16px"><div class="toolbar"><h3 style="margin-right:auto">Top doanh thu ${state.leaderboardPeriod === 'month' ? 'tháng' : state.leaderboardPeriod === 'quarter' ? 'quý' : 'năm'}</h3>${tabs}${can('can_export') ? '<button class="btn secondary" data-export="sales">Tải CSV</button>' : ''}</div>${tableLeaderboard(data.leaderboard)}</div>`, 'Doanh thu', 'Bảng top theo tháng/quý/năm và % doanh thu toàn hệ thống');
  $$('.pillbar button').forEach(b => b.onclick = () => { state.leaderboardPeriod = b.dataset.period; renderSales(); });
  $('#salesForm')?.addEventListener('submit', async e => { e.preventDefault(); try { await api('/api/sales', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(e.target))) }); toast('Đã lưu doanh thu'); renderSales(); } catch (err) { toast(err.message, 'danger'); } });
}

async function renderReports() {
  const data = await api('/api/reports/performance');
  const rows = data.performance;
  const perfTable = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Top</th><th>Nhân viên</th><th>Cửa hàng</th><th>Điểm tổng</th><th>Công việc</th><th>Vi phạm</th><th>GUESTS</th><th>Doanh thu</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td><span class="badge dark">#${i + 1}</span></td><td><b>${esc(r.full_name)}</b></td><td>${esc(r.store_name || '')}</td><td><b>${r.final_score}/100</b></td><td>${r.task_score}%<br><span class="hint">Đúng hạn ${r.tasks_on_time}/${r.tasks_total}, trễ ${r.tasks_late}, quá hạn ${r.tasks_overdue}</span></td><td>${r.violation_score}%<br><span class="hint">${r.violations_count} lỗi, -${r.violation_deductions} điểm</span></td><td>${r.guests_score}%</td><td>${money(r.revenue)}<br><span class="hint">Index ${r.revenue_score}%</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Chưa có dữ liệu tổng hợp</div>';
  const storeTable = data.storeSummary?.length ? `<div class="table-wrap"><table><thead><tr><th>Cửa hàng</th><th>OPS</th><th>VM</th><th>Vi phạm</th></tr></thead><tbody>${data.storeSummary.map(s => `<tr><td><b>${esc(s.store_name)}</b></td><td>${Math.round(s.ops_score || 0)}%</td><td>${Math.round(s.vm_score || 0)}%</td><td>${s.violations}</td></tr>`).join('')}</tbody></table></div>` : '';
  shell(`<div class="card"><div class="toolbar"><h3 style="margin-right:auto">Hiệu suất nhân viên</h3>${can('can_export') ? '<button class="btn secondary" data-export="performance">Tải CSV</button>' : ''}</div>${perfTable}</div><div class="card" style="margin-top:16px"><h3>Hiệu suất cửa hàng</h3>${storeTable || '<div class="empty">Chưa có điểm OPS/VM</div>'}</div><div class="card" style="margin-top:16px"><h3>Cách tính điểm tổng</h3><p class="hint">Điểm tổng tối đa 100 = 35% hiệu suất công việc + 20% điểm không vi phạm + 25% GUESTS checklist + 20% index doanh thu. Công việc trễ hạn/quá hạn tự bị ghi nhận không hoàn thành đúng hạn và trừ điểm.</p></div>`, 'Tổng hợp điểm', 'Hiệu suất cửa hàng và nhân viên, chuẩn hóa về thang 100 điểm');
}

async function renderAdmin() {
  const data = await api('/api/users');
  const permBoxes = Object.entries(PERM_LABELS).map(([key, label]) => `<label><input type="checkbox" name="${key}"> ${label}</label>`).join(' ');
  const form = `<div class="card"><h3>Cấp tài khoản / phân quyền</h3><form id="userForm" class="grid three"><div class="field"><label>Họ tên</label><input class="input" name="full_name" required></div><div class="field"><label>Tài khoản</label><input class="input" name="username" required></div><div class="field"><label>Mật khẩu</label><input class="input" name="password" value="123456" required></div><div class="field"><label>Vai trò</label><select name="role"><option value="employee">Nhân viên</option><option value="manager">Quản lý</option><option value="admin">Admin</option></select></div><div class="field"><label>Cửa hàng</label><select name="store_id"><option value="">Không gắn cửa hàng</option>${state.boot.stores.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div><div class="field"><label>Quyền mở rộng</label><div class="hint">${permBoxes}</div></div><div style="grid-column:1/-1"><button class="btn">Tạo tài khoản</button></div></form></div>`;
  const table = `<div class="table-wrap"><table><thead><tr><th>Họ tên</th><th>Tài khoản</th><th>Vai trò</th><th>Cửa hàng</th><th>Trạng thái</th><th>Quyền</th><th>Thao tác</th></tr></thead><tbody>${data.users.map(u => `<tr><td><b>${esc(u.full_name)}</b></td><td>${esc(u.username)}</td><td>${roleLabel(u.role)}</td><td>${esc(u.store_name || '')}</td><td><span class="badge ok">Đang dùng</span></td><td>${Object.entries(PERM_LABELS).filter(([k]) => Number(u.permissions[k]) === 1).map(([,l]) => `<span class="badge">${esc(l)}</span>`).join(' ')}</td><td>${Number(u.id) === Number(state.user.id) ? '<span class="hint">Tài khoản hiện tại</span>' : `<button class="btn small danger deleteUserBtn" data-id="${u.id}" data-name="${esc(u.full_name)}">Xóa</button>`}</td></tr>`).join('')}</tbody></table></div>`;
  const exports = `<div class="card" style="margin-top:16px"><h3>Tải dữ liệu</h3><div class="export-grid"><button class="btn secondary" data-export="tasks">Công việc</button><button class="btn secondary" data-export="violations">Vi phạm</button><button class="btn secondary" data-export="assessments">Checklist</button><button class="btn secondary" data-export="sales">Doanh thu</button><button class="btn secondary" data-export="performance">Tổng hợp điểm</button></div></div>`;
  shell(`${form}<div class="card" style="margin-top:16px"><h3>Danh sách tài khoản</h3>${table}</div>${exports}`, 'Admin', 'Cấp quyền, phân quyền xem và tải dữ liệu');
  $('#userForm')?.addEventListener('submit', async e => { e.preventDefault(); const fd = new FormData(e.target); const permissions = {}; Object.keys(PERM_LABELS).forEach(k => permissions[k] = fd.get(k) ? 1 : 0); const payload = { full_name: fd.get('full_name'), username: fd.get('username'), password: fd.get('password'), role: fd.get('role'), store_id: fd.get('store_id') || null, permissions }; try { await api('/api/users', { method: 'POST', body: JSON.stringify(payload) }); toast('Đã tạo tài khoản'); await loadBase(); renderAdmin(); } catch (err) { toast(err.message, 'danger'); } });
  $$('.deleteUserBtn').forEach(btn => btn.addEventListener('click', async () => {
    const name = btn.dataset.name || 'tài khoản này';
    if (!confirm(`Xóa ${name}? Tài khoản này sẽ không đăng nhập được nữa, nhưng dữ liệu cũ vẫn được giữ để xem báo cáo.`)) return;
    try {
      await api(`/api/users/${btn.dataset.id}`, { method: 'DELETE' });
      toast('Đã xóa tài khoản');
      await loadBase();
      renderAdmin();
    } catch (err) { toast(err.message, 'danger'); }
  }));
}

start();
