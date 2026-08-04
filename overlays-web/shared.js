/**
 * Shared helpers for every overlay page: WebSocket connection (with
 * auto-reconnect, since OBS Browser Sources stay loaded for hours), a small
 * per-page job queue so rapid-fire events (e.g. several joins in a row)
 * animate one at a time instead of stacking on top of each other, and a
 * lightweight canvas gold-particle burst (no external libraries - OBS
 * Browser Sources should not depend on anything but this page loading).
 */
function connectOverlayWs(onMessage) {
  const url = `ws://${location.hostname}:${location.port}/ws`;
  let socket;

  function connect() {
    socket = new WebSocket(url);
    socket.onmessage = (evt) => {
      try {
        onMessage(JSON.parse(evt.data));
      } catch (err) {
        console.error('Overlay WS message parse failed', err);
      }
    };
    socket.onclose = () => setTimeout(connect, 1500);
    socket.onerror = () => socket.close();
  }

  connect();
}

function createOverlayQueue(handler) {
  const queue = [];
  let running = false;

  async function runNext() {
    if (running) return;
    const job = queue.shift();
    if (!job) return;
    running = true;
    await handler(job);
    running = false;
    if (queue.length) runNext();
  }

  return {
    push(job) {
      queue.push(job);
      runNext();
    },
  };
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Spawns a short-lived burst of gold sparks from a point (defaults to canvas
 * center) using requestAnimationFrame. Self-cleaning: stops and clears once
 * every particle has faded out.
 */
function goldParticleBurst(canvas, { originX, originY, count = 60, durationMs = 1400 } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cx = originX !== undefined ? originX : width / 2;
  const cy = originY !== undefined ? originY : height / 2;
  const colors = ['#f6e6a8', '#d4af37', '#fff6d6', '#c99a2e'];

  const particles = Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 4.5;
    return {
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.2,
      size: 1.5 + Math.random() * 2.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      born: performance.now(),
    };
  });

  const gravity = 0.05;
  let raf;

  function frame(now) {
    ctx.clearRect(0, 0, width, height);
    let alive = false;
    for (const p of particles) {
      const age = now - p.born;
      if (age > durationMs) continue;
      alive = true;
      const t = age / durationMs;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += gravity;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - t * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (alive) {
      raf = requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, width, height);
    }
  }

  raf = requestAnimationFrame(frame);
}
