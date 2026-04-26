/* ═══════════════════════════════════════════════════════
   ASTEROID TRACER — app.js
   Star-field · Reveal · Canvases · Score Calculator
   · Pseudocode Animator · Counter · Pipeline Steps
═══════════════════════════════════════════════════════ */

"use strict";

// ─────────────────────────────────────────────────────
// 1. STAR-FIELD CANVAS
// ─────────────────────────────────────────────────────
(function initStarfield() {
  const canvas = document.getElementById("starfield");
  const ctx = canvas.getContext("2d");
  let stars = [];
  const NUM_STARS = 320;

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function createStars() {
    stars = [];
    for (let i = 0; i < NUM_STARS; i++) {
      stars.push({
        x:     Math.random() * canvas.width,
        y:     Math.random() * canvas.height,
        r:     Math.random() * 1.6 + 0.3,
        alpha: Math.random() * 0.7 + 0.3,
        speed: Math.random() * 0.15 + 0.02,
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        twinkleDir:   Math.random() > 0.5 ? 1 : -1,
        drift: (Math.random() - 0.5) * 0.08
      });
    }
  }

  function drawStars() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach(s => {
      // Twinkle
      s.alpha += s.twinkleSpeed * s.twinkleDir;
      if (s.alpha >= 1) { s.alpha = 1; s.twinkleDir = -1; }
      if (s.alpha <= 0.1) { s.alpha = 0.1; s.twinkleDir = 1; }

      // Drift
      s.x += s.drift;
      s.y -= s.speed;
      if (s.y < -2) { s.y = canvas.height + 2; s.x = Math.random() * canvas.width; }

      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 220, 255, ${s.alpha})`;
      ctx.fill();
    });
    requestAnimationFrame(drawStars);
  }

  window.addEventListener("resize", () => { resize(); createStars(); });
  resize();
  createStars();
  drawStars();
})();


// ─────────────────────────────────────────────────────
// 2. SCROLL REVEAL (IntersectionObserver)
// ─────────────────────────────────────────────────────
(function initReveal() {
  const elements = document.querySelectorAll(".reveal");
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });
  elements.forEach(el => observer.observe(el));
})();


// ─────────────────────────────────────────────────────
// 3. ANIMATED COUNTER (Results Dashboard)
// ─────────────────────────────────────────────────────
(function initCounters() {
  const counters = document.querySelectorAll(".counter[data-target]");
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const target = parseInt(el.dataset.target);
      const duration = 1800;
      const start = performance.now();
      function step(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // cubic ease-out
        el.textContent = Math.floor(eased * target).toLocaleString();
        if (progress < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
      obs.unobserve(el);
    });
  }, { threshold: 0.5 });
  counters.forEach(c => obs.observe(c));
})();


// ─────────────────────────────────────────────────────
// 4. FITS FRAME COUNTER ANIMATION (Stage 1)
// ─────────────────────────────────────────────────────
(function initFitsCounter() {
  const el = document.getElementById("fits-count");
  if (!el) return;
  const obs = new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) return;
    let n = 0;
    const target = 4000;
    const step = Math.ceil(target / 60);
    const intv = setInterval(() => {
      n = Math.min(n + step, target);
      el.textContent = n.toLocaleString();
      if (n >= target) clearInterval(intv);
    }, 16);
    obs.unobserve(el);
  }, { threshold: 0.5 });
  obs.observe(el);
})();


// ─────────────────────────────────────────────────────
// 5. ZSCALE NORMALIZATION DEMO (Stage 2)
// ─────────────────────────────────────────────────────
(function initZscaleDemo() {
  const rawCanvas  = document.getElementById("raw-canvas");
  const normCanvas = document.getElementById("norm-canvas");
  if (!rawCanvas || !normCanvas) return;
  const W = 140, H = 110;
  const rCtx = rawCanvas.getContext("2d");
  const nCtx = normCanvas.getContext("2d");

  // Simulate a noisy astronomical field (raw)
  const rawImg = rCtx.createImageData(W, H);
  const normImg = nCtx.createImageData(W, H);

  // Generate pseudo-FITS noise with a few bright sources
  const rawData = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    rawData[i] = Math.random() * 800 + 100; // baseline noise
  }
  // Fake stars
  const starSources = [
    { x: 30, y: 25, amp: 8000 },
    { x: 85, y: 60, amp: 12000 },
    { x: 110, y: 30, amp: 5000 },
    { x: 55, y: 90, amp: 9000 },
    { x: 20, y: 70, amp: 3000 },
  ];
  starSources.forEach(({ x, y, amp }) => {
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        const px = x + dx, py = y + dy;
        if (px < 0 || px >= W || py < 0 || py >= H) continue;
        const dist = Math.sqrt(dx * dx + dy * dy);
        rawData[py * W + px] += amp * Math.exp(-dist * dist / 4);
      }
    }
  });

  // Raw: map to inferno-ish colormap (hot colors)
  const rawMin = 100, rawMax = 15000;
  for (let i = 0; i < W * H; i++) {
    const t = Math.max(0, Math.min(1, (rawData[i] - rawMin) / (rawMax - rawMin)));
    const idx = i * 4;
    // inferno-like: dark purple → orange → yellow
    rawImg.data[idx]   = Math.floor(t < 0.5 ? t * 2 * 180 : 180 + (t - 0.5) * 2 * 75);
    rawImg.data[idx+1] = Math.floor(t < 0.5 ? t * 2 * 30  : 30  + (t - 0.5) * 2 * 200);
    rawImg.data[idx+2] = Math.floor(t < 0.25 ? t * 4 * 100 : Math.max(0, 100 - (t - 0.25) * 4 * 100));
    rawImg.data[idx+3] = 255;
  }
  rCtx.putImageData(rawImg, 0, 0);

  // ZScale: compute vmin/vmax (simplified: 5th and 95th percentile emulation)
  const sorted = Float32Array.from(rawData).sort();
  const vmin = sorted[Math.floor(sorted.length * 0.05)];
  const vmax = sorted[Math.floor(sorted.length * 0.95)];

  for (let i = 0; i < W * H; i++) {
    const t = Math.max(0, Math.min(1, (rawData[i] - vmin) / (vmax - vmin)));
    const idx = i * 4;
    // inferno mapped again but now normalized
    normImg.data[idx]   = Math.floor(t < 0.5 ? t * 2 * 180 : 180 + (t - 0.5) * 2 * 75);
    normImg.data[idx+1] = Math.floor(t < 0.5 ? t * 2 * 30  : 30  + (t - 0.5) * 2 * 200);
    normImg.data[idx+2] = Math.floor(t < 0.25 ? t * 4 * 100 : Math.max(0, 100 - (t - 0.25) * 4 * 100));
    normImg.data[idx+3] = 255;
  }
  nCtx.putImageData(normImg, 0, 0);
})();


// ─────────────────────────────────────────────────────
// 6. MOTION DETECTION DEMO (Stage 3) — animated diff mask
// ─────────────────────────────────────────────────────
(function initMotionDemo() {
  const canvas = document.getElementById("motion-canvas");
  const slider = document.getElementById("tau-slider");
  const tauLabel = document.getElementById("tau-val");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  let tau = 20;
  let t = 0;

  function renderMotionMask() {
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // Diffmap: simulate a moving blob + some noise
        const blobX = W / 2 + Math.cos(t * 0.04) * 60;
        const blobY = H / 2 + Math.sin(t * 0.04) * 30;
        const distBlob = Math.sqrt((x - blobX) ** 2 + (y - blobY) ** 2);
        const blobVal = Math.max(0, 120 - distBlob * 5);
        const noise = Math.random() * 15;
        const diffVal = blobVal + noise;

        const idx = (y * W + x) * 4;
        if (diffVal > tau) {
          // Motion pixel: cyan glow
          const intensity = Math.min(1, (diffVal - tau) / 60);
          img.data[idx]   = Math.floor(0   * intensity);
          img.data[idx+1] = Math.floor(255 * intensity);
          img.data[idx+2] = Math.floor(200 * intensity);
          img.data[idx+3] = 255;
        } else {
          // Background: near black with faint star-noise
          const base = Math.floor(Math.random() * 12);
          img.data[idx]   = base;
          img.data[idx+1] = base;
          img.data[idx+2] = Math.floor(base * 1.5);
          img.data[idx+3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    // Draw direction label
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(123,130,168,0.8)";
    ctx.fillText(`Motion mask  τ=${tau}`, 8, H - 8);
    t++;
  }

  function loop() { renderMotionMask(); requestAnimationFrame(loop); }
  loop();

  if (slider) {
    slider.addEventListener("input", () => {
      tau = parseInt(slider.value);
      tauLabel.textContent = tau;
    });
  }
})();


// ─────────────────────────────────────────────────────
// 7. BLOB TRACK DEMO (Stage 4) — scatter with links
// ─────────────────────────────────────────────────────
(function initTrackDemo() {
  const canvas = document.getElementById("track-canvas");
  const mldSlider = document.getElementById("mld-slider");
  const mldLabel  = document.getElementById("mld-val");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  let maxDist = 15;
  let frameBlobs = [];
  let t = 0;

  // Simulate a set of blobs across 6 "pseudo-frames"
  function generateBlobs(tick) {
    // Main asteroid track (moves linearly + some jitter)
    const frames = [];
    for (let f = 0; f < 6; f++) {
      const blobsInFrame = [];
      // The real asteroid
      const ax = 30 + (f / 5) * (W - 60) + Math.sin(tick * 0.05 + f) * 3;
      const ay = H * 0.4 + f * 5 + Math.cos(tick * 0.05 + f) * 2;
      blobsInFrame.push({ x: ax, y: ay, real: true });
      // Noise blobs
      for (let n = 0; n < 3; n++) {
        blobsInFrame.push({
          x: Math.random() * W,
          y: Math.random() * H,
          real: false
        });
      }
      frames.push(blobsInFrame);
    }
    return frames;
  }

  function euclidean(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  function render() {
    if (t % 80 === 0) frameBlobs = generateBlobs(t);
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = "rgba(5,10,30,0.95)";
    ctx.fillRect(0, 0, W, H);

    // Draw links between nearest blobs across frames
    for (let f = 0; f < frameBlobs.length - 1; f++) {
      const from = frameBlobs[f];
      const to   = frameBlobs[f + 1];
      from.forEach(bA => {
        let bestDist = Infinity, bestB = null;
        to.forEach(bB => {
          const d = euclidean(bA, bB);
          if (d < bestDist) { bestDist = d; bestB = bB; }
        });
        if (bestB && bestDist <= maxDist) {
          ctx.beginPath();
          ctx.moveTo(bA.x, bA.y);
          ctx.lineTo(bestB.x, bestB.y);
          ctx.strokeStyle = bA.real ? "rgba(0,255,204,0.55)" : "rgba(136,136,136,0.2)";
          ctx.lineWidth = bA.real ? 2 : 0.7;
          ctx.stroke();
        }
      });
    }

    // Draw blobs
    frameBlobs.forEach((frame, fi) => {
      frame.forEach(blob => {
        ctx.beginPath();
        ctx.arc(blob.x, blob.y, blob.real ? 5 : 3, 0, Math.PI * 2);
        if (blob.real) {
          const cyanAlpha = 0.5 + fi * 0.08;
          ctx.fillStyle = `rgba(0,255,204,${cyanAlpha.toFixed(2)})`;
          ctx.shadowColor = "rgba(0,255,204,0.6)";
          ctx.shadowBlur = 8;
        } else {
          ctx.fillStyle = "rgba(100,110,160,0.5)";
          ctx.shadowBlur = 0;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      });
    });

    // Labels
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(0,255,204,0.6)";
    ctx.fillText("— Asteroid track", 8, H - 20);
    ctx.fillStyle = "rgba(136,136,136,0.5)";
    ctx.fillText("· Noise blobs", 8, H - 8);
    t++;
  }

  function loop() { render(); requestAnimationFrame(loop); }
  loop();

  if (mldSlider) {
    mldSlider.addEventListener("input", () => {
      maxDist = parseInt(mldSlider.value);
      mldLabel.textContent = maxDist;
    });
  }
})();


// ─────────────────────────────────────────────────────
// 8. MAIN TRACK VISUALIZATION (Full panel)
// ─────────────────────────────────────────────────────
(function initMainTrack() {
  const canvas = document.getElementById("main-track-canvas");
  if (!canvas) return;

  // Responsive sizing
  function setSize() {
    const parent = canvas.parentElement;
    canvas.width  = parent.clientWidth - 48;
    canvas.height = Math.min(480, Math.max(300, window.innerHeight * 0.45));
  }
  setSize();
  window.addEventListener("resize", setSize);

  const ctx = canvas.getContext("2d");

  // Simulate the best track (18 points, mimicking the real paper output)
  function generateTrack(W, H) {
    const points = [];
    // Start at ~20% from left, 60% down
    let x = W * 0.18, y = H * 0.62;
    // The track moves right-and-slightly-up over 18 frames
    const vx = (W * 0.64) / 17;
    const vy = -(H * 0.28) / 17;
    for (let i = 0; i < 18; i++) {
      points.push({ x: x + (Math.random() - 0.5) * 4, y: y + (Math.random() - 0.5) * 4 });
      x += vx;
      y += vy;
    }
    return points;
  }

  function coolColor(t) {
    // cool colormap: cyan (0,255,255) → magenta (255,0,255)
    const r = Math.floor(t * 255);
    const g = Math.floor((1 - t) * 255);
    const b = 255;
    return { r, g, b };
  }

  function renderTrack() {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // ── Background: simulated FITS inferno ──
    const grad = ctx.createRadialGradient(W/2, H/2, 10, W/2, H/2, Math.max(W, H) * 0.7);
    grad.addColorStop(0, "#0d0520");
    grad.addColorStop(0.4, "#060212");
    grad.addColorStop(1, "#030614");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Paint faint star field on track canvas too
    ctx.save();
    for (let i = 0; i < 200; i++) {
      const sx = Math.random() * W;
      const sy = Math.random() * H;
      const sr = Math.random() * 1.2;
      const sa = Math.random() * 0.5 + 0.1;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,215,255,${sa})`;
      ctx.fill();
    }
    ctx.restore();

    const pts = generateTrack(W, H);
    const n = pts.length;

    // ── Glowing trail ──
    for (let i = 0; i < n - 1; i++) {
      const t = i / (n - 2);
      const c = coolColor(t);
      const rgba = (alpha) => `rgba(${c.r},${c.g},${c.b},${alpha})`;

      // Outer glow (wide, faint)
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i+1].x, pts[i+1].y);
      ctx.strokeStyle = rgba(0.18);
      ctx.lineWidth = 14;
      ctx.lineCap = "round";
      ctx.stroke();

      // Mid glow
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i+1].x, pts[i+1].y);
      ctx.strokeStyle = rgba(0.45);
      ctx.lineWidth = 5;
      ctx.stroke();

      // Core line
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i+1].x, pts[i+1].y);
      ctx.strokeStyle = rgba(1.0);
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }

    // ── Per-frame dots ──
    pts.forEach((p, i) => {
      const t = i / (n - 1);
      const c = coolColor(t);
      const rgba = (alpha) => `rgba(${c.r},${c.g},${c.b},${alpha})`;
      // Halo
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = rgba(0.15);
      ctx.fill();
      // Core dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = rgba(0.9);
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 0.6;
      ctx.fill();
      ctx.stroke();
    });

    // ── Start marker (★) ──
    const start = pts[0];
    ctx.font = "bold 20px sans-serif";
    ctx.fillStyle = "#00ffcc";
    ctx.shadowColor = "#00ffcc";
    ctx.shadowBlur = 16;
    ctx.fillText("★", start.x - 10, start.y + 7);
    ctx.shadowBlur = 0;

    // ── End marker (◆) ──
    const end = pts[n - 1];
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "#ff4466";
    ctx.shadowColor = "#ff4466";
    ctx.shadowBlur = 14;
    ctx.fillText("◆", end.x - 8, end.y + 6);
    ctx.shadowBlur = 0;

    // ── Direction arrow ──
    if (n >= 2) {
      const prev = pts[n - 2];
      const dx = end.x - prev.x;
      const dy = end.y - prev.y;
      const angle = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(end.x, end.y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-8, -6);
      ctx.lineTo(-8, 6);
      ctx.closePath();
      ctx.fillStyle = "#ff4466";
      ctx.shadowColor = "#ff4466";
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.restore();
      ctx.shadowBlur = 0;
    }

    // ── Colour bar (time progression) ──
    const barX = W - 28, barY = H * 0.1, barH = H * 0.4;
    const barGrad = ctx.createLinearGradient(barX, barY, barX, barY + barH);
    barGrad.addColorStop(0, "rgba(255,0,255,0.9)");
    barGrad.addColorStop(1, "rgba(0,255,255,0.9)");
    ctx.fillStyle = barGrad;
    ctx.fillRect(barX, barY, 10, barH);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, 10, barH);
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(180,185,220,0.7)";
    ctx.fillText("Frame 1", barX - 44, barY + 4);
    ctx.fillText("Frame 18", barX - 52, barY + barH + 4);
  }

  // Render once static (track positions are deterministic from seed for main canvas)
  // Save random state by using a seeded approach:
  let savedRandState = null;

  // Override Math.random temporarily with a simple seeded version for determinism
  function seededRender() {
    const origRand = Math.random;
    let seed = 42;
    Math.random = function() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    renderTrack();
    Math.random = origRand;
  }

  const obs = new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) return;
    seededRender();
    obs.unobserve(canvas);
  }, { threshold: 0.15 });
  obs.observe(canvas);
})();


// ─────────────────────────────────────────────────────
// 9. LIVE SCORE CALCULATOR (Algorithm Explorer)
// ─────────────────────────────────────────────────────
(function initScoreCalc() {
  const dispSlider = document.getElementById("sl-disp");
  const pathSlider = document.getElementById("sl-path");
  const lenSlider  = document.getElementById("sl-len");
  if (!dispSlider) return;

  const dispLabel  = document.getElementById("sl-D");
  const pathLabel  = document.getElementById("sl-P");
  const lenLabel   = document.getElementById("sl-L");
  const scoreEl    = document.getElementById("live-score");
  const scoreBar   = document.getElementById("score-bar");
  const verdictEl  = document.getElementById("score-verdict");

  const MAX_SCORE = 8000;

  function computeScore() {
    const D = parseInt(dispSlider.value);
    const P = Math.max(parseInt(pathSlider.value), D); // path >= displacement
    const L = parseInt(lenSlider.value);
    const S = D / (P + 1e-6);
    const V = P / Math.max(L - 1, 1);
    const score = D * S * (1 + 0.1 * L) * (1 + 0.05 * V);
    return { D, P, L, S, V, score };
  }

  function update() {
    const { D, P, L, score } = computeScore();
    dispLabel.textContent = D;
    pathLabel.textContent = Math.max(P, parseInt(pathSlider.value));
    lenLabel.textContent  = L;

    scoreEl.textContent = score.toFixed(1);
    const pct = Math.min(score / MAX_SCORE * 100, 100);
    scoreBar.style.width = pct.toFixed(1) + "%";

    if (score < 100) {
      verdictEl.textContent = "⚠ Track rejected (too short / stationary)";
      verdictEl.style.color = "#ff4466";
    } else if (score < 1000) {
      verdictEl.textContent = "△ Weak candidate — low motion or zig-zag";
      verdictEl.style.color = "#ffcc44";
    } else if (score < 3000) {
      verdictEl.textContent = "✓ Good track — accepted as candidate";
      verdictEl.style.color = "#4488ff";
    } else {
      verdictEl.textContent = "★ Strong track — likely real asteroid!";
      verdictEl.style.color = "#00ffcc";
    }
  }

  [dispSlider, pathSlider, lenSlider].forEach(s => s.addEventListener("input", update));
  update(); // initial render
})();


// ─────────────────────────────────────────────────────
// 10. PSEUDOCODE STEP ANIMATOR
// ─────────────────────────────────────────────────────
(function initPseudoAnimator() {
  const btn = document.getElementById("anim-steps-btn");
  if (!btn) return;

  const steps = document.querySelectorAll(".pseudo-step");
  let animRunning = false;

  btn.addEventListener("click", () => {
    if (animRunning) return;
    animRunning = true;
    btn.textContent = "⏳ Running…";
    btn.disabled = true;

    // Clear all active
    steps.forEach(s => s.classList.remove("active-step"));

    let i = 0;
    const intv = setInterval(() => {
      if (i > 0) steps[i - 1].classList.remove("active-step");
      if (i < steps.length) {
        steps[i].classList.add("active-step");
        steps[i].scrollIntoView({ behavior: "smooth", block: "nearest" });
        i++;
      } else {
        clearInterval(intv);
        animRunning = false;
        btn.textContent = "▶ Animate Steps";
        btn.disabled = false;
      }
    }, 550);
  });
})();


// ─────────────────────────────────────────────────────
// 11. PIPELINE STAGE CAROUSEL — one-by-one interaction
// ─────────────────────────────────────────────────────
(function initStageCarousel() {
  const slider = document.getElementById("stages-slider");
  const cards = document.querySelectorAll(".stage-card");
  const dots = document.querySelectorAll(".pp-dot");
  const prevBtn = document.getElementById("prev-stage");
  const nextBtn = document.getElementById("next-stage");

  if (!slider || cards.length === 0) return;

  let currentIndex = 0;

  function updateCarousel() {
    // Calculate slide offset
    const offset = currentIndex * -100;
    slider.style.transform = `translateX(${offset}%)`;

    // Update Dots
    dots.forEach((dot, i) => {
      dot.classList.toggle("active", i === currentIndex);
      // Also highlight previous steps as 'completed'
      if (i < currentIndex) dot.classList.add("completed");
      else dot.classList.remove("completed");
    });

    // Update Cards (scale/opacity)
    cards.forEach((card, i) => {
      card.classList.toggle("active-card", i === currentIndex);
    });

    // Disable/Enable buttons
    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex === cards.length - 1;
  }

  prevBtn.addEventListener("click", () => {
    if (currentIndex > 0) {
      currentIndex--;
      updateCarousel();
    }
  });

  nextBtn.addEventListener("click", () => {
    if (currentIndex < cards.length - 1) {
      currentIndex++;
      updateCarousel();
    }
  });

  // Sync dots
  dots.forEach((dot, i) => {
    dot.addEventListener("click", () => {
      currentIndex = i;
      updateCarousel();
    });
  });

  // Initial call
  updateCarousel();
})();


// ─────────────────────────────────────────────────────
// 12. SENSITIVITY TABLE — row highlights on hover
// ─────────────────────────────────────────────────────
(function initSensTable() {
  const rows = document.querySelectorAll(".sens-row");
  rows.forEach(row => {
    row.addEventListener("mouseenter", () => {
      rows.forEach(r => r.style.opacity = "0.5");
      row.style.opacity = "1";
    });
    row.addEventListener("mouseleave", () => {
      rows.forEach(r => r.style.opacity = "1");
    });
  });
})();


// ─────────────────────────────────────────────────────
// 13. NAVBAR TRANSPARENCY on scroll
// ─────────────────────────────────────────────────────
(function initNavbar() {
  const nav = document.getElementById("navbar");
  window.addEventListener("scroll", () => {
    if (window.scrollY > 40) {
      nav.style.background = "rgba(3,6,20,0.97)";
    } else {
      nav.style.background = "rgba(3,6,20,0.85)";
    }
  }, { passive: true });
})();


// ─────────────────────────────────────────────────────
// 15. RUN PIPELINE & TERMINAL LOGIC
// ─────────────────────────────────────────────────────
(function initPipelineRunner() {
  const runBtn = document.getElementById("run-pipeline-btn");
  const terminal = document.getElementById("terminal-output");
  const clearBtn = document.getElementById("clear-terminal");
  const container = document.getElementById("terminal-container");

  if (!runBtn || !terminal) return;

  function addLog(text, type = "muted") {
    const lines = text.split("\n");
    lines.forEach(line => {
      if (line.trim() === "") return;
      const el = document.createElement("div");
      el.className = `line ${type}`;
      el.textContent = line;
      terminal.appendChild(el);
    });
    terminal.scrollTop = terminal.scrollHeight;
  }

  function parseResults(stdout) {
    const metrics = {
      frames: /Total FITS frames loaded \(N\)\s*:\s*(\d+)/,
      tracked: /Frames tracked\s*:\s*(\d+)/,
      disp: /Displacement\s*:\s*([\d.]+)/,
      speed: /Avg speed\s*:\s*([\d.]+)/,
      path: /Path length\s*:\s*([\d.]+)/
    };

    const results = {};
    for (const [key, regex] of Object.entries(metrics)) {
      const match = stdout.match(regex);
      if (match) results[key] = match[1];
    }

    // Update UI elements
    const updateEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    // Show the actual plot image
    const plotImg = document.getElementById("latest-result-plot");
    const canvas = document.getElementById("main-track-canvas");
    if (plotImg) {
      plotImg.src = `http://${window.location.hostname}:7892/get-latest-plot?t=${new Date().getTime()}`;
      plotImg.style.display = "block";
      if (canvas) canvas.style.display = "none";
    }

    if (results.frames) {
      const frameCounter = document.querySelector('.metric-card.mc-primary .metric-val');
      if (frameCounter) frameCounter.textContent = results.frames;
    }
    
    // We can target specific cards by finding their labels
    const cards = document.querySelectorAll('.metric-card');
    cards.forEach(card => {
      const label = card.querySelector('.metric-label')?.textContent.toLowerCase();
      const valEl = card.querySelector('.metric-val');
      if (!valEl) return;

      if (label && label.includes('frames tracked')) valEl.textContent = results.tracked || valEl.textContent;
      if (label && label.includes('net displacement')) valEl.innerHTML = `${results.disp || '96.1'}<span class="metric-unit">px</span>`;
      if (label && label.includes('average speed')) valEl.innerHTML = `${results.speed || '9.7'}<span class="metric-unit">px/f</span>`;
      if (label && label.includes('total path length')) valEl.innerHTML = `${results.path || '165.2'}<span class="metric-unit">px</span>`;
      if (label && label.includes('straightness') && results.disp && results.path) {
        valEl.textContent = (parseFloat(results.disp) / parseFloat(results.path)).toFixed(2);
      }
    });

    addLog("\n> Dashboard statistics updated with fresh data.", "highlight");
  }

  runBtn.addEventListener("click", async () => {
    // Show terminal and scroll to it
    container.classList.add("visible");
    container.scrollIntoView({ behavior: "smooth", block: "center" });

    runBtn.disabled = true;
    runBtn.style.opacity = "0.5";
    runBtn.innerHTML = "<span>⌛ Running...</span>";
    
    addLog("\n> Initializing Python environment...", "highlight");
    addLog("> Executing: python asteriod_detection.py", "muted");

    try {
      const response = await fetch(`http://${window.location.hostname}:7892/run-pipeline`, {
        method: "POST"
      });

      const data = await response.json();

      if (data.status === "success") {
        addLog(data.stdout, "success");
        addLog("\n[SUCCESS] Pipeline execution completed.", "success");
        addLog("> Generated: Figure_1.png", "highlight");
        parseResults(data.stdout);
      } else {
        if (data.stdout) addLog(data.stdout, "muted");
        addLog(data.stderr, "error");
        addLog("\n[ERROR] Pipeline execution failed.", "error");
      }
    } catch (err) {
      addLog(`\n[CONNECTION ERROR] Could not reach backend server on port 7892.`, "error");
      addLog(`Make sure to run 'python backend.py' in the ui directory.`, "muted");
    } finally {
      runBtn.disabled = false;
      runBtn.style.opacity = "1";
      runBtn.innerHTML = "<span>▶ Run Analysis</span>";
    }
  });
})();
