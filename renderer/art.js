// Comic drawing kit: everything is drawn with canvas paths, no image assets.
// Outlines use the "stroke everything, then fill everything" trick so a cluster
// of wool puffs gets one merged ink outline.
(function () {
  const C = {
    ink: '#1d1b26',
    wool: '#fffaf0',
    woolShade: '#d8cdbb',
    face: '#3b3542',
    earPink: '#f2a7a8',
    skin: '#f7c9c2',
    skinShade: '#e3a59d',
    blackWool: '#4a4452',
    blackShade: '#2b2731',
    blackFace: '#1d1b26',
    hay: '#f4c84f',
    hayDark: '#c58d22',
    twine: '#a0442c',
    wood: '#c07c40',
    woodDark: '#7d4a22',
    pop: '#ffd23f',
    red: '#ff5a5f',
    pink: '#ff7aa8',
    white: '#ffffff',
    grassTip: '#7ccd52',
  };
  const OUT = 3.5; // outline half-width in px

  const patterns = new Map();
  function halftone(ctx, color) {
    if (patterns.has(color)) return patterns.get(color);
    const c = document.createElement('canvas');
    c.width = c.height = 7;
    const g = c.getContext('2d');
    g.fillStyle = color;
    g.beginPath();
    g.arc(2, 2, 1.25, 0, Math.PI * 2);
    g.arc(5.5, 5.5, 1.25, 0, Math.PI * 2);
    g.fill();
    const p = ctx.createPattern(c, 'repeat');
    patterns.set(color, p);
    return p;
  }

  function hash(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // Stroke a set of circles/ellipses with a thick ink line, then fill them.
  function blob(ctx, shapes, fill, out = OUT) {
    ctx.beginPath();
    for (const s of shapes) {
      ctx.moveTo(s.x + (s.rx || s.r), s.y);
      ctx.ellipse(s.x, s.y, s.rx || s.r, s.ry || s.r, s.rot || 0, 0, Math.PI * 2);
    }
    ctx.lineWidth = out * 2;
    ctx.strokeStyle = C.ink;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function bodyShapes(s) {
    const w = s.wool;
    const rx = 25 + 13 * w;
    const ry = 15 + 8 * w;
    const pr = 8 + 6 * w;
    const cy = -34 - 4 * w;
    const shapes = [{ x: 0, y: cy, rx: rx * 0.92, ry: ry * 0.92 }];
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.2;
      const j = hash(s.seed + i);
      shapes.push({
        x: Math.cos(a) * rx * 0.86,
        y: cy + Math.sin(a) * ry * 0.78,
        r: pr * (0.85 + 0.3 * j),
      });
    }
    // tail puff
    shapes.push({ x: -rx - pr * 0.35, y: cy - 3, r: 5 + 3 * w });
    return { shapes, rx, ry, pr, cy };
  }

  function legs(ctx, s, cy) {
    const base = cy + 10;
    const len = -base;
    const xs = [-17, -8, 11, 20];
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      let a;
      if (s.air) a = (i % 2 ? 0.35 : -0.35) + Math.sin(s.t * 14 + i) * 0.15;
      else a = Math.sin(s.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.42 * s.stride;
      const x2 = xs[i] + Math.sin(a) * len;
      const y2 = base + Math.cos(a) * len;
      ctx.strokeStyle = i % 2 ? C.ink : '#2c2836';
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(xs[i], base);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  function hat(ctx, colors) {
    // knitted bobble hat sitting on the head
    ctx.save();
    ctx.translate(-2, -10);
    ctx.rotate(-0.35);
    ctx.beginPath();
    ctx.moveTo(-11, 2);
    ctx.quadraticCurveTo(-10, -16, 0, -17);
    ctx.quadraticCurveTo(10, -16, 11, 2);
    ctx.closePath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.ink;
    ctx.fillStyle = colors[0];
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = colors[1];
    ctx.fillRect(-12, -9, 24, 4);
    ctx.restore();
    ctx.beginPath();
    ctx.roundRect(-12.5, -1, 25, 6, 3);
    ctx.fillStyle = colors[1];
    ctx.fill();
    ctx.stroke();
    blob(ctx, [{ x: 0, y: -19, r: 4.5 }], colors[1], 1.6);
    ctx.restore();
  }

  function head(ctx, s, b) {
    const black = s.black;
    const faceCol = black ? C.blackFace : C.face;
    const hx = b.rx * 0.9 + 6;
    const hy = b.cy - b.ry * 0.45 - 3 + s.headDown * 22;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(0.45 + s.headDown * 0.55 + (s.headTilt || 0));
    // ears (back one first)
    const flop = Math.sin(s.t * 3 + s.seed) * 0.08 + (s.air ? -0.5 : 0);
    for (const e of [{ x: -8, y: -9, r: -0.9 + flop }, { x: -3, y: -11, r: -0.5 + flop }]) {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.r);
      blob(ctx, [{ x: -6, y: 0, rx: 9, ry: 4 }], faceCol, 2.5);
      ctx.fillStyle = C.earPink;
      ctx.beginPath();
      ctx.ellipse(-6, 0, 5.5, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    blob(ctx, [{ x: 0, y: 0, rx: 15, ry: 11 }], faceCol);
    // blush
    if (s.happy > 0.4 || s.shy) {
      ctx.globalAlpha = s.shy ? 0.9 : 0.6;
      ctx.fillStyle = C.pink;
      ctx.beginPath();
      ctx.ellipse(1, 5, 3.5, 2.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // eye
    ctx.lineCap = 'round';
    if (s.sleep) {
      ctx.strokeStyle = C.white;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(3, -4, 3.5, 0.2, Math.PI - 0.2);
      ctx.stroke();
    } else if (s.blink) {
      ctx.strokeStyle = C.white;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-0.5, -4);
      ctx.lineTo(6.5, -4);
      ctx.stroke();
    } else if (s.joy) {
      ctx.strokeStyle = C.white;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(3, -2, 3.5, Math.PI + 0.3, -0.3);
      ctx.stroke();
    } else {
      const big = s.shock ? 5.6 : 4.4;
      ctx.fillStyle = C.white;
      ctx.beginPath();
      ctx.arc(3, -4, big, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = C.ink;
      ctx.stroke();
      ctx.fillStyle = C.ink;
      ctx.beginPath();
      const look = s.look || 0;
      ctx.arc(4 + look * 1.2, -3.6, s.shock ? 1.5 : 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.white;
      ctx.beginPath();
      ctx.arc(4.8 + look, -4.6, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    // nostril + mouth
    ctx.fillStyle = black ? '#5a5363' : '#17151d';
    ctx.beginPath();
    ctx.arc(12.5, 0, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = black ? '#6b6375' : '#15131a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const chew = s.chew ? Math.abs(Math.sin(s.t * 16)) * 2.5 : 0;
    ctx.moveTo(8, 6);
    ctx.quadraticCurveTo(10.5, 7.5 + chew, 13, 5.5);
    ctx.stroke();
    // grass sprig while grazing/eating
    if (s.chew) {
      ctx.strokeStyle = s.eatingHay ? C.hayDark : C.grassTip;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(12, 7);
      ctx.lineTo(17 + chew, 11);
      ctx.moveTo(11, 7);
      ctx.lineTo(13 + chew, 13);
      ctx.stroke();
    }
    // wool tuft on top of the head
    if (s.wool > 0.12) {
      const t = 3.5 + s.wool * 2.5;
      blob(ctx, [{ x: -7, y: -10, r: t }, { x: -2, y: -12, r: t }, { x: -11, y: -5, r: t * 0.9 }],
        black ? C.blackWool : C.wool, 2.5);
    }
    if (s.hat) hat(ctx, s.hat);
    // sweat drop when shocked
    if (s.shock) {
      ctx.fillStyle = '#8fd3ff';
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-10, -18);
      ctx.quadraticCurveTo(-5, -11, -10, -9);
      ctx.quadraticCurveTo(-15, -11, -10, -18);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function parachute(ctx, s, cy) {
    ctx.save();
    ctx.rotate(Math.sin(s.t * 2.2) * 0.12);
    const top = cy - 92;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const x of [-34, -12, 12, 34]) {
      ctx.moveTo(x * 1.3, top + 6);
      ctx.lineTo(x * 0.4, cy - 8);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-46, top + 8);
    ctx.bezierCurveTo(-44, top - 40, 44, top - 40, 46, top + 8);
    ctx.quadraticCurveTo(34, top, 23, top + 8);
    ctx.quadraticCurveTo(12, top, 0, top + 8);
    ctx.quadraticCurveTo(-12, top, -23, top + 8);
    ctx.quadraticCurveTo(-34, top, -46, top + 8);
    ctx.closePath();
    ctx.fillStyle = C.white;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = C.red;
    for (const x of [-46, -10]) ctx.fillRect(x, top - 40, 18, 60);
    ctx.fillRect(28, top - 40, 18, 60);
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  // s: {x, y, dir, scale, wool, seed, phase, stride, headDown, squash, tilt, air, t, ...flags}
  function sheep(ctx, s) {
    ctx.save();
    ctx.translate(s.x, s.y);
    if (s.tilt) ctx.rotate(s.tilt);
    const sq = s.squash || 1;
    ctx.scale(s.dir * s.scale / Math.sqrt(sq), s.scale * sq);
    const b = bodyShapes(s);
    if (s.chute) parachute(ctx, s, b.cy);
    legs(ctx, s, b.cy);
    const shorn = s.wool < 0.12;
    if (shorn) {
      const shapes = [{ x: 0, y: b.cy + 2, rx: 25, ry: 14 }, { x: -27, y: b.cy - 2, r: 4 }];
      blob(ctx, shapes, C.skin);
      ctx.fillStyle = C.skinShade;
      for (let i = 0; i < 9; i++) {
        ctx.beginPath();
        ctx.arc(-18 + i * 4.5, b.cy - 2 + hash(s.seed + i) * 10, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const woolCol = s.black ? C.blackWool : C.wool;
      blob(ctx, b.shapes, woolCol);
      // halftone shading on the belly
      ctx.save();
      ctx.beginPath();
      for (const p of b.shapes) {
        ctx.moveTo(p.x + (p.rx || p.r), p.y);
        ctx.ellipse(p.x, p.y, p.rx || p.r, p.ry || p.r, 0, 0, Math.PI * 2);
      }
      ctx.clip();
      ctx.fillStyle = halftone(ctx, s.black ? C.blackShade : C.woolShade);
      ctx.fillRect(-b.rx - b.pr * 2, b.cy + b.ry * 0.1, (b.rx + b.pr * 2) * 2, b.ry + b.pr * 2);
      // little curl marks
      ctx.strokeStyle = s.black ? C.blackShade : C.woolShade;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const x = -b.rx * 0.6 + i * b.rx * 0.38;
        const y = b.cy - b.ry * 0.35 + hash(s.seed * 3 + i) * 6;
        ctx.beginPath();
        ctx.arc(x, y, 3.2, Math.PI * 0.9, Math.PI * 2.1);
        ctx.stroke();
      }
      ctx.restore();
    }
    head(ctx, s, b);
    ctx.restore();
  }

  function shadow(ctx, x, ground, scale, height) {
    const k = Math.max(0.35, 1 - height / 400);
    ctx.fillStyle = 'rgba(29,27,38,0.16)';
    ctx.beginPath();
    ctx.ellipse(x, ground + 1, 34 * scale * k, 5 * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function hayBale(ctx, x, y, amount, t) {
    const a = Math.max(0.35, amount);
    const w = 58 * (0.6 + 0.4 * a);
    const h = 34 * (0.5 + 0.5 * a);
    ctx.save();
    ctx.translate(x, y);
    // straw sticking out
    ctx.strokeStyle = C.hayDark;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const sx = -w / 2 + 5 + i * (w - 10) / 6;
      ctx.moveTo(sx, -h + 2);
      ctx.lineTo(sx + (hash(i) - 0.5) * 10, -h - 5 - hash(i + 9) * 5);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h, w, h, 6);
    ctx.fillStyle = C.hay;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = halftone(ctx, C.hayDark);
    ctx.fillRect(-w / 2, -h * 0.45, w, h);
    ctx.strokeStyle = C.hayDark;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h + 5 + i * 5);
      ctx.lineTo(w / 2, -h + 3 + i * 5 + hash(i + 3) * 3);
      ctx.stroke();
    }
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    ctx.strokeStyle = C.twine;
    ctx.lineWidth = 3;
    for (const tx of [-w * 0.22, w * 0.22]) {
      ctx.beginPath();
      ctx.moveTo(tx, -h + 1.5);
      ctx.lineTo(tx, -1.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function pen(ctx, x0, x1, ground, label) {
    const postH = 40;
    const n = Math.max(2, Math.round((x1 - x0) / 46));
    const step = (x1 - x0) / n;
    ctx.save();
    ctx.lineJoin = 'round';
    // rails
    for (const ry of [ground - 31, ground - 15]) {
      ctx.beginPath();
      ctx.roundRect(x0 - 4, ry - 5, x1 - x0 + 8, 10, 3);
      ctx.fillStyle = C.wood;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = C.ink;
      ctx.stroke();
      ctx.strokeStyle = C.woodDark;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x0 + 6, ry + 1);
      ctx.lineTo(x1 - 10, ry + 1);
      ctx.stroke();
    }
    for (let i = 0; i <= n; i++) {
      const px = x0 + i * step;
      const h = i === 0 || i === n ? postH + 6 : postH;
      ctx.beginPath();
      ctx.moveTo(px - 6, ground);
      ctx.lineTo(px - 6, ground - h + 4);
      ctx.lineTo(px, ground - h - 3);
      ctx.lineTo(px + 6, ground - h + 4);
      ctx.lineTo(px + 6, ground);
      ctx.closePath();
      ctx.fillStyle = C.wood;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = C.ink;
      ctx.stroke();
    }
    // sign
    if (label) {
      const sx = x0 + step * 0.5 + 8;
      const sy = ground - postH - 40;
      ctx.font = '22px Bangers, Impact, sans-serif';
      const tw = ctx.measureText(label).width;
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx + tw / 2 + 12, sy + 28);
      ctx.lineTo(sx + tw / 2 + 12, ground - postH + 2);
      ctx.stroke();
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(-0.04);
      ctx.beginPath();
      ctx.roundRect(0, 0, tw + 24, 32, 4);
      ctx.fillStyle = '#f7e7c6';
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = C.ink;
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 12, 17);
      ctx.restore();
    }
    ctx.restore();
  }

  function dog(ctx, x, y, dir, t, barking) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    ctx.rotate(Math.sin(t * 9) * 0.06);
    // floppy ears
    blob(ctx, [{ x: -16, y: -6, rx: 7, ry: 13, rot: 0.5 }], C.ink, 2);
    // head
    blob(ctx, [{ x: 0, y: 0, rx: 19, ry: 17 }, { x: 15, y: 6, rx: 12, ry: 9 }], '#26232e');
    // white blaze + muzzle
    ctx.fillStyle = C.white;
    ctx.beginPath();
    ctx.moveTo(2, -17);
    ctx.quadraticCurveTo(8, -2, 6, 4);
    ctx.quadraticCurveTo(14, 15, 26, 8);
    ctx.quadraticCurveTo(22, 0, 12, 0);
    ctx.quadraticCurveTo(9, -8, 6, -17);
    ctx.closePath();
    ctx.fill();
    blob(ctx, [{ x: 4, y: -18, rx: 6, ry: 9, rot: 0.6 }], C.ink, 2);
    // nose
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.ellipse(26, 4, 4.5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // eye
    ctx.fillStyle = C.white;
    ctx.beginPath();
    ctx.arc(9, -5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.arc(10.5, -4.5, 2.2, 0, Math.PI * 2);
    ctx.fill();
    // tongue / open mouth
    if (barking) {
      blob(ctx, [{ x: 18, y: 15, rx: 8, ry: 5 }], '#b8324a', 1.5);
    } else {
      blob(ctx, [{ x: 17, y: 16, rx: 4, ry: 6 }], C.pink, 1.5);
    }
    ctx.restore();
  }

  function starPath(ctx, r, spikes, jag) {
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const rr = i % 2 ? r * (0.62 + hash(i) * jag) : r;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.75);
    }
    ctx.closePath();
  }

  // life: 0..1 progress
  function burst(ctx, x, y, text, color, life, size = 1) {
    const pop = life < 0.18 ? (life / 0.18) * 1.15 : life < 0.28 ? 1.15 - (life - 0.18) * 1.5 : 1;
    const alpha = life > 0.8 ? (1 - life) / 0.2 : 1;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(x, y);
    ctx.rotate(-0.12);
    ctx.scale(pop * size, pop * size);
    ctx.font = '30px Bangers, Impact, sans-serif';
    const tw = ctx.measureText(text).width;
    const r = Math.max(46, tw * 0.75 + 14);
    starPath(ctx, r, 11, 0.12);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = C.white;
    ctx.strokeText(text, 0, 2);
    ctx.fillStyle = C.ink;
    ctx.fillText(text, 0, 2);
    ctx.restore();
  }

  // Speech bubble anchored with its tail at (x, y). Returns nothing.
  function bubble(ctx, x, y, text, opts = {}) {
    const W = ctx.canvas.width / (opts.dpr || 1);
    ctx.save();
    ctx.font = (opts.size || 19) + 'px Bangers, Impact, sans-serif';
    const tw = ctx.measureText(text).width;
    const bw = tw + 26;
    const bh = (opts.size || 19) + 18;
    let bx = x - bw / 2 + (opts.offset || 0);
    bx = Math.min(Math.max(bx, 8), W - bw - 8);
    const by = y - bh - 14;
    ctx.globalAlpha = opts.alpha == null ? 1 : opts.alpha;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.ink;
    ctx.fillStyle = opts.fill || C.white;
    if (opts.thought) {
      ctx.beginPath();
      ctx.ellipse(bx + bw / 2, by + bh / 2, bw / 2 + 4, bh / 2 + 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (const [dx, dy, r] of [[-4, 8, 5], [-8, 16, 3]]) {
        ctx.beginPath();
        ctx.arc(x + dx, by + bh + dy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 12);
      ctx.fill();
      ctx.stroke();
      // tail
      const tx = Math.min(Math.max(x, bx + 14), bx + bw - 14);
      ctx.beginPath();
      ctx.moveTo(tx - 8, by + bh - 1.5);
      ctx.lineTo(x + 2, y - 2);
      ctx.lineTo(tx + 6, by + bh - 1.5);
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(tx - 6.5, by + bh - 4, 11, 3.5);
    }
    ctx.fillStyle = C.ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + 13, by + bh / 2 + 1);
    ctx.restore();
  }

  function heart(ctx, x, y, s, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.bezierCurveTo(-12, -2, -6, -12, 0, -5);
    ctx.bezierCurveTo(6, -12, 12, -2, 0, 6);
    ctx.fillStyle = C.pink;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    ctx.restore();
  }

  function shears(ctx, x, y, open) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.6);
    const o = open ? 0.28 : 0.06;
    for (const sgn of [1, -1]) {
      ctx.save();
      ctx.rotate(sgn * o);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(30, sgn * -3);
      ctx.lineTo(34, 0);
      ctx.lineTo(0, sgn * 4);
      ctx.closePath();
      ctx.fillStyle = '#dfe6ee';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = C.ink;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(-11, sgn * 6, 8, 5.5, 0, 0, Math.PI * 2);
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = C.ink;
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = C.red;
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  window.Art = { C, sheep, shadow, hayBale, pen, dog, burst, bubble, heart, shears, hat, blob, halftone, hash };
})();
