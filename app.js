const CLIENT_ID = '468853983983-hdfsmut32pa7j45fuaif2n7thg703gff.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const ROOT_NAME = "Dad's Documents";
const FOLDER_MIME = 'application/vnd.google-apps.folder';

const $ = id => document.getElementById(id);
const quoteQuery = value => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const st = { files: [], folder: null, root: null, choose: false, cur: '' };
let token = null, tokenExp = 0, tc = null, waiting = null;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};

function show(id, title) {
  st.cur = id;
  document.querySelectorAll('.screen').forEach(s => s.hidden = s.id !== id);
  $('title').textContent = title || "Dad's Docs";
  $('back').hidden = ['home', 'signin', 'done'].includes(id);
  window.scrollTo(0, 0);
}

function goHome() {
  st.files = []; st.folder = null; st.choose = false;
  const last = store.get('lastSaved');
  $('last').textContent = last ? 'Last saved in: ' + last : '';
  show('home');
}

function showMsg(title, text, retry) {
  $('mtitle').textContent = title;
  $('mtext').textContent = text;
  $('retry').hidden = !retry;
  $('retry').onclick = retry || null;
  show('msg', 'Problem');
}

function fail(e, retry) {
  console.error(e);
  const m = String((e && (e.message || e.type || e.error)) || '');
  if (!navigator.onLine || /network|Failed to fetch/i.test(m)) {
    showMsg('No internet', 'Connect to Wi-Fi or mobile data, then try again.', retry);
  } else if (/popup|access_denied|401|403|auth/i.test(m)) {
    showMsg('Please sign in again', 'Tap the button, then choose your Google account.', async () => {
      try { await getToken(true); (retry || goHome)(); } catch (x) { fail(x, retry); }
    });
  } else {
    showMsg('Something went wrong', 'Your file was not saved. Please try again.', retry);
  }
}

function initAuth() {
  if (!(window.google && google.accounts && google.accounts.oauth2)) return setTimeout(initAuth, 250);
  tc = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: r => {
      if (r.error) { waiting && waiting.rej(r); waiting = null; return; }
      token = r.access_token;
      tokenExp = Date.now() + (r.expires_in || 3600) * 1000;
      store.set('signedIn', '1');
      waiting && waiting.res(token); waiting = null;
    },
    error_callback: e => { waiting && waiting.rej(e); waiting = null; }
  });
  boot();
}

function getToken(forcePrompt) {
  if (token && Date.now() < tokenExp - 60000) return Promise.resolve(token);
  return new Promise((res, rej) => {
    waiting = { res, rej };
    tc.requestAccessToken({ prompt: forcePrompt || !store.get('signedIn') ? 'select_account' : '' });
  });
}

function openPicker(id) {
  if (token && Date.now() < tokenExp - 60000) return $(id).click();
  showMsg('Please sign in again', 'Tap “Try again”, then choose your Google account. After that, tap Take photo or Add file once more.', async () => {
    try { await getToken(true); goHome(); } catch (e) { fail(e, () => openPicker(id)); }
  });
}

async function api(path, opt = {}, retry = true) {
  const t = await getToken();
  const r = await fetch('https://www.googleapis.com/drive/v3/' + path, {
    ...opt,
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
  });
  if (r.status === 401 && retry) { token = null; return api(path, opt, false); }
  if (!r.ok) throw new Error('Drive ' + r.status);
  return r.json();
}

async function ensureRoot() {
  if (st.root) return st.root;
  let id = store.get('rootId');
  if (id) {
    try { const f = await api(`files/${id}?fields=id,trashed`); if (!f.trashed) return (st.root = id); } catch {}
  }
  const q = encodeURIComponent(`name='${quoteQuery(ROOT_NAME)}' and mimeType='${FOLDER_MIME}' and 'root' in parents and trashed=false`);
  const found = await api(`files?q=${q}&fields=files(id)`);
  id = found.files[0] ? found.files[0].id
    : (await api('files?fields=id', { method: 'POST', body: JSON.stringify({ name: ROOT_NAME, mimeType: FOLDER_MIME }) })).id;
  store.set('rootId', id);
  return (st.root = id);
}

async function listFolders() {
  const root = await ensureRoot();
  const q = encodeURIComponent(`'${root}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`);
  return (await api(`files?q=${q}&orderBy=name&pageSize=100&fields=files(id,name)`)).files;
}

async function listFiles(folderId) {
  const q = encodeURIComponent(`'${folderId}' in parents and mimeType!='${FOLDER_MIME}' and trashed=false`);
  return (await api(`files?q=${q}&orderBy=modifiedTime desc&pageSize=100&fields=files(id,name,mimeType,modifiedTime)`)).files;
}

function renderFiles(files) {
  const box = $('filelist');
  box.innerHTML = '';
  if (!files.length) {
    box.innerHTML = '<p class="note">No files in this folder yet.</p>';
    return;
  }
  files.forEach(file => {
    const row = document.createElement('div');
    row.className = 'file';
    row.innerHTML = '<svg class="i"><use href="#i-file"/></svg><span></span>';
    const label = row.querySelector('span');
    label.textContent = file.name;
    const date = new Date(file.modifiedTime);
    const meta = document.createElement('small');
    meta.textContent = 'Saved ' + date.toLocaleDateString();
    label.appendChild(meta);
    box.appendChild(row);
  });
}

async function openFolders(choose) {
  st.choose = choose;
  show('folders', choose ? 'Choose a folder' : 'My folders');
  $('nform').hidden = true;
  $('flist').innerHTML = '<p class="note">Loading your folders…</p>';
  try {
    const fs = await listFolders();
    const last = JSON.parse(store.get('lastFolder') || 'null');
    fs.sort((a, b) => (b.id === (last && last.id)) - (a.id === (last && last.id)));
    const box = $('flist');
    box.innerHTML = '';
    if (!fs.length) box.innerHTML = '<p class="lead">No folders yet. Tap “New folder” to make your first one.</p>';
    fs.forEach(f => {
      const b = document.createElement('button');
      b.className = 'folder';
      b.innerHTML = '<svg class="i"><use href="#i-folder"/></svg><span></span>';
      b.querySelector('span').textContent = f.name;
      if (last && f.id === last.id) b.querySelector('span').insertAdjacentHTML('beforeend', '<small>Last used</small>');
      b.onclick = () => pickFolder(f);
      box.appendChild(b);
    });
  } catch (e) { fail(e, () => openFolders(choose)); }
}

async function pickFolder(f) {
  st.folder = f;
  store.set('lastFolder', JSON.stringify(f));
  if (st.files.length) return preview();
  $('i-drive').href = 'https://drive.google.com/drive/folders/' + f.id;
  show('inside', f.name);
  $('filelist').innerHTML = '<p class="note">Loading files…</p>';
  try { renderFiles(await listFiles(f.id)); }
  catch (e) { fail(e, () => pickFolder(f)); }
}

function preview() {
  show('preview', 'Ready to save');
  const f = st.files[0], img = $('pimg');
  $('pcount').textContent = st.files.length === 1 ? f.name : st.files.length + ' items';
  $('pfolder').textContent = st.folder.name;
  $('prog').hidden = true; $('status').textContent = ''; $('bar').style.width = '0';
  if (img.src) URL.revokeObjectURL(img.src);
  if (f.type.startsWith('image/')) { img.src = URL.createObjectURL(f); img.hidden = false; } else { img.removeAttribute('src'); img.hidden = true; }
}

function took(list, camera) {
  let files = [...list];
  if (!files.length) return;
  if (camera) {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
    files = files.map((f, i) => new File([f], `Photo ${stamp}${files.length > 1 ? ' ' + (i + 1) : ''}.jpg`, { type: f.type || 'image/jpeg' }));
  }
  st.files = files;
  st.folder ? preview() : openFolders(true);
}

async function prep(f) {
  if (!/^image\/(jpeg|png|webp)/.test(f.type)) return f;
  try {
    const bmp = await createImageBitmap(f);
    const s = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
    if (!b || (s === 1 && b.size >= f.size)) return f;
    return new File([b], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return f; }
}

async function upload(file, parent, onp) {
  file = await prep(file);
  const t = await getToken();
  const bd = 'docs' + Date.now();
  const meta = JSON.stringify({ name: file.name, parents: [parent] });
  const body = new Blob([
    `--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${bd}\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
    file, `\r\n--${bd}--`
  ]);
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id');
    x.setRequestHeader('Authorization', 'Bearer ' + t);
    x.setRequestHeader('Content-Type', 'multipart/related; boundary=' + bd);
    x.upload.onprogress = e => e.lengthComputable && onp(Math.round(e.loaded / e.total * 100));
    x.onload = () => x.status < 300 ? res() : rej(new Error('Upload ' + x.status));
    x.onerror = () => rej(new Error('network'));
    x.send(body);
  });
}

async function save() {
  const btn = $('save'), n = st.files.length;
  btn.disabled = true; $('prog').hidden = false;
  try {
    for (let i = 0; i < n; i++) {
      $('status').textContent = n > 1 ? `Saving ${i + 1} of ${n}…` : 'Saving…';
      $('bar').style.width = '0';
      await upload(st.files[i], st.folder.id, p => { $('bar').style.width = p + '%'; });
    }
    store.set('lastSaved', st.folder.name);
    $('dfolder').textContent = 'In folder: ' + st.folder.name;
    st.files = [];
    show('done', 'Saved');
  } catch (e) { fail(e, () => preview()); }
  finally { btn.disabled = false; }
}

async function loadShared() {
  const n = +new URLSearchParams(location.search).get('shared') || 0;
  if (!n) return;
  history.replaceState(null, '', '/');
  try {
    const c = await caches.open('share');
    for (let i = 0; i < n; i++) {
      const key = '/shared/' + i;
      const r = await c.match(key);
      if (!r) continue;
      const b = await r.blob();
      st.files.push(new File([b], decodeURIComponent(r.headers.get('X-Name') || 'Shared file'), { type: b.type }));
      await c.delete(key);
    }
  } catch {}
}

function route() { st.files.length ? openFolders(true) : goHome(); }

async function boot() {
  if (CLIENT_ID.startsWith('PASTE')) {
    return showMsg('Not set up yet', 'The Google Client ID has not been added to the app. See the README.', null);
  }
  if (store.get('signedIn')) {
    try { await getToken(); return route(); } catch {}
  }
  if (st.files.length) $('signin-text').textContent = 'Sign in to save the file you just shared.';
  show('signin', 'Welcome');
}

$('signin-btn').onclick = async () => { try { await getToken(true); route(); } catch (e) { fail(e, () => show('signin', 'Welcome')); } };
$('back').onclick = () => (st.cur === 'inside' ? openFolders(false) : goHome());
$('h-cam').onclick = $('i-cam').onclick = () => openPicker('cam');
$('h-file').onclick = $('i-file').onclick = () => openPicker('pick');
$('h-folders').onclick = () => openFolders(false);
$('cam').onchange = e => { took(e.target.files, true); e.target.value = ''; };
$('pick').onchange = e => { took(e.target.files, false); e.target.value = ''; };
$('newbtn').onclick = () => { $('nform').hidden = false; $('nerr').hidden = true; $('nname').focus(); };
$('nform').onsubmit = async e => {
  e.preventDefault();
  const name = $('nname').value.trim();
  if (!name) { $('nerr').hidden = false; return; }
  try {
    const root = await ensureRoot();
    const f = await api('files?fields=id,name', { method: 'POST', body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [root] }) });
    $('nname').value = '';
    pickFolder(f);
  } catch (x) { fail(x, () => openFolders(st.choose)); }
};
$('pchange').onclick = () => openFolders(true);
$('pcancel').onclick = goHome;
$('save').onclick = save;
$('d-more').onclick = () => pickFolder(st.folder);
$('d-home').onclick = goHome;
$('mhome').onclick = goHome;

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
loadShared().then(initAuth);
