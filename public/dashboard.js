async function api(path, opts) {
  const res = await fetch(path, {
    method: opts && opts.method ? opts.method : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

function setPill(id, ok, text) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = 'pill ' + (ok ? 'ok' : 'bad');
}

async function refreshStatus() {
  try {
    const status = await api('/api/status');
    setPill('pill-obs', status.obs.processRunning, 'OBS process: ' + (status.obs.processRunning ? 'running' : 'DOWN'));
    setPill('pill-ws', status.obs.websocketConnected, 'WebSocket: ' + (status.obs.websocketConnected ? 'connected' : 'disconnected'));
    setPill('pill-tf', status.tikfinityBridge.enabled, 'TikFinity bridge: ' + (status.tikfinityBridge.enabled ? 'listening :' + status.tikfinityBridge.port : 'disabled'));
    document.getElementById('pill-queue').textContent = 'Overlay queue: ' + status.overlayQueueLength;
    document.getElementById('currentScene').textContent = status.obs.currentScene || '-';
    document.getElementById('statusJson').textContent = JSON.stringify(status, null, 2);
  } catch (err) {
    document.getElementById('statusJson').textContent = 'Status fetch failed: ' + err.message;
  }
}

async function refreshBackgrounds() {
  const { backgrounds, current } = await api('/api/backgrounds');
  const container = document.getElementById('backgroundButtons');
  container.innerHTML = '';
  backgrounds.forEach((themeId) => {
    const btn = document.createElement('button');
    btn.textContent = themeId.replace(/_/g, ' ');
    if (themeId === current) btn.classList.add('active');
    btn.onclick = async () => {
      await api('/api/backgrounds/select', { method: 'POST', body: { themeId } });
      refreshBackgrounds();
    };
    container.appendChild(btn);
  });
  document.getElementById('currentBackground').textContent = current || '-';
}

async function refreshScenes() {
  const { scenes } = await api('/api/scenes');
  const container = document.getElementById('sceneButtons');
  container.innerHTML = '';
  scenes.forEach((sceneName) => {
    const btn = document.createElement('button');
    btn.textContent = sceneName;
    btn.onclick = async () => {
      await api('/api/scene', { method: 'POST', body: { sceneName } });
      refreshStatus();
    };
    container.appendChild(btn);
  });
}

function formatTrackLabel(trackId) {
  return trackId
    .replace(/_/g, ' ')
    .replace(/([a-zA-Z])(\d)/, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

async function refreshMusicTracks() {
  const { tracks } = await api('/api/music/tracks');
  const container = document.getElementById('musicTrackButtons');
  container.innerHTML = '';
  tracks.forEach((trackId) => {
    const btn = document.createElement('button');
    btn.textContent = formatTrackLabel(trackId);
    btn.onclick = async () => {
      await api('/api/music/play', { method: 'POST', body: { trackId } });
      refreshMusicStatus();
    };
    container.appendChild(btn);
  });
}

async function refreshMusicStatus() {
  const status = await api('/api/music/status');
  document.getElementById('currentTrack').textContent = status.currentTrackId ? formatTrackLabel(status.currentTrackId) : 'none';
  document.getElementById('musicState').textContent = (status.mediaState || 'stopped').replace('OBS_MEDIA_STATE_', '').toLowerCase();
  document.getElementById('volumeSlider').value = status.volumePercent;
  document.getElementById('volumeValue').textContent = status.volumePercent + '%';
}

async function refreshCamera() {
  try {
    const { enabled } = await api('/api/camera/status');
    document.getElementById('cameraState').textContent = enabled ? 'ON' : 'OFF';
  } catch (err) {
    document.getElementById('cameraState').textContent = 'unknown';
  }
}

document.querySelectorAll('[data-camera]').forEach((btn) => {
  btn.onclick = async () => {
    await api('/api/camera/toggle', { method: 'POST', body: { enabled: btn.dataset.camera === 'on' } });
    refreshCamera();
  };
});

async function refreshLogs() {
  try {
    const { lines } = await api('/api/logs?lines=200');
    document.getElementById('logsView').textContent = (lines || []).join('\n') || '(no log lines)';
    const el = document.getElementById('logsView');
    el.scrollTop = el.scrollHeight;
  } catch (err) {
    document.getElementById('logsView').textContent = 'Log fetch failed: ' + err.message;
  }
}
document.getElementById('refreshLogsBtn').onclick = refreshLogs;

document.querySelectorAll('[data-action]').forEach((btn) => {
  btn.onclick = async () => {
    const action = btn.dataset.action;
    await api('/api/music/' + action, { method: 'POST' });
    refreshMusicStatus();
  };
});

document.getElementById('volumeSlider').addEventListener('input', async (e) => {
  document.getElementById('volumeValue').textContent = e.target.value + '%';
});
document.getElementById('volumeSlider').addEventListener('change', async (e) => {
  await api('/api/music/volume', { method: 'POST', body: { percent: Number(e.target.value) } });
});

document.querySelectorAll('[data-trigger]').forEach((btn) => {
  btn.onclick = async () => {
    await api('/api/trigger/' + btn.dataset.trigger, { method: 'POST', body: {} });
  };
});

document.querySelectorAll('[data-sim]').forEach((btn) => {
  btn.onclick = async () => {
    await api('/api/testmode/' + btn.dataset.sim, { method: 'POST' });
  };
});

refreshStatus();
refreshBackgrounds();
refreshScenes();
refreshMusicTracks();
refreshMusicStatus();
refreshCamera();
refreshLogs();
setInterval(refreshStatus, 4000);
setInterval(refreshMusicStatus, 4000);
setInterval(refreshCamera, 5000);
