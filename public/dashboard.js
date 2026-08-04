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

document.getElementById('simMilestoneLike').onclick = async () => {
  await api('/api/testmode/milestone', { method: 'POST', body: { kind: 'like', value: 1000 } });
};
document.getElementById('simMilestoneViewer').onclick = async () => {
  await api('/api/testmode/milestone', { method: 'POST', body: { kind: 'viewer', value: 100 } });
};

let battleGuests = [{ name: '', avatarUrl: '', points: 0 }, { name: '', avatarUrl: '', points: 0 }];

function renderGuestRows() {
  const container = document.getElementById('guestRows');
  container.innerHTML = '';
  battleGuests.forEach((guest, idx) => {
    const row = document.createElement('div');
    row.className = 'form-row';
    row.innerHTML = `
      <input type="text" placeholder="Guest name" value="${guest.name}" data-field="name" data-idx="${idx}" />
      <input type="text" placeholder="Photo URL (optional)" value="${guest.avatarUrl}" data-field="avatarUrl" data-idx="${idx}" />
      <input type="number" placeholder="Points" value="${guest.points}" data-field="points" data-idx="${idx}" />
      <button data-remove="${idx}">Remove</button>
    `;
    container.appendChild(row);
  });
  container.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', (e) => {
      const idx = Number(e.target.dataset.idx);
      const field = e.target.dataset.field;
      battleGuests[idx][field] = field === 'points' ? Number(e.target.value) || 0 : e.target.value;
    });
  });
  container.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.onclick = () => {
      battleGuests.splice(Number(btn.dataset.remove), 1);
      renderGuestRows();
    };
  });
}
renderGuestRows();

document.getElementById('addGuestBtn').onclick = () => {
  battleGuests.push({ name: '', avatarUrl: '', points: 0 });
  renderGuestRows();
};
document.getElementById('resetGuestsBtn').onclick = () => {
  battleGuests = [{ name: '', avatarUrl: '', points: 0 }, { name: '', avatarUrl: '', points: 0 }];
  renderGuestRows();
  document.getElementById('battleStatus').textContent = '';
};
document.getElementById('startCountdownBtn').onclick = async () => {
  const mode = document.getElementById('battleMode').value;
  const named = battleGuests.filter((g) => g.name.trim());
  if (named.length < 2) { alert('Add at least 2 guests with names first.'); return; }

  const btn = document.getElementById('startCountdownBtn');
  const statusEl = document.getElementById('battleStatus');
  btn.disabled = true;
  statusEl.textContent = 'Countdown running...';

  await api('/api/trigger/battle-countdown', { method: 'POST', body: { mode, guests: named } });

  const COUNTDOWN_SECONDS = 10;
  const COUNTDOWN_TICK_MS = 3000;
  setTimeout(() => {
    btn.disabled = false;
    if (mode === 'elimination' && named.length > 2) {
      const sorted = [...named].sort((a, b) => b.points - a.points);
      const survivors = sorted.slice(0, -1);
      battleGuests = survivors;
      renderGuestRows();
      statusEl.textContent = `Dropped: ${sorted[sorted.length - 1].name}. ${survivors.length} guest(s) remain - update points and start the next round.`;
    } else {
      const winner = [...named].sort((a, b) => b.points - a.points)[0];
      statusEl.textContent = `Winner: ${winner.name}! Reset to start a new battle.`;
    }
  }, (COUNTDOWN_SECONDS + 1) * COUNTDOWN_TICK_MS + 500);
};

document.getElementById('bbSubmit').onclick = async () => {
  const winner = document.getElementById('bbWinner').value.trim();
  if (!winner) { alert("Enter the winner's TikTok username first."); return; }
  await api('/api/trigger/boxbattle', {
    method: 'POST',
    body: {
      winner,
      avatarUrl: document.getElementById('bbAvatarUrl').value.trim() || undefined,
      winnerScore: Number(document.getElementById('bbWinnerScore').value) || undefined,
      loserScore: Number(document.getElementById('bbLoserScore').value) || undefined,
    },
  });
};

async function refreshGoal() {
  try {
    const goal = await api('/api/goal');
    document.getElementById('currentGoal').textContent = `${goal.label} - target ${goal.target} ${goal.metric}`;
    document.getElementById('goalMetric').value = goal.metric;
    document.getElementById('goalTarget').value = goal.target;
    document.getElementById('goalLabel').value = goal.label;
  } catch (err) {
    document.getElementById('currentGoal').textContent = 'unavailable';
  }
}
document.getElementById('goalSubmit').onclick = async () => {
  await api('/api/goal', {
    method: 'POST',
    body: {
      metric: document.getElementById('goalMetric').value,
      target: Number(document.getElementById('goalTarget').value),
      label: document.getElementById('goalLabel').value.trim(),
    },
  });
  refreshGoal();
};

async function refreshOverlayUrls() {
  try {
    const status = await api('/api/status');
    const { host, port } = status.overlayServer;
    const base = `http://${host}:${port}`;
    const pages = ['join', 'follow', 'share', 'milestone', 'boxbattle', 'biggift', 'mvp', 'countdown', 'battledrop', 'leaderboard', 'goalbar', 'starting', 'brb', 'ending'];
    document.getElementById('overlayUrls').textContent = pages.map((p) => `${p.padEnd(10)} ${base}/${p}.html`).join('\n');
  } catch (err) {
    document.getElementById('overlayUrls').textContent = 'Overlay server status unavailable: ' + err.message;
  }
}

refreshStatus();
refreshBackgrounds();
refreshScenes();
refreshMusicTracks();
refreshMusicStatus();
refreshCamera();
refreshLogs();
refreshGoal();
refreshOverlayUrls();
setInterval(refreshStatus, 4000);
setInterval(refreshMusicStatus, 4000);
setInterval(refreshCamera, 5000);
