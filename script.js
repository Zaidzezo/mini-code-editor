// ==================== Global Variables ====================
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const STORAGE_KEY = 'codeforge-project';
const SHARE_PREFIX = 'codeforge://';
let isDarkMode = true;
let consoleFilter = 'all';

// DOM Elements
const preview = $('#preview');
const console = $('#console');
const out = $('#output');

// ==================== Utilities ====================
function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str).replace(/[&<>"']/g, c => map[c]);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function updateStats() {
  const htmlSize = ed_html.getValue().length;
  const cssSize = ed_css.getValue().length;
  const jsSize = ed_js.getValue().length;
  const total = htmlSize + cssSize + jsSize;

  $('#htmlSize').textContent = formatBytes(htmlSize);
  $('#cssSize').textContent = formatBytes(cssSize);
  $('#jsSize').textContent = formatBytes(jsSize);
  $('#totalSize').textContent = formatBytes(total);
}

// ==================== Theme Toggle ====================
$('#themeToggle').addEventListener('click', () => {
  isDarkMode = !isDarkMode;
  document.body.classList.toggle('light-mode', !isDarkMode);
  localStorage.setItem('codeforge-theme', isDarkMode ? 'dark' : 'light');
  
  const icon = $('#themeToggle i');
  icon.classList.toggle('fa-moon', isDarkMode);
  icon.classList.toggle('fa-sun', !isDarkMode);
});

if (localStorage.getItem('codeforge-theme') === 'light') {
  isDarkMode = false;
  document.body.classList.add('light-mode');
  const icon = $('#themeToggle i');
  icon.classList.remove('fa-moon');
  icon.classList.add('fa-sun');
}

// ==================== ACE Editors ====================
function makeEditor(id, mode) {
  const ed = ace.edit(id, {
    theme: isDarkMode ? 'ace/theme/dracula' : 'ace/theme/chrome',
    mode: mode,
    tabSize: 2,
    useSoftTabs: true,
    showPrintMargin: false,
    wrap: true,
    fontSize: 14,
    showLineNumbers: true,
    highlightActiveLine: true,
    enableBasicAutocompletion: true,
    enableSnippets: true
  });

  ed.session.setUseWrapMode(true);

  ed.commands.addCommand({
    name: 'run',
    bindKey: { win: 'Ctrl-Enter', mac: 'Command-Enter' },
    exec: () => runWeb(false)
  });

  ed.commands.addCommand({
    name: 'save',
    bindKey: { win: 'Ctrl-S', mac: 'Command-S' },
    exec: () => saveProject()
  });

  ed.commands.addCommand({
    name: 'format',
    bindKey: { win: 'Ctrl-Shift-F', mac: 'Command-Shift-F' },
    exec: () => {
      const session = ed.session;
      ed.session.autoFormatLines(0, session.getLength());
    }
  });

  return ed;
}

const ed_html = makeEditor('ed_html', 'ace/mode/html');
const ed_css = makeEditor('ed_css', 'ace/mode/css');
const ed_js = makeEditor('ed_js', 'ace/mode/javascript');

// ==================== Tab Management ====================
const TAB_ORDER = ['html', 'css', 'js'];
const editors = { html: ed_html, css: ed_css, js: ed_js };

function activePane() {
  const t = $('#webTabs .tab.active');
  return t ? t.dataset.pane : 'html';
}

function showPane(name) {
  $$('[data-pane]').forEach(el => {
    if (el.classList.contains('editor-wrap')) {
      el.hidden = el.dataset.pane !== name;
    }
  });

  $$('#webTabs .tab').forEach(t => {
    const isActive = t.dataset.pane === name;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', isActive);
  });

  requestAnimationFrame(() => {
    const ed = editors[name];
    if (ed?.resize) {
      ed.resize(true);
      ed.focus();
    }
  });
}

$('#webTabs').addEventListener('click', e => {
  const btn = e.target.closest('.tab');
  if (btn) showPane(btn.dataset.pane);
});

$('#webTabs').addEventListener('keydown', e => {
  const idx = TAB_ORDER.indexOf(activePane());
  if (e.key === 'ArrowLeft') {
    showPane(TAB_ORDER[(idx - 1 + TAB_ORDER.length) % TAB_ORDER.length]);
    e.preventDefault();
  } else if (e.key === 'ArrowRight') {
    showPane(TAB_ORDER[(idx + 1) % TAB_ORDER.length]);
    e.preventDefault();
  }
});

showPane('html');

// ==================== Console System ====================
function logToConsole(type, message, data = null) {
  const logEntry = document.createElement('div');
  logEntry.className = `console-log ${type}`;
  logEntry.dataset.type = type;

  const badge = document.createElement('span');
  badge.className = 'console-badge';
  const badgeText = { log: 'LOG', error: 'ERR', warn: 'WRN', info: 'INFO' }[type];
  badge.textContent = badgeText;

  const msg = document.createElement('span');
  msg.textContent = message;

  logEntry.appendChild(badge);
  logEntry.appendChild(msg);

  if (data !== null && data !== undefined) {
    const dataSpan = document.createElement('span');
    dataSpan.style.color = 'var(--accent-blue)';
    dataSpan.textContent = ' ' + JSON.stringify(data).substring(0, 100);
    logEntry.appendChild(dataSpan);
  }

  console.appendChild(logEntry);
  console.scrollTop = console.scrollHeight;
}

$('#logFilter').addEventListener('change', (e) => {
  consoleFilter = e.target.value;
  const logs = $$('.console-log');
  logs.forEach(log => {
    if (consoleFilter === 'all') {
      log.style.display = '';
    } else {
      log.style.display = log.dataset.type === consoleFilter ? '' : 'none';
    }
  });
});

$('#clearConsole').addEventListener('click', () => {
  console.innerHTML = '';
  logToConsole('log', 'Console cleared');
});

// ==================== Error Capture ====================
function setupErrorCapture() {
  const originalLog = window.console.log;
  const originalError = window.console.error;
  const originalWarn = window.console.warn;
  const originalInfo = window.console.info;

  window.console.log = function(...args) {
    originalLog.apply(console, args);
    logToConsole('log', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
  };

  window.console.error = function(...args) {
    originalError.apply(console, args);
    logToConsole('error', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
  };

  window.console.warn = function(...args) {
    originalWarn.apply(console, args);
    logToConsole('warn', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
  };

  window.console.info = function(...args) {
    originalInfo.apply(console, args);
    logToConsole('info', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
  };

  window.onerror = (msg, url, line, col, err) => {
    logToConsole('error', `${msg} (Line ${line}:${col})`);
  };
}

// ==================== Output Log ====================
function log(msg, type = 'info') {
  const line = document.createElement('div');
  const time = new Date().toLocaleTimeString();
  const icons = { info: 'ℹ️', error: '❌', warn: '⚠️', success: '✓' };
  line.innerHTML = `<span style="color: var(--accent-blue);">[${time}]</span> ${icons[type] || '→'} ${escapeHtml(msg)}`;
  out.appendChild(line);
  out.scrollTop = out.scrollHeight;
}

$('#clearOut').addEventListener('click', () => {
  out.innerHTML = '';
  log('Output cleared');
});

// ==================== Preview & Execution ====================
function buildWebSrcdoc(withTests = false) {
  const html = ed_html.getValue();
  const css = ed_css.getValue();
  const js = ed_js.getValue();
  const tests = ($('#testArea')?.value || '').trim();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${css}</style>
</head>
<body>
  ${html}
  <script>
    window.onerror = (msg, url, line, col, err) => {
      console.error(msg + ' at line ' + line);
    };
    
    try {
      ${js}
      ${withTests && tests ? `\n/* ===== TESTS ===== */\n${tests}` : ''}
    } catch (e) {
      console.error('Runtime Error: ' + e.message);
    }
  <\/script>
</body>
</html>`;
}

function runWeb(withTests = false) {
  preview.srcdoc = buildWebSrcdoc(withTests);
  log(withTests ? 'Running code with tests...' : 'Preview updated ✨', 'success');
}

$('#runWeb').addEventListener('click', () => runWeb(false));
$('#runTests').addEventListener('click', () => runWeb(true));
$('#refreshPreview').addEventListener('click', () => runWeb(false));

$('#openPreview').addEventListener('click', () => {
  const src = buildWebSrcdoc(false);
  const w = window.open('about:blank');
  if (w) {
    w.document.open();
    w.document.write(src);
    w.document.close();
  }
});

// ==================== Templates ====================
const TEMPLATES = {
  starter: {
    html: `<div class="container">
  <h1>Hello World</h1>
  <p>Start coding here</p>
  <button id="btn">Click me</button>
</div>`,
    css: `body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  margin: 0;
  padding: 20px;
}

.container {
  max-width: 600px;
  margin: 50px auto;
  padding: 40px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.2);
  text-align: center;
}

h1 { color: #667eea; margin-top: 0; }

#btn {
  padding: 12px 24px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 600;
  transition: 0.2s;
}

#btn:hover { background: #764ba2; transform: translateY(-2px); }`,
    js: `document.getElementById('btn').addEventListener('click', () => {
  alert('Hello! You clicked the button');
  console.log('Button clicked successfully');
});`
  },
  landing: {
    html: `<nav class="navbar">
  <div class="logo">MyBrand</div>
  <ul class="nav-links">
    <li><a href="#home">Home</a></li>
    <li><a href="#features">Features</a></li>
    <li><a href="#contact">Contact</a></li>
  </ul>
</nav>

<section class="hero">
  <h1>Welcome to our awesome service</h1>
  <p>Build something amazing today</p>
  <button class="cta">Get Started</button>
</section>`,
    css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, sans-serif; }
.navbar {
  background: linear-gradient(90deg, #667eea, #764ba2);
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: white;
}
.logo { font-size: 24px; font-weight: bold; }
.nav-links { list-style: none; display: flex; gap: 20px; }
.nav-links a { color: white; text-decoration: none; }
.hero {
  text-align: center;
  padding: 100px 20px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}
.hero h1 { font-size: 48px; margin-bottom: 20px; }
.cta { padding: 15px 40px; background: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold; }`,
    js: `document.querySelector('.cta').addEventListener('click', () => {
  alert('Welcome! Get started with us');
});`
  },
  portfolio: {
    html: `<header>
  <h1>My Portfolio</h1>
  <p>Web Developer & Designer</p>
</header>

<section class="projects">
  <h2>My Projects</h2>
  <div class="project">
    <h3>Project 1</h3>
    <p>Description of your project</p>
  </div>
  <div class="project">
    <h3>Project 2</h3>
    <p>Description of your project</p>
  </div>
</section>`,
    css: `* { margin: 0; padding: 0; }
body { font-family: Georgia, serif; background: #f5f5f5; }
header {
  background: linear-gradient(135deg, #1e3c72, #2a5298);
  color: white;
  padding: 60px 20px;
  text-align: center;
}
header h1 { font-size: 48px; margin-bottom: 10px; }
.projects { max-width: 900px; margin: 40px auto; padding: 20px; }
.projects h2 { margin-bottom: 30px; }
.project {
  background: white;
  padding: 20px;
  margin-bottom: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}`,
    js: `console.log('Portfolio loaded successfully');`
  },
  dashboard: {
    html: `<div class="dashboard">
  <h1>Dashboard</h1>
  <div class="stats">
    <div class="stat-box">
      <h3>Total Users</h3>
      <p id="users">1,234</p>
    </div>
    <div class="stat-box">
      <h3>Revenue</h3>
      <p id="revenue">$50,000</p>
    </div>
    <div class="stat-box">
      <h3>Active Sessions</h3>
      <p id="sessions">42</p>
    </div>
  </div>
  <button id="refresh">Refresh Data</button>
</div>`,
    css: `.dashboard {
  padding: 40px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  min-height: 100vh;
  color: white;
}
.dashboard h1 { margin-bottom: 30px; }
.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 30px;
}
.stat-box {
  background: rgba(255,255,255,0.1);
  padding: 20px;
  border-radius: 8px;
  text-align: center;
}
.stat-box p { font-size: 28px; font-weight: bold; }
#refresh { padding: 12px 24px; background: white; border: none; border-radius: 6px; cursor: pointer; }`,
    js: `document.getElementById('refresh').addEventListener('click', () => {
  document.getElementById('users').textContent = Math.floor(Math.random()*10000);
  document.getElementById('revenue').textContent = '$' + Math.floor(Math.random()*100000);
  document.getElementById('sessions').textContent = Math.floor(Math.random()*100);
});`
  },
  form: {
    html: `<form class="contact-form">
  <h1>Contact Us</h1>
  <input type="text" placeholder="Your Name" required>
  <input type="email" placeholder="Your Email" required>
  <textarea placeholder="Your Message" rows="5" required></textarea>
  <button type="submit">Send Message</button>
</form>`,
    css: `.contact-form {
  max-width: 500px;
  margin: 50px auto;
  padding: 40px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.1);
}
.contact-form h1 { text-align: center; margin-bottom: 30px; color: #333; }
input, textarea {
  width: 100%;
  padding: 12px;
  margin-bottom: 20px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: inherit;
  font-size: 14px;
}
input:focus, textarea:focus { outline: none; border-color: #667eea; }
button {
  width: 100%;
  padding: 12px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
}
button:hover { background: #764ba2; }`,
    js: `document.querySelector('.contact-form').addEventListener('submit', (e) => {
  e.preventDefault();
  alert('Thank you for your message!');
  e.target.reset();
});`
  },
  todo: {
    html: `<div class="todo-app">
  <h1>My Todo List</h1>
  <div class="input-container">
    <input id="todoInput" type="text" placeholder="Add a new task...">
    <button id="addBtn">Add</button>
  </div>
  <ul id="todoList"></ul>
</div>`,
    css: `.todo-app {
  max-width: 500px;
  margin: 40px auto;
  padding: 30px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.1);
}
h1 { text-align: center; color: #667eea; }
.input-container { display: flex; gap: 10px; margin-bottom: 20px; }
#todoInput { flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
#addBtn { padding: 10px 20px; background: #667eea; color: white; border: none; cursor: pointer; border-radius: 4px; }
#todoList { list-style: none; }
.todo-item { padding: 12px; background: #f5f5f5; margin-bottom: 10px; border-radius: 4px; display: flex; justify-content: space-between; }
.todo-item button { background: #ef4444; color: white; border: none; cursor: pointer; border-radius: 3px; padding: 5px 10px; }`,
    js: `const todoList = document.getElementById('todoList');
const todoInput = document.getElementById('todoInput');
const addBtn = document.getElementById('addBtn');

addBtn.addEventListener('click', () => {
  if (!todoInput.value) return;
  const li = document.createElement('li');
  li.className = 'todo-item';
  li.innerHTML = \`<span>\${todoInput.value}</span><button onclick="this.parentElement.remove()">Delete</button>\`;
  todoList.appendChild(li);
  todoInput.value = '';
});`
  }
};

function loadTemplate(name) {
  const template = TEMPLATES[name];
  if (!template) return;
  ed_html.setValue(template.html, -1);
  ed_css.setValue(template.css, -1);
  ed_js.setValue(template.js, -1);
  log(`Loaded "${name}" template`, 'success');
  closeModal('templateModal');
  runWeb(false);
}

$$('.template-card').forEach(card => {
  card.addEventListener('click', () => loadTemplate(card.dataset.template));
});

// ==================== Share via URL ====================
function encodeProject() {
  const project = {
    html: ed_html.getValue(),
    css: ed_css.getValue(),
    js: ed_js.getValue()
  };
  return btoa(JSON.stringify(project));
}

function decodeProject(encoded) {
  try {
    const decoded = atob(encoded);
    return JSON.parse(decoded);
  } catch (e) {
    log('Invalid share code', 'error');
    return null;
  }
}

function updateShareUrl() {
  const encoded = encodeProject();
  const shareUrl = `${window.location.origin}${window.location.pathname}#${encoded}`;
  $('#shareUrl').value = shareUrl;
  return shareUrl;
}

$('#shareBtn').addEventListener('click', () => {
  updateShareUrl();
  openModal('shareModal');
});

$('#copyUrlBtn').addEventListener('click', () => {
  const url = $('#shareUrl');
  url.select();
  document.execCommand('copy');
  log('Share URL copied to clipboard', 'success');
});

$('#qrCodeBtn').addEventListener('click', () => {
  const qrContainer = $('#qrCodeContainer');
  qrContainer.innerHTML = '';
  
  new QRious({
    element: document.createElement('canvas'),
    value: $('#shareUrl').value,
    size: 200,
    level: 'H',
    backgroundAlpha: 1,
    foreground: '#0a0e27',
    background: '#ffffff'
  });
  
  const canvas = document.querySelector('canvas');
  if (canvas) {
    qrContainer.appendChild(canvas);
  }
});

// ==================== Load from Share URL ====================
function loadFromUrl() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;
  
  const project = decodeProject(hash);
  if (project) {
    ed_html.setValue(project.html, -1);
    ed_css.setValue(project.css, -1);
    ed_js.setValue(project.js, -1);
    log('Loaded shared project', 'success');
    runWeb(false);
  }
}

// ==================== Modal Functions ====================
function openModal(id) {
  $(`#${id}`).classList.remove('hidden');
}

function closeModal(id) {
  $(`#${id}`).classList.add('hidden');
}

document.querySelectorAll('.close-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.target.closest('.modal').classList.add('hidden');
  });
});

document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });
});

$('#templateBtn').addEventListener('click', () => openModal('templateModal'));

// ==================== Project Management ====================
function projectJSON() {
  return {
    version: 1,
    timestamp: new Date().toISOString(),
    assignment: $('#assignment')?.value || '',
    test: $('#testArea')?.value || '',
    html: ed_html.getValue(),
    css: ed_css.getValue(),
    js: ed_js.getValue()
  };
}

function loadProject(obj) {
  try {
    if ($('#assignment')) $('#assignment').value = obj.assignment || '';
    if ($('#testArea')) $('#testArea').value = obj.test || '';
    ed_html.setValue(obj.html || '', -1);
    ed_css.setValue(obj.css || '', -1);
    ed_js.setValue(obj.js || '', -1);
    log('Project loaded', 'success');
  } catch (e) {
    log('Failed to load project', 'error');
  }
}

function saveProject() {
  const data = JSON.stringify(projectJSON(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `codeforge-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  log('Project saved', 'success');
}

$('#saveBtn').addEventListener('click', saveProject);
$('#loadBtn').addEventListener('click', () => $('#openFile').click());

$('#openFile').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    const obj = JSON.parse(await f.text());
    loadProject(obj);
  } catch (e) {
    log('Invalid file', 'error');
  }
  e.target.value = '';
});

// ==================== Auto-save ====================
let autoSaveTimer;
[ed_html, ed_css, ed_js].forEach(ed => {
  ed.session.on('change', () => {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projectJSON()));
      updateStats();
    }, 2000);
  });
});

// ==================== Initialization ====================
window.addEventListener('DOMContentLoaded', () => {
  setupErrorCapture();
  loadFromUrl();
  
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached && !window.location.hash) {
      loadProject(JSON.parse(cached));
    } else if (!window.location.hash) {
      ed_html.setValue('<h1>Welcome to CodeForge</h1>', -1);
      ed_css.setValue('body { font-family: system-ui; padding: 40px; }', -1);
      ed_js.setValue('console.log("Ready to code!");', -1);
    }
  } catch (e) {
    log('Error loading saved project', 'error');
  }

  updateStats();
  log('CodeForge ready ✨', 'success');
});

window.addEventListener('beforeunload', (e) => {
  if (ed_html.getValue() || ed_css.getValue() || ed_js.getValue()) {
    e.preventDefault();
  }
});