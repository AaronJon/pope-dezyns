// ---------- Session (kept only in this browser tab's memory for the session) ----------

let session = null; // { owner, repo, branch, token }
let pending = [];   // files staged but not yet published: { file, dataUrl, title, category }

const connectPanel = document.getElementById('connectPanel');
const uploadPanel = document.getElementById('uploadPanel');
const publishedPanel = document.getElementById('publishedPanel');
const connectStatus = document.getElementById('connectStatus');
const uploadStatus = document.getElementById('uploadStatus');

function setStatus(el, msg, kind) {
  el.textContent = msg;
  el.className = 'status-line' + (kind ? ' ' + kind : '');
}

// ---------- GitHub API helpers ----------

function apiUrl(path) {
  return `https://api.github.com/repos/${session.owner}/${session.repo}/contents/${path}`;
}

async function ghRequest(path, options = {}) {
  const res = await fetch(apiUrl(path), {
    ...options,
    headers: {
      Authorization: `token ${session.token}`,
      Accept: 'application/vnd.github+json',
      ...(options.headers || {}),
    },
  });
  return res;
}

async function getFile(path) {
  const res = await ghRequest(`${path}?ref=${session.branch}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to read ${path} (${res.status})`);
  const data = await res.json();
  return { sha: data.sha, content: decodeURIComponent(escape(atob(data.content))) };
}

async function putFile(path, contentStr, sha, message) {
  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(contentStr))),
    branch: session.branch,
  };
  if (sha) body.sha = sha;
  const res = await ghRequest(path, { method: 'PUT', body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to write ${path} (${res.status})`);
  }
  return res.json();
}

async function putBinaryFile(path, base64Content, message) {
  const body = { message, content: base64Content, branch: session.branch };
  const res = await ghRequest(path, { method: 'PUT', body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to upload ${path} (${res.status})`);
  }
  return res.json();
}

async function deleteFile(path, sha, message) {
  const res = await ghRequest(path, {
    method: 'DELETE',
    body: JSON.stringify({ message, sha, branch: session.branch }),
  });
  if (!res.ok) throw new Error(`Failed to delete ${path} (${res.status})`);
}

// ---------- Connect ----------

document.getElementById('connectBtn').addEventListener('click', async () => {
  const owner = document.getElementById('owner').value.trim();
  const repo = document.getElementById('repo').value.trim();
  const branch = document.getElementById('branch').value.trim() || 'main';
  const token = document.getElementById('token').value.trim();

  if (!owner || !repo || !token) {
    setStatus(connectStatus, 'Fill in username, repository, and token.', 'error');
    return;
  }

  session = { owner, repo, branch, token };
  setStatus(connectStatus, 'Checking access…');

  try {
    const res = await ghRequest('');
    if (!res.ok) throw new Error('Could not access that repository with this token.');
    setStatus(connectStatus, `Connected to ${owner}/${repo}.`, 'success');
    document.getElementById('connectBtn').hidden = true;
    document.getElementById('disconnectBtn').hidden = false;
    ['owner', 'repo', 'branch', 'token'].forEach(id => document.getElementById(id).disabled = true);
    uploadPanel.hidden = false;
    publishedPanel.hidden = false;
    await refreshPublishedList();
  } catch (err) {
    session = null;
    setStatus(connectStatus, err.message, 'error');
  }
});

document.getElementById('disconnectBtn').addEventListener('click', () => {
  session = null;
  pending = [];
  ['owner', 'repo', 'token'].forEach(id => { document.getElementById(id).value = ''; document.getElementById(id).disabled = false; });
  document.getElementById('branch').disabled = false;
  document.getElementById('connectBtn').hidden = false;
  document.getElementById('disconnectBtn').hidden = true;
  uploadPanel.hidden = true;
  publishedPanel.hidden = true;
  setStatus(connectStatus, 'Disconnected.');
  renderPending();
});

// ---------- Staging new uploads ----------

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => handleFiles(fileInput.files));

function handleFiles(fileList) {
  Array.from(fileList).forEach(file => {
    if (file.type !== 'image/png') return;
    const reader = new FileReader();
    reader.onload = () => {
      pending.push({
        file,
        dataUrl: reader.result,
        title: file.name.replace(/\.png$/i, ''),
        category: '',
      });
      renderPending();
    };
    reader.readAsDataURL(file);
  });
}

function renderPending() {
  const list = document.getElementById('pendingList');
  list.innerHTML = '';
  pending.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'pending-item';
    row.innerHTML = `
      <img src="${item.dataUrl}" alt="">
      <div class="fields">
        <input type="text" value="${item.title}" data-field="title" placeholder="Title">
        <input type="text" value="${item.category}" data-field="category" placeholder="Category (optional)">
      </div>
      <button class="danger" data-remove>Remove</button>
    `;
    row.querySelector('[data-field="title"]').addEventListener('input', e => item.title = e.target.value);
    row.querySelector('[data-field="category"]').addEventListener('input', e => item.category = e.target.value);
    row.querySelector('[data-remove]').addEventListener('click', () => { pending.splice(i, 1); renderPending(); });
    list.appendChild(row);
  });
  document.getElementById('publishBtn').hidden = pending.length === 0;
}

// ---------- Publish ----------

document.getElementById('publishBtn').addEventListener('click', async () => {
  if (!session || pending.length === 0) return;
  const btn = document.getElementById('publishBtn');
  btn.disabled = true;

  try {
    const manifestFile = await getFile('works.json');
    const works = manifestFile ? JSON.parse(manifestFile.content) : [];

    for (const item of pending) {
      setStatus(uploadStatus, `Uploading ${item.file.name}…`);
      const safeName = item.file.name.replace(/[^a-zA-Z0-9.\-_]/g, '-');
      const path = `images/${Date.now()}-${safeName}`;
      const base64 = item.dataUrl.split(',')[1];
      await putBinaryFile(path, base64, `Add ${item.title}`);
      works.push({ src: path, title: item.title, category: item.category });
    }

    setStatus(uploadStatus, 'Updating gallery listing…');
    await putFile('works.json', JSON.stringify(works, null, 2), manifestFile ? manifestFile.sha : null, 'Update works.json');

    pending = [];
    renderPending();
    setStatus(uploadStatus, 'Published. Live in a minute or two once GitHub Pages rebuilds.', 'success');
    await refreshPublishedList();
  } catch (err) {
    setStatus(uploadStatus, err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

// ---------- Published list + delete ----------

async function refreshPublishedList() {
  const listEl = document.getElementById('publishedList');
  listEl.innerHTML = 'Loading…';
  try {
    const manifestFile = await getFile('works.json');
    const works = manifestFile ? JSON.parse(manifestFile.content) : [];
    listEl.innerHTML = '';
    if (works.length === 0) {
      listEl.innerHTML = '<p class="status-line">Nothing published yet.</p>';
      return;
    }
    works.forEach((work, i) => {
      const row = document.createElement('div');
      row.className = 'published-item';
      row.innerHTML = `
        <img src="https://raw.githubusercontent.com/${session.owner}/${session.repo}/${session.branch}/${work.src}" alt="">
        <div class="meta">
          <div class="title">${work.title || '(untitled)'}</div>
          <div class="category">${work.category || ''}</div>
        </div>
        <button class="danger" data-delete>Delete</button>
      `;
      row.querySelector('[data-delete]').addEventListener('click', () => removeWork(i));
      listEl.appendChild(row);
    });
  } catch (err) {
    listEl.innerHTML = `<p class="status-line error">${err.message}</p>`;
  }
}

async function removeWork(index) {
  if (!confirm('Remove this piece from the gallery?')) return;
  try {
    const manifestFile = await getFile('works.json');
    const works = manifestFile ? JSON.parse(manifestFile.content) : [];
    const [removed] = works.splice(index, 1);

    await putFile('works.json', JSON.stringify(works, null, 2), manifestFile.sha, `Remove ${removed.title || removed.src}`);

    const imageFile = await getFile(removed.src);
    if (imageFile) await deleteFile(removed.src, imageFile.sha, `Delete ${removed.src}`);

    await refreshPublishedList();
  } catch (err) {
    alert(err.message);
  }
}
