(function () {
  const A = window.Art;
  const SND = window.Sound;
  const params = new URLSearchParams(location.search);
  // the desktop app exposes flockHost; ?preview runs the self-contained browser version
  const host = params.has('preview') ? null : window.flockHost || null;
  const PREVIEW = !host || params.has('preview');
  const DEMO = params.has('demo');
  const BARE = params.get('bg') === 'none'; // preview without the meadow
  if (params.get('theme')) document.documentElement.dataset.theme = params.get('theme');

  const cv = document.getElementById('stage');
  const ctx = cv.getContext('2d');
  const toolbox = document.getElementById('toolbox');

  // ---------- tuning ----------
  const GRAV = 2300;
  const NEEDS = PREVIEW && !DEMO ? 8 : 1; // the browser preview ages faster so changes are visible
  const HUNGER_TIME = 25 * 60; // seconds from full to starving
  const WOOL_TIME = 30 * 60; // seconds from shorn to fully woolly
  const HAT_COST = 5;
  const MAX_HAY = 5;
  const RATES = PREVIEW && !DEMO
    ? { often: [8, 16], sometimes: [15, 35], rarely: [40, 80] }
    : { often: [40, 90], sometimes: [180, 480], rarely: [720, 1800] };

  const LINES = {
    greet: ['Hi Nicky!', 'Baa!', 'Is this a desktop?', 'I live here now.', 'Nice icons.', 'Where is the grass?', 'Hello hello!', 'Did someone say snacks?', 'Hi Nicky! Baa!'],
    idle: ['Baa.', 'MEH.', 'Baaa?', 'I like it here.', 'Nicky!!', 'Ewe looking at me?', 'Hmm.', 'Baa baa.', 'Cloud mode.', 'So many windows.'],
    hungry: ['Snack?', 'Hay, please?', 'So hungry...', 'Feed me, Nicky!', 'Tummy says baa.'],
    eat: ['Mmm, hay!', 'Nom.', 'Crunchy!', 'Best hay ever.'],
    pet: ['Hehe.', 'More!', 'Baa :)', 'Ooh, scritches.', 'Again!', 'Happy sheep.'],
    thrown: ['WHEEE!', 'Aaaaa!', 'I CAN FLY!', 'Baaaaa!'],
    land: ['Oof.', 'Ow.', 'Stuck it.', '10/10.'],
    shorn: ["Don't look!!", 'Chilly!', 'Hey!!', 'I feel naked.'],
    notYet: ['Not yet!', 'Still growing!', 'No thank you.'],
    flee: ['BAA!', 'Eek!', 'Run!', 'Doggo!'],
    penned: ['Safe!', 'Cozy.', 'Nice pen.'],
    leave: ['Bye, Nicky!', 'Off to find grass.', 'Too hungry. Bye!'],
    hat: ['Fancy!', 'Toasty!', 'I look great.'],
    back: ['Welcome back, Nicky!', "You're back!", 'Nicky! We missed you.'],
    full: ['The flock is full!'],
  };
  const NAMES = ['Wooliam', 'Baabara', 'Lambert', 'Fleecy', 'Ewenice', 'Woolma', 'Mutton', 'Cotton', 'Meringue', 'Baartholomew',
    'Ramona', 'Ewan', 'Dolly', 'Cumulus', 'Pom Pom', 'Sir Fluffs', 'Biscuit', 'Marshmallow', 'Noodle', 'Baaxter',
    'Tofu', 'Pebble', 'Mabel', 'Gus', 'Clementine', 'Waffles', 'Nimbus', 'Doris', 'Kevin', 'Truffle'];
  const HATS = [['#ff5a5f', '#fff4e0'], ['#3aa0ff', '#ffd23f'], ['#5cb83a', '#ffffff'], ['#a46bff', '#ffd23f'], ['#ff9f1c', '#2b2731']];

  // ---------- helpers ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- state ----------
  let W = 0, H = 0, DPR = 1, GROUND = 0;
  const pen = { x0: 22, x1: 230 };
  const G = {
    time: 0,
    sheep: [],
    hay: [],
    fx: [],
    wool: 0,
    stats: { arrived: 0, fed: 0, sheared: 0, hats: 0 },
    settings: { spawn: 'sometimes', maxFlock: 12, toolbox: true, sound: true },
    nextSpawn: 0,
    drag: null,
    hover: null,
    ptr: { x: -9999, y: -9999, vx: 0, vy: 0, t: 0 },
    dog: { active: false, until: 0, x: 0, y: 0, dir: 1, barkT: 1, barking: 0 },
    capture: false,
    lastBaa: -10,
    lastMunch: -10,
    dirty: true,
  };
  let uid = 0;

  function resize() {
    DPR = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    GROUND = PREVIEW ? Math.round(H - clamp(H * 0.12, 60, 120)) : H - 6;
    pen.x0 = 22;
    pen.x1 = 22 + clamp(W * 0.16, 150, 240);
    for (const s of G.sheep) {
      if (!s.air) s.y = GROUND;
      s.x = clamp(s.x, 30, W - 30);
    }
    for (const h of G.hay) { h.y = Math.min(h.y, GROUND); h.x = clamp(h.x, 30, W - 30); }
  }

  // ---------- sheep ----------
  function pickName() {
    const used = new Set(G.sheep.map((s) => s.name));
    const free = NAMES.filter((n) => !used.has(n));
    if (free.length) return pick(free);
    let n = 2, base = pick(NAMES);
    while (used.has(base + ' ' + 'I'.repeat(n))) n++;
    return base + ' ' + 'I'.repeat(n);
  }

  function makeSheep(o = {}) {
    return Object.assign({
      id: ++uid,
      name: pickName(),
      x: W / 2, y: GROUND, vx: 0, vy: 0,
      dir: Math.random() < 0.5 ? -1 : 1,
      scale: rand(0.84, 1.06),
      wool: rand(0.55, 1),
      hunger: rand(0.1, 0.35),
      happy: 0.3,
      black: Math.random() < 0.12,
      seed: Math.random() * 100,
      phase: 0, stride: 0, headDown: 0, squash: 1, tilt: 0, look: 0,
      air: false, t: Math.random() * 10,
      state: 'idle', timer: rand(1, 3), target: null, speed: rand(42, 62),
      chute: false, penned: false, bubble: null,
      blinkT: rand(1, 4), blink: false, hat: null,
      shockUntil: 0, shyUntil: 0, joyUntil: 0, hopAt: 0,
      hungryFor: 0, fled: false, hayRef: null,
      born: Date.now(),
    }, o);
  }

  function say(s, text, dur = 2.8, thought = false) {
    s.bubble = { text, until: G.time + dur, thought, born: G.time };
  }

  function baa(pitch, len) {
    if (G.time - G.lastBaa < 1.2) return;
    G.lastBaa = G.time;
    SND.baa(pitch, len);
  }

  function fx(o) { G.fx.push(Object.assign({ age: 0, max: 1 }, o)); }
  function burst(x, y, text, color = A.C.pop, size = 1) {
    fx({ type: 'burst', x, y, text, color, size, max: 1.1 });
  }

  function wanderRange(s) {
    return s.penned ? [pen.x0 + 30, pen.x1 - 30] : [pen.x1 + 40, W - 40];
  }

  function spawn(kind) {
    if (G.sheep.length >= G.settings.maxFlock) return null;
    kind = kind || (Math.random() < 0.45 ? 'chute' : Math.random() < 0.6 ? 'walk' : 'pop');
    const [lo, hi] = [pen.x1 + 80, W - 80];
    const s = makeSheep();
    if (kind === 'chute') {
      s.x = rand(lo, hi);
      s.y = -30;
      s.vy = 60;
      s.chute = true;
      s.air = true;
      s.state = 'idle';
    } else if (kind === 'walk') {
      s.x = W + 50;
      s.dir = -1;
      s.state = 'enter';
      s.target = clamp(W - rand(120, 360), lo, hi);
    } else {
      s.x = rand(lo, hi);
      s.y = GROUND;
      s.squash = 0.4;
      burst(s.x, GROUND - 50, 'POP!', A.C.pop);
      for (let i = 0; i < 10; i++) fx({ type: 'dust', x: s.x + rand(-30, 30), y: GROUND - rand(10, 60), vx: rand(-80, 80), vy: rand(-80, 10), r: rand(10, 20), max: rand(0.5, 0.9) });
      SND.pop();
    }
    G.sheep.push(s);
    G.stats.arrived++;
    setTimeout(() => {
      if (G.sheep.includes(s)) { say(s, G.stats.arrived === 1 ? 'Hi Nicky!' : pick(LINES.greet), 3.2); baa(rand(0.9, 1.15), 1); }
    }, kind === 'chute' ? 1800 : kind === 'walk' ? 2200 : 300);
    G.dirty = true;
    return s;
  }

  function scheduleSpawn() {
    const [a, b] = RATES[G.settings.spawn] || RATES.sometimes;
    G.nextSpawn = G.time + rand(a, b);
  }

  function nearestHay(s) {
    let best = null, bd = Infinity;
    for (const h of G.hay) {
      if (h.air || h.amount <= 0) continue;
      const inPen = h.x < pen.x1 - 10;
      if (s.penned && !inPen) continue;
      const d = Math.abs(h.x - s.x);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  function decide(s) {
    s.headDown = s.headDown; // keep current, eased in update
    if (s.hunger > 0.35) {
      const h = nearestHay(s);
      if (h) { s.state = 'seek'; s.hayRef = h; return; }
      if (s.hunger > 0.7 && Math.random() < 0.5) say(s, pick(LINES.hungry), 3, true);
    }
    const [lo, hi] = wanderRange(s);
    const r = Math.random();
    if (r < 0.36) {
      s.state = 'walk';
      s.target = clamp(s.x + rand(-280, 280), lo, hi);
    } else if (r < 0.66) {
      s.state = 'graze';
      s.timer = rand(3, 8);
    } else if (r < 0.8) {
      s.state = 'idle';
      s.timer = rand(2, 5);
      if (Math.random() < 0.3) say(s, pick(LINES.idle));
    } else if (r < 0.87) {
      s.state = 'sleep';
      s.timer = rand(18, 45);
    } else if (r < 0.92) {
      s.state = 'idle';
      s.timer = rand(1, 2);
      s.vy = -300; s.y = GROUND - 1; s.air = true;
      s.joyUntil = G.time + 1;
    } else {
      s.state = 'idle';
      s.timer = rand(2, 4);
      say(s, pick(LINES.idle));
      if (Math.random() < 0.35) baa(rand(0.85, 1.2), rand(0.8, 1.2));
    }
  }

  function land(s) {
    const impact = s.vy;
    s.y = GROUND;
    if (s.chute) {
      s.chute = false;
      burst(s.x, GROUND - 60, 'PLOP!', A.C.pop, 0.7);
      SND.pop();
    } else if (impact > 950) {
      s.vy = -impact * 0.3;
      s.y = GROUND - 1;
      s.vx *= 0.6;
      s.squash = 0.62;
      burst(s.x, GROUND - 40, 'THUD!', A.C.pop, 0.85);
      SND.thud();
      dust(s.x, 8);
      s.shockUntil = G.time + 1.3;
      say(s, pick(LINES.land), 2.2);
      return;
    } else if (impact > 350) {
      s.squash = 0.78;
      dust(s.x, 4);
    }
    s.vy = 0;
    s.air = false;
    s.vx *= 0.35;
    if (s.state === 'carried') s.state = 'idle';
    s.timer = Math.min(s.timer, rand(0.6, 1.5));
  }

  function dust(x, n) {
    for (let i = 0; i < n; i++) fx({ type: 'dust', x: x + rand(-25, 25), y: GROUND - 4, vx: rand(-120, 120), vy: rand(-60, -10), r: rand(6, 12), max: rand(0.4, 0.7) });
  }

  function updateSheep(s, dt) {
    s.t += dt;
    s.hunger = Math.min(1, s.hunger + (dt / HUNGER_TIME) * NEEDS);
    s.wool = Math.min(1, s.wool + (dt / WOOL_TIME) * NEEDS * (s.hunger < 0.5 ? 1.4 : 0.6));
    s.happy = Math.max(0, s.happy - dt * 0.01);
    s.blinkT -= dt;
    if (s.blinkT < 0) { s.blink = true; if (s.blinkT < -0.13) { s.blink = false; s.blinkT = rand(2, 5); } }
    s.shock = G.time < s.shockUntil;
    s.shy = G.time < s.shyUntil;
    s.joy = G.time < s.joyUntil;
    if (s.bubble && G.time > s.bubble.until) s.bubble = null;
    s.chew = false;
    s.eatingHay = false;
    s.sleep = false;
    s.squash += (1 - s.squash) * Math.min(1, dt * 9);

    if (s.state === 'carried') {
      s.air = true;
      s.stride = 0;
      s.headDown += (0 - s.headDown) * Math.min(1, dt * 10);
      s.tilt += (clamp(G.ptr.vx * 0.0007, -0.6, 0.6) - s.tilt) * Math.min(1, dt * 10);
      return;
    }

    // airborne
    if (s.air || s.y < GROUND - 0.5) {
      s.air = true;
      s.vy += GRAV * dt * (s.chute ? 0.15 : 1);
      if (s.chute) {
        s.vy = Math.min(s.vy, 72);
        s.vx += Math.sin(s.t * 1.3) * 22 * dt;
        s.vx *= 1 - 1.5 * dt;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const enteringFromLeft = s.x < 0 && s.vx > 0;
      if (!enteringFromLeft && s.x < 30) { s.x = 30; s.vx = Math.abs(s.vx) * 0.5; }
      if (s.x > W - 30 && s.state !== 'enter') { s.x = W - 30; s.vx = -Math.abs(s.vx) * 0.5; }
      if (s.y < 80 && s.vy < 0 && !s.chute) { s.y = 80; s.vy = Math.abs(s.vy) * 0.25; }
      s.tilt = s.chute ? Math.sin(s.t * 2.2) * 0.1 : clamp(s.vx * 0.0005, -0.5, 0.5);
      s.stride = 0;
      if (s.y >= GROUND) land(s);
      return;
    }
    s.y = GROUND;
    s.tilt *= 1 - Math.min(1, dt * 10);
    if (Math.abs(s.vx) > 1) { s.x += s.vx * dt; s.vx *= 1 - Math.min(1, dt * 7); }

    // pen membership (only while on the ground)
    const inPen = s.x < pen.x1 - 8;
    if (inPen && !s.penned && s.state !== 'enter') {
      s.penned = true;
      burst(clamp(s.x, 70, W - 70), GROUND - 95, 'SAFE!', '#9be15d', 0.75);
      say(s, pick(LINES.penned), 2.2);
      baa(1.2, 0.6);
      G.dirty = true;
    } else if (!inPen && s.penned) {
      s.penned = false;
      G.dirty = true;
    }
    if (s.penned) s.x = clamp(s.x, pen.x0 + 28, pen.x1 - 24);

    // hunger can make a free sheep wander off
    s.hungryFor = s.hunger > 0.95 && !s.penned ? s.hungryFor + dt * NEEDS : 0;
    if (s.hungryFor > 300 && s.state !== 'leave' && s.state !== 'eat' && s.state !== 'seek') {
      s.state = 'leave';
      say(s, pick(LINES.leave), 3);
    }

    // the sheepdog
    const d = G.dog;
    const nearDog = d.active && Math.abs(d.x - s.x) < 230 && d.y > GROUND - 340 && s.state !== 'leave';
    if (nearDog) {
      if (s.state !== 'flee') {
        s.state = 'flee';
        s.fled = false;
      }
      s.dir = s.x >= d.x ? 1 : -1;
      const sp = 235 * s.scale;
      s.x += s.dir * sp * dt;
      if (!s.penned) s.x = clamp(s.x, pen.x0 + 28, W - 30);
      s.stride = 1.4;
      s.phase += dt * 16;
      s.headDown += (0 - s.headDown) * Math.min(1, dt * 10);
      s.shockUntil = G.time + 0.4;
      if (!s.fled) { s.fled = true; if (Math.random() < 0.6) say(s, pick(LINES.flee), 1.4); }
      return;
    } else if (s.state === 'flee') {
      s.state = 'idle';
      s.timer = rand(0.5, 1.5);
    }

    // startle when the cursor whips past
    const p = G.ptr;
    if (!G.drag && Math.hypot(p.vx, p.vy) > 2600 && Math.abs(p.x - s.x) < 70 && Math.abs(p.y - (s.y - 35)) < 60 && G.time - s.hopAt > 3) {
      s.hopAt = G.time;
      s.vy = -420; s.y = GROUND - 1; s.air = true;
      s.shockUntil = G.time + 1;
      say(s, '!', 1);
      return;
    }

    let moving = 0;
    let headTarget = 0;
    switch (s.state) {
      case 'enter':
      case 'walk':
      case 'seek': {
        let tx = s.target;
        if (s.state === 'seek') {
          const h = s.hayRef;
          if (!h || h.amount <= 0 || !G.hay.includes(h)) { s.state = 'idle'; s.timer = rand(0.5, 1.5); break; }
          if (s.penned && h.x >= pen.x1 - 10) { s.state = 'idle'; s.timer = 1; break; }
          const side = s.x < h.x ? -1 : 1;
          tx = h.x + side * 46 * s.scale;
        }
        const dx = tx - s.x;
        if (Math.abs(dx) < 3) {
          if (s.state === 'seek') {
            s.state = 'eat';
            s.dir = s.x < s.hayRef.x ? 1 : -1;
            if (Math.random() < 0.5) say(s, pick(LINES.eat), 2);
          } else {
            if (s.state === 'enter') say(s, pick(LINES.greet));
            s.state = 'idle';
            s.timer = rand(1.5, 4);
          }
          break;
        }
        s.dir = Math.sign(dx);
        const sp = (s.state === 'seek' ? 85 : s.speed) * s.scale;
        s.x += s.dir * Math.min(sp * dt, Math.abs(dx));
        moving = 1;
        break;
      }
      case 'eat': {
        const h = s.hayRef;
        if (!h || h.amount <= 0 || !G.hay.includes(h)) { s.state = 'idle'; s.timer = rand(1, 3); break; }
        headTarget = 1;
        s.chew = true;
        s.eatingHay = true;
        h.amount -= dt * 0.045;
        s.hunger = Math.max(0, s.hunger - dt * 0.12);
        if (G.time - G.lastMunch > 0.9) { G.lastMunch = G.time; SND.munch(); if (Math.random() < 0.35) fx({ type: 'word', x: s.x + s.dir * 50, y: s.y - 50, text: 'munch', max: 0.9 }); }
        if (Math.random() < dt * 3) fx({ type: 'straw', x: h.x + rand(-20, 20), y: h.y - 20, vx: rand(-60, 60), vy: rand(-120, -40), rot: rand(0, 6), max: 0.9 });
        if (s.hunger < 0.03) {
          s.state = 'idle';
          s.timer = rand(2, 4);
          s.happy = Math.min(1, s.happy + 0.3);
          G.stats.fed++;
          s.joyUntil = G.time + 1.2;
          if (Math.random() < 0.5) say(s, pick(LINES.eat));
        }
        break;
      }
      case 'graze':
        headTarget = 1;
        s.chew = true;
        s.timer -= dt;
        if (s.timer < 0) { s.state = 'idle'; s.timer = rand(1, 3); }
        break;
      case 'sleep':
        s.sleep = true;
        headTarget = 0.55;
        s.timer -= dt;
        if (Math.random() < dt * 0.8) fx({ type: 'z', x: s.x + s.dir * 30, y: s.y - 70, vx: s.dir * 12, vy: -26, max: 2.2 });
        if (s.timer < 0) { s.state = 'idle'; s.timer = rand(1, 3); }
        break;
      case 'leave': {
        s.dir = 1;
        s.x += 70 * s.scale * dt;
        moving = 1;
        if (s.x > W + 70) {
          G.sheep.splice(G.sheep.indexOf(s), 1);
          G.dirty = true;
        }
        break;
      }
      case 'shy':
        s.x += s.dir * 150 * dt;
        s.x = clamp(s.x, s.penned ? pen.x0 + 28 : pen.x1 + 30, s.penned ? pen.x1 - 24 : W - 30);
        moving = 1.3;
        s.timer -= dt;
        if (s.timer < 0) { s.state = 'idle'; s.timer = rand(2, 4); }
        break;
      default: // idle
        s.timer -= dt;
        s.look = Math.sin(s.t * 0.9 + s.seed) * 1.2;
        if (s.timer < 0) decide(s);
    }
    s.stride += ((moving ? 1 : 0) - s.stride) * Math.min(1, dt * 8);
    if (moving) s.phase += dt * 10 * moving;
    s.headDown += (headTarget - s.headDown) * Math.min(1, dt * 5);
    if (s.state !== 'enter' && s.state !== 'leave') s.x = clamp(s.x, 30, W - 30);
  }

  // ---------- hay ----------
  function addHay(x, y, vx = 0, vy = 0) {
    while (G.hay.length >= MAX_HAY) G.hay.shift();
    const h = { id: ++uid, x, y, vx, vy, amount: 1, air: true };
    G.hay.push(h);
    return h;
  }

  function updateHay(dt) {
    for (let i = G.hay.length - 1; i >= 0; i--) {
      const h = G.hay[i];
      if (G.drag && G.drag.hay === h) continue;
      if (h.air || h.y < GROUND) {
        h.vy += GRAV * dt;
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        if (h.x < 30 || h.x > W - 30) { h.x = clamp(h.x, 30, W - 30); h.vx *= -0.4; }
        if (h.y >= GROUND) {
          h.y = GROUND;
          if (h.vy > 500) { SND.thud(); dust(h.x, 4); }
          h.vy = 0; h.vx = 0; h.air = false;
          // every hungry sheep notices new hay
          for (const s of G.sheep) if (s.hunger > 0.35 && (s.state === 'idle' || s.state === 'graze' || s.state === 'walk')) { s.timer = 0; s.state = 'idle'; }
        }
      }
      if (h.amount <= 0) {
        for (let k = 0; k < 8; k++) fx({ type: 'straw', x: h.x + rand(-20, 20), y: h.y - 10, vx: rand(-90, 90), vy: rand(-160, -60), rot: rand(0, 6), max: 1 });
        G.hay.splice(i, 1);
      }
    }
  }

  // ---------- dog ----------
  function toggleDog(force) {
    const d = G.dog;
    const on = force == null ? !d.active : force;
    if (on && !d.active) {
      d.active = true;
      d.until = G.time + 25;
      d.x = G.ptr.x > -1000 ? G.ptr.x + 30 : W * 0.7;
      d.y = G.ptr.y > -1000 ? G.ptr.y + 34 : GROUND - 80;
      burst(d.x, d.y - 40, 'WOOF!', A.C.pop, 0.8);
      SND.woof();
    } else if (!on && d.active) {
      d.active = false;
      fx({ type: 'dust', x: d.x, y: d.y, vx: 0, vy: -20, r: 26, max: 0.5 });
    }
    syncToolbox();
  }

  function updateDog(dt) {
    const d = G.dog;
    if (!d.active) return;
    if (G.time > d.until) { toggleDog(false); return; }
    const tx = G.ptr.x + 30;
    const ty = G.ptr.y + 34;
    if (G.ptr.x > -1000) {
      const nx = d.x + (tx - d.x) * Math.min(1, dt * 12);
      if (Math.abs(nx - d.x) > 0.6) d.dir = nx > d.x ? 1 : -1;
      d.x = nx;
      d.y += (ty - d.y) * Math.min(1, dt * 12);
    }
    d.barking = Math.max(0, d.barking - dt);
    d.barkT -= dt;
    if (d.barkT < 0) {
      d.barkT = rand(2.5, 5);
      if (G.sheep.some((s) => Math.abs(s.x - d.x) < 260)) {
        d.barking = 0.35;
        SND.woof();
        fx({ type: 'word', x: d.x + d.dir * 30, y: d.y - 34, text: 'WOOF!', max: 0.8, big: true });
      }
    }
  }

  // ---------- fx ----------
  function updateFx(dt) {
    for (let i = G.fx.length - 1; i >= 0; i--) {
      const f = G.fx[i];
      f.age += dt;
      if (f.age > f.max) { G.fx.splice(i, 1); continue; }
      if (f.still) continue;
      if (f.vx != null) { f.x += f.vx * dt; f.y += f.vy * dt; }
      if (f.type === 'wool' || f.type === 'straw') { f.vy += 500 * dt; f.vx *= 1 - dt * 1.5; if (f.rot != null) f.rot += dt * 6; }
      if (f.type === 'dust') { f.vx *= 1 - dt * 3; f.vy *= 1 - dt * 3; }
    }
  }

  // ---------- interaction ----------
  function sheepBox(s) {
    const half = (30 + 13 * s.wool) * s.scale + 14;
    return { x0: s.x - half, x1: s.x + half, y0: s.y - (64 + 14 * s.wool) * s.scale, y1: s.y + 6 };
  }
  function hitSheep(x, y) {
    for (let i = G.sheep.length - 1; i >= 0; i--) {
      const s = G.sheep[i];
      if (s.state === 'leave' && s.x > W) continue;
      const b = sheepBox(s);
      if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return s;
    }
    return null;
  }
  function hitHay(x, y) {
    for (let i = G.hay.length - 1; i >= 0; i--) {
      const h = G.hay[i];
      if (Math.abs(x - h.x) < 34 && y > h.y - 44 && y < h.y + 6) return h;
    }
    return null;
  }

  let tbRect = null, tbRectAt = -1;
  function overToolbox(x, y) {
    if (toolbox.hidden) return false;
    if (G.time - tbRectAt > 0.25 || !tbRect) { tbRect = toolbox.getBoundingClientRect(); tbRectAt = G.time; }
    return x >= tbRect.left - 4 && x <= tbRect.right + 4 && y >= tbRect.top - 4 && y <= tbRect.bottom + 4;
  }

  function setPtr(x, y) {
    const p = G.ptr;
    const now = performance.now() / 1000;
    const dt = now - p.t;
    if (dt > 0.004 && p.x > -1000) {
      const k = Math.min(1, dt * 18);
      p.vx += ((x - p.x) / dt - p.vx) * k;
      p.vy += ((y - p.y) / dt - p.vy) * k;
    }
    p.x = x; p.y = y; p.t = now;
    if (G.drag) {
      const d = G.drag;
      d.hist.push({ x, y, t: now });
      while (d.hist.length > 2 && now - d.hist[0].t > 0.1) d.hist.shift();
      if (d.sheep) { d.sheep.x = clamp(x - d.ox, 20, W - 20); d.sheep.y = Math.min(GROUND, y - d.oy); }
      if (d.hay) { d.hay.x = clamp(x, 30, W - 30); d.hay.y = Math.min(GROUND, y + 18); }
    }
  }

  function releaseVelocity(d) {
    const h = d.hist;
    if (h.length < 2) return { vx: 0, vy: 0 };
    const a = h[0], b = h[h.length - 1];
    const dt = Math.max(0.016, b.t - a.t);
    return { vx: clamp((b.x - a.x) / dt, -2600, 2600), vy: clamp((b.y - a.y) / dt, -2600, 2600) };
  }

  function startDrag(kind, e, extra = {}) {
    const now = performance.now() / 1000;
    G.drag = Object.assign({ kind, sx: e.clientX, sy: e.clientY, st: now, hist: [{ x: e.clientX, y: e.clientY, t: now }], ox: 0, oy: 0 }, extra);
    setCapture(true);
  }

  function onPointerDown(e) {
    SND.unlock();
    setPtr(e.clientX, e.clientY);
    if (e.target.closest && e.target.closest('#toolbox')) return; // buttons handle themselves
    const s = hitSheep(e.clientX, e.clientY);
    if (s) {
      startDrag('sheep', e, { sheep: s, ox: e.clientX - s.x, oy: e.clientY - s.y, prevState: s.state });
      s.state = 'carried';
      s.chute = false;
      s.vx = s.vy = 0;
      e.preventDefault();
      return;
    }
    const h = hitHay(e.clientX, e.clientY);
    if (h) {
      startDrag('hay', e, { hay: h });
      h.air = true;
      e.preventDefault();
    }
  }

  function pet(s, wasAsleep) {
    s.happy = Math.min(1, s.happy + 0.35);
    s.joyUntil = G.time + 1.3;
    for (let i = 0; i < 3; i++) fx({ type: 'heart', x: s.x + rand(-20, 20), y: s.y - 70 * s.scale, vx: rand(-25, 25), vy: rand(-90, -60), max: 1.2 });
    if (wasAsleep) say(s, 'Huh? Oh, hi.');
    else if (Math.random() < 0.55) say(s, pick(LINES.pet), 2);
    baa(1.3, 0.55);
  }

  function shear(s) {
    if (s.wool < 0.35) { say(s, pick(LINES.notYet), 2); return; }
    const gained = Math.max(1, Math.round(s.wool * 3));
    G.wool += gained;
    G.stats.sheared++;
    for (let i = 0; i < 16; i++) fx({ type: 'wool', x: s.x + rand(-35, 35), y: s.y - rand(20, 55), vx: rand(-180, 180), vy: rand(-300, -80), r: rand(5, 10), max: rand(0.9, 1.5), black: s.black });
    s.wool = 0;
    s.shyUntil = G.time + 6;
    s.state = 'shy';
    s.timer = 1.1;
    s.dir = Math.random() < 0.5 ? -1 : 1;
    burst(s.x, s.y - 90, 'SNIP!', '#8fd3ff', 0.8);
    fx({ type: 'word', x: s.x, y: s.y - 120, text: '+' + gained + ' wool', max: 1.4, big: true });
    say(s, pick(LINES.shorn), 2.6);
    SND.snip();
    G.dirty = true;
    syncToolbox();
  }

  function giveHat(s) {
    if (s.hat) { say(s, 'I already have one!', 2); return; }
    if (G.wool < HAT_COST) return;
    G.wool -= HAT_COST;
    G.stats.hats++;
    s.hat = pick(HATS);
    s.joyUntil = G.time + 1.5;
    burst(s.x, s.y - 95, 'KNIT!', '#ffb3d1', 0.75);
    say(s, pick(LINES.hat));
    baa(1.25, 0.6);
    G.dirty = true;
    syncToolbox();
  }

  function onPointerMove(e) {
    setPtr(e.clientX, e.clientY);
  }

  function onPointerUp(e) {
    setPtr(e.clientX, e.clientY);
    const d = G.drag;
    if (!d) return;
    G.drag = null;
    const moved = Math.hypot(e.clientX - d.sx, e.clientY - d.sy);
    const held = performance.now() / 1000 - d.st;
    const v = releaseVelocity(d);
    if (d.kind === 'sheep') {
      const s = d.sheep;
      if (moved < 7 && held < 0.45) {
        s.state = d.prevState === 'carried' ? 'idle' : 'idle';
        s.timer = rand(1, 2);
        s.y = Math.min(s.y, GROUND);
        pet(s, d.prevState === 'sleep');
      } else {
        s.state = 'idle';
        s.timer = rand(1, 2);
        s.vx = v.vx;
        s.vy = v.vy;
        s.air = s.y < GROUND - 0.5 || v.vy < 0;
        if (Math.hypot(v.vx, v.vy) > 700) say(s, pick(LINES.thrown), 1.6);
      }
    } else if (d.kind === 'hay') {
      d.hay.vx = v.vx * 0.5;
      d.hay.vy = v.vy * 0.5;
      d.hay.air = true;
    } else if (d.kind === 'shears') {
      const s = hitSheep(e.clientX, e.clientY);
      if (s) shear(s);
    } else if (d.kind === 'hat') {
      const s = hitSheep(e.clientX, e.clientY);
      if (s) giveHat(s);
    }
    G.dirty = true;
  }

  // ---------- click-through (desktop app) ----------
  function setCapture(on) {
    if (!host || on === G.capture) return;
    G.capture = on;
    host.setCapture(on);
  }

  function updateCapture() {
    const p = G.ptr;
    let want = !!G.drag;
    let cursor = '';
    G.hover = null;
    if (!want && p.x > -1000) {
      if (overToolbox(p.x, p.y)) want = true;
      else {
        const s = hitSheep(p.x, p.y);
        G.hover = s;
        if (s || hitHay(p.x, p.y)) { want = true; cursor = 'grab'; }
      }
    }
    if (G.drag) {
      cursor = G.drag.kind === 'sheep' || G.drag.kind === 'hay' ? 'grabbing' : 'none';
      G.hover = null;
    }
    if (cv.style.cursor !== cursor) cv.style.cursor = cursor;
    setCapture(want);
  }

  // ---------- toolbox ----------
  const tb = {
    hay: document.getElementById('tool-hay'),
    shears: document.getElementById('tool-shears'),
    dog: document.getElementById('tool-dog'),
    hat: document.getElementById('tool-hat'),
    sheep: document.getElementById('stat-sheep'),
    pen: document.getElementById('stat-pen'),
    wool: document.getElementById('stat-wool'),
    fold: document.getElementById('tool-fold'),
  };

  function drawIcon(btn, fn) {
    const c = btn.querySelector('canvas');
    const r = window.devicePixelRatio || 1;
    c.width = 44 * r; c.height = 36 * r;
    const g = c.getContext('2d');
    g.scale(r, r);
    fn(g);
  }
  function paintIcons() {
    drawIcon(tb.hay, (g) => { g.translate(22, 31); g.scale(0.68, 0.68); A.hayBale(g, 0, 0, 0.85, 0); });
    drawIcon(tb.shears, (g) => { g.translate(17, 22); g.scale(0.85, 0.85); A.shears(g, 0, 0, true); });
    drawIcon(tb.dog, (g) => { g.translate(17, 19); g.scale(0.7, 0.7); A.dog(g, 0, 0, 1, 0, false); });
    drawIcon(tb.hat, (g) => { g.translate(24, 31); A.hat(g, HATS[0]); });
  }

  let lastStats = '';
  function syncToolbox() {
    const penned = G.sheep.filter((s) => s.penned).length;
    tb.sheep.textContent = G.sheep.length;
    tb.pen.textContent = penned;
    tb.wool.textContent = G.wool;
    tb.dog.classList.toggle('on', G.dog.active);
    tb.dog.setAttribute('aria-pressed', G.dog.active ? 'true' : 'false');
    tb.hat.disabled = G.wool < HAT_COST;
    tb.hat.querySelector('span').textContent = G.wool < HAT_COST ? HAT_COST + ' wool' : 'Hat';
    const st = G.sheep.length + '/' + penned + '/' + G.wool;
    if (host && st !== lastStats) { lastStats = st; host.stats({ sheep: G.sheep.length, penned, wool: G.wool }); }
  }

  function toolDown(kind) {
    return (e) => {
      SND.unlock();
      e.preventDefault();
      setPtr(e.clientX, e.clientY);
      if (kind === 'dog') { toggleDog(); return; }
      if (kind === 'hay') {
        const h = addHay(e.clientX, e.clientY + 18);
        startDrag('hay', e, { hay: h, fromTool: true });
      } else if (kind === 'shears') {
        startDrag('shears', e);
      } else if (kind === 'hat') {
        if (G.wool < HAT_COST) return;
        startDrag('hat', e);
      }
    };
  }
  tb.hay.addEventListener('pointerdown', toolDown('hay'));
  tb.shears.addEventListener('pointerdown', toolDown('shears'));
  tb.dog.addEventListener('pointerdown', toolDown('dog'));
  tb.hat.addEventListener('pointerdown', toolDown('hat'));
  tb.dog.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDog(); } });
  tb.hay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addHay(rand(pen.x1 + 80, W - 80), 60); }
  });
  tb.fold.addEventListener('click', () => {
    toolbox.classList.toggle('folded');
    tb.fold.setAttribute('aria-expanded', toolbox.classList.contains('folded') ? 'false' : 'true');
    tbRect = null;
  });

  // ---------- rendering ----------
  let bg = null;
  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    bg = {
      skyTop: cs.getPropertyValue('--sky-top').trim() || '#8fd3ff',
      skyBottom: cs.getPropertyValue('--sky-bottom').trim() || '#d9f3ff',
      hill: cs.getPropertyValue('--hill').trim() || '#9bd46e',
      hillFar: cs.getPropertyValue('--hill-far').trim() || '#bfe59a',
      grass: cs.getPropertyValue('--grass').trim() || '#6cc04a',
      grassDot: cs.getPropertyValue('--grass-dot').trim() || '#58a83a',
      sun: cs.getPropertyValue('--sun').trim() || '#ffd23f',
    };
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, bg.skyTop);
    g.addColorStop(1, bg.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // sun / moon
    ctx.beginPath();
    ctx.arc(W - 110, 110, 46, 0, Math.PI * 2);
    ctx.fillStyle = bg.sun;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = A.C.ink;
    ctx.stroke();
    // comic clouds
    for (const [cx, cy, s] of [[W * 0.22, 120, 1], [W * 0.6, 80, 0.8], [W * 0.82, 200, 0.6]]) {
      const x = ((cx + G.time * 6 * s) % (W + 200)) - 100;
      A.blob(ctx, [{ x, y: cy, r: 26 * s }, { x: x + 30 * s, y: cy - 12 * s, r: 30 * s }, { x: x + 62 * s, y: cy, r: 24 * s }, { x: x + 30 * s, y: cy + 8 * s, rx: 46 * s, ry: 16 * s }], '#ffffff', 3);
    }
    // hills
    ctx.lineWidth = 4;
    ctx.strokeStyle = A.C.ink;
    ctx.fillStyle = bg.hillFar;
    ctx.beginPath();
    ctx.moveTo(-10, GROUND - 60);
    ctx.bezierCurveTo(W * 0.25, GROUND - 190, W * 0.45, GROUND - 40, W * 0.65, GROUND - 120);
    ctx.bezierCurveTo(W * 0.8, GROUND - 180, W * 0.95, GROUND - 90, W + 10, GROUND - 110);
    ctx.lineTo(W + 10, GROUND);
    ctx.lineTo(-10, GROUND);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = bg.hill;
    ctx.beginPath();
    ctx.moveTo(-10, GROUND - 30);
    ctx.bezierCurveTo(W * 0.3, GROUND - 90, W * 0.6, GROUND - 10, W + 10, GROUND - 60);
    ctx.lineTo(W + 10, GROUND);
    ctx.lineTo(-10, GROUND);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // grass strip
    ctx.fillStyle = bg.grass;
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = A.halftone(ctx, bg.grassDot);
    ctx.fillRect(0, GROUND + 14, W, H - GROUND);
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    ctx.lineTo(W, GROUND);
    ctx.stroke();
  }

  function drawSheepWithShadow(s) {
    A.sheep(ctx, s);
  }

  function bubbleAnchor(s) {
    const hx = s.x + s.dir * (30 + 12 * s.wool) * s.scale;
    return { x: hx, y: s.y - (62 + 14 * s.wool) * s.scale - (s.chute ? 0 : 0) };
  }

  function drawLabel(s) {
    const a = bubbleAnchor(s);
    const hunger = s.hunger < 0.3 ? 'Full' : s.hunger < 0.6 ? 'Peckish' : s.hunger < 0.85 ? 'Hungry' : 'Starving!';
    const line2 = hunger + ' · wool ' + Math.round(s.wool * 100) + '%' + (s.penned ? ' · in the pen' : '');
    ctx.save();
    ctx.font = '20px Bangers, Impact, sans-serif';
    const w1 = ctx.measureText(s.name.toUpperCase()).width;
    ctx.font = '700 13px "Comic Neue", "Comic Sans MS", sans-serif';
    const w2 = ctx.measureText(line2).width;
    const bw = Math.max(w1, w2) + 24;
    const bh = 50;
    const bx = clamp(s.x - bw / 2, 8, W - bw - 8);
    const by = a.y - bh - 18;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 8);
    ctx.fillStyle = '#fff4c7';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = A.C.ink;
    ctx.stroke();
    ctx.fillStyle = A.C.ink;
    ctx.textBaseline = 'alphabetic';
    ctx.font = '20px Bangers, Impact, sans-serif';
    ctx.fillText(s.name.toUpperCase(), bx + 12, by + 22);
    ctx.font = '700 13px "Comic Neue", "Comic Sans MS", sans-serif';
    ctx.fillText(line2, bx + 12, by + 40);
    ctx.restore();
  }

  function drawFx(f) {
    const k = f.age / f.max;
    if (f.type === 'burst') A.burst(ctx, f.x, f.y, f.text, f.color, k, f.size);
    else if (f.type === 'heart') A.heart(ctx, f.x, f.y, 1 + k * 0.4, 1 - k);
    else if (f.type === 'wool') {
      ctx.globalAlpha = 1 - k * k;
      A.blob(ctx, [{ x: f.x, y: f.y, r: f.r }], f.black ? A.C.blackWool : A.C.wool, 2);
      ctx.globalAlpha = 1;
    } else if (f.type === 'straw') {
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.strokeStyle = A.C.hayDark;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(6, 0);
      ctx.stroke();
      ctx.restore();
    } else if (f.type === 'dust') {
      ctx.globalAlpha = (1 - k) * 0.85;
      A.blob(ctx, [{ x: f.x, y: f.y, r: f.r * (0.6 + k) }], '#f1ece2', 1.8);
      ctx.globalAlpha = 1;
    } else if (f.type === 'z') {
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.font = (16 + k * 10) + 'px Bangers, Impact, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = A.C.ink;
      ctx.strokeText('Z', f.x, f.y);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Z', f.x, f.y);
      ctx.restore();
    } else if (f.type === 'word') {
      ctx.save();
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.font = (f.big ? 24 : 16) + 'px Bangers, Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = A.C.ink;
      const y = f.y - k * 24;
      ctx.strokeText(f.text, f.x, y);
      ctx.fillStyle = f.big ? A.C.pop : '#ffffff';
      ctx.fillText(f.text, f.x, y);
      ctx.restore();
    }
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (PREVIEW && !BARE) drawBackground();

    const penned = [], free = [], flying = [];
    for (const s of G.sheep) {
      if (s.state === 'carried' || (s.air && s.y < GROUND - 60)) flying.push(s);
      else if (s.penned) penned.push(s);
      else free.push(s);
    }
    // shadows
    for (const s of G.sheep) A.shadow(ctx, s.x, GROUND, s.scale, GROUND - s.y);
    for (const h of G.hay) A.shadow(ctx, h.x, GROUND, 0.8, GROUND - h.y);
    // inside the pen (behind the fence)
    for (const h of G.hay) if (h.x < pen.x1 - 10 && !h.air) A.hayBale(ctx, h.x, h.y, h.amount, G.time);
    for (const s of penned) drawSheepWithShadow(s);
    A.pen(ctx, pen.x0, pen.x1, GROUND, "NICKY'S");
    for (const h of G.hay) if (h.x >= pen.x1 - 10 || h.air) A.hayBale(ctx, h.x, h.y, h.amount, G.time);
    free.sort((a, b) => a.scale - b.scale);
    for (const s of free) drawSheepWithShadow(s);
    for (const s of flying) drawSheepWithShadow(s);

    for (const f of G.fx) drawFx(f);

    // bubbles and the hover label
    for (const s of G.sheep) {
      if (G.hover === s && !G.drag) continue;
      if (!s.bubble) continue;
      const a = bubbleAnchor(s);
      const age = G.time - s.bubble.born;
      const left = s.bubble.until - G.time;
      A.bubble(ctx, a.x, a.y, s.bubble.text, { thought: s.bubble.thought, alpha: Math.min(1, age * 8, left * 4), dpr: DPR });
    }
    if (G.hover && !G.drag && G.sheep.includes(G.hover)) drawLabel(G.hover);

    // the dog
    if (G.dog.active) A.dog(ctx, G.dog.x, G.dog.y, G.dog.dir, G.time, G.dog.barking > 0);

    // dragged tools follow the pointer
    if (G.drag && G.drag.kind === 'shears') A.shears(ctx, G.ptr.x + 6, G.ptr.y + 4, Math.sin(G.time * 18) > 0);
    if (G.drag && G.drag.kind === 'hat') { ctx.save(); ctx.translate(G.ptr.x, G.ptr.y + 16); ctx.scale(1.3, 1.3); A.hat(ctx, HATS[0]); ctx.restore(); }
  }

  // ---------- persistence ----------
  function snapshot() {
    return {
      v: 1,
      savedAt: Date.now(),
      wool: G.wool,
      stats: G.stats,
      sheep: G.sheep.filter((s) => s.state !== 'leave').map((s) => ({
        name: s.name, x: Math.round(s.x), wool: +s.wool.toFixed(3), hunger: +s.hunger.toFixed(3), happy: +s.happy.toFixed(2),
        black: s.black, scale: +s.scale.toFixed(3), penned: s.penned, hat: s.hat, seed: +s.seed.toFixed(2), born: s.born,
      })),
      hay: G.hay.filter((h) => !h.air).map((h) => ({ x: Math.round(h.x), amount: +h.amount.toFixed(3) })),
    };
  }

  function save() {
    const data = snapshot();
    if (host) host.save(data);
    else { try { localStorage.setItem('nickys-flock', JSON.stringify(data)); } catch (e) { /* storage unavailable */ } }
  }

  function restore(data) {
    if (!data || !Array.isArray(data.sheep)) return false;
    const away = Math.max(0, (Date.now() - (data.savedAt || Date.now())) / 1000);
    G.wool = data.wool | 0;
    Object.assign(G.stats, data.stats || {});
    for (const d of data.sheep.slice(0, 40)) {
      const s = makeSheep({
        name: d.name, black: !!d.black, scale: d.scale || 1, seed: d.seed || Math.random() * 100,
        hat: d.hat || null, born: d.born || Date.now(), happy: d.happy || 0.3,
        wool: Math.min(1, (d.wool || 0) + away / WOOL_TIME),
        hunger: Math.min(Math.max(d.hunger || 0, 0.85), (d.hunger || 0) + away / HUNGER_TIME),
        x: d.x, penned: !!d.penned,
      });
      if (s.hunger > 0.85) s.hunger = Math.max(d.hunger || 0, 0.85);
      if (s.penned) s.x = clamp(s.x, pen.x0 + 28, pen.x1 - 24);
      else s.x = clamp(s.x, pen.x1 + 30, W - 30);
      G.sheep.push(s);
    }
    for (const h of (data.hay || []).slice(0, MAX_HAY)) G.hay.push({ id: ++uid, x: clamp(h.x, 30, W - 30), y: GROUND, vx: 0, vy: 0, amount: h.amount, air: false });
    if (G.sheep.length && away > 30 * 60) {
      setTimeout(() => { const s = pick(G.sheep); if (s) { say(s, pick(LINES.back), 3.5); baa(1.1, 1); } }, 1500);
    }
    return true;
  }

  // ---------- demo scenes (used for screenshots) ----------
  function freezeFx() { for (const fx0 of G.fx) { fx0.max = 99; fx0.age = 30; } }
  const SCENES = {
    desk(add, lo) {
      add({ x: pen.x0 + 60, penned: true, hat: HATS[1], dir: 1, wool: 0.9, name: 'Baabara', state: 'graze', timer: 99 });
      add({ x: pen.x1 - 55, penned: true, dir: -1, wool: 0.7, name: 'Lambert', state: 'sleep', timer: 99 });
      const h = addHay(lo + (W - lo) * 0.42, GROUND); h.air = false; h.amount = 0.85;
      add({ x: h.x - 46, dir: 1, hunger: 0.9, name: 'Wooliam', state: 'eat', hayRef: h });
      const k = add({ x: lo + (W - lo) * 0.16, dir: 1, black: true, name: 'Noodle', state: 'idle', timer: 99, happy: 0.8 });
      say(k, 'Hi Nicky!', 99);
      const n = add({ x: lo + (W - lo) * 0.66, y: GROUND - 300, chute: true, air: true, vy: 60, name: 'Nimbus', state: 'idle' });
      say(n, 'I live here now.', 99);
      add({ x: lo + (W - lo) * 0.84, dir: -1, name: 'Biscuit', state: 'walk', target: lo, timer: 99, stride: 1, phase: 2 });
    },
    herd(add, lo) {
      add({ x: pen.x0 + 70, penned: true, dir: 1, name: 'Baabara', state: 'graze', timer: 99 });
      add({ x: pen.x1 - 60, penned: true, dir: -1, name: 'Lambert', state: 'idle', timer: 99, happy: 0.9, joyUntil: 99 });
      const xs = [0.12, 0.24, 0.33, 0.45];
      const lines = ['Run!', null, 'Eek!', 'BAA!'];
      xs.forEach((f, i) => {
        const s = add({ x: lo + (W - lo) * f, dir: -1, name: ['Biscuit', 'Noodle', 'Pom Pom', 'Waffles'][i], black: i === 1, state: 'idle', timer: 99, shockUntil: 99, stride: 1.4, phase: i * 1.7 });
        if (lines[i]) say(s, lines[i], 99);
      });
      G.dog.active = true; G.dog.until = 999; G.dog.dir = -1; G.dog.barkT = 99; G.dog.barking = 99;
      G.dog.x = lo + (W - lo) * 0.6; G.dog.y = GROUND - 40;
      burst(G.dog.x + 10, G.dog.y - 70, 'WOOF!', A.C.pop, 0.85);
    },
    feed(add, lo) {
      const h1 = addHay(lo + (W - lo) * 0.25, GROUND); h1.air = false; h1.amount = 0.9;
      const h2 = addHay(lo + (W - lo) * 0.62, GROUND); h2.air = false; h2.amount = 0.6;
      add({ x: h1.x - 46, dir: 1, name: 'Wooliam', state: 'eat', hayRef: h1, hunger: 0.9 });
      add({ x: h1.x + 46, dir: -1, name: 'Ewenice', state: 'eat', hayRef: h1, hunger: 0.9, black: true });
      const m = add({ x: h2.x - 48, dir: 1, name: 'Marshmallow', state: 'eat', hayRef: h2, hunger: 0.9 });
      say(m, 'Best hay ever.', 99);
      const w = add({ x: lo + (W - lo) * 0.86, dir: -1, name: 'Truffle', state: 'idle', timer: 99, hunger: 0.9 });
      say(w, 'Hay, please?', 99, true);
      add({ x: lo + (W - lo) * 0.45, y: GROUND - 330, chute: true, air: true, vy: 60, name: 'Nimbus', state: 'idle' });
      burst(h1.x, GROUND - 120, 'MUNCH!', A.C.pop, 0.85);
      add({ x: pen.x0 + 80, penned: true, dir: 1, name: 'Lambert', state: 'sleep', timer: 99 });
    },
    shear(add, lo) {
      const s = add({ x: lo + (W - lo) * 0.3, dir: 1, wool: 0, name: 'Cumulus', state: 'idle', timer: 99, shyUntil: 99 });
      say(s, "Don't look!!", 99);
      burst(s.x + 20, GROUND - 150, 'SNIP!', '#8fd3ff', 0.85);
      for (let i = 0; i < 14; i++) fx({ type: 'wool', x: s.x + rand(-70, 70), y: GROUND - rand(50, 180), r: rand(6, 11), max: 99, age: 5, still: true });
      const h = add({ x: lo + (W - lo) * 0.58, dir: -1, name: 'Baabara', state: 'idle', timer: 99, hat: HATS[0], happy: 0.9, joyUntil: 99 });
      say(h, 'Fancy!', 99);
      add({ x: lo + (W - lo) * 0.74, dir: 1, name: 'Gus', state: 'graze', timer: 99, hat: HATS[1] });
      add({ x: lo + (W - lo) * 0.9, dir: -1, name: 'Doris', state: 'idle', timer: 99, hat: HATS[3], black: true });
      add({ x: pen.x0 + 70, penned: true, dir: 1, name: 'Lambert', state: 'graze', timer: 99, hat: HATS[2] });
      G.wool = 12;
      fx({ type: 'word', x: s.x, y: GROUND - 200, text: '+3 wool', max: 99, age: 10, big: true });
    },
  };

  function seedDemo() {
    const lo = pen.x1;
    const add = (o) => { const s = makeSheep(o); G.sheep.push(s); return s; };
    const scene = SCENES[params.get('demo')];
    if (scene) { scene(add, lo); freezeFx(); return; }
    add({ x: pen.x0 + 60, penned: true, hat: HATS[1], dir: 1, wool: 0.9, name: 'Baabara', state: 'graze', timer: 99 });
    add({ x: pen.x1 - 55, penned: true, dir: -1, wool: 0.7, name: 'Lambert', state: 'sleep', timer: 99 });
    const h = addHay(lo + (W - lo) * 0.3, GROUND); h.air = false; h.amount = 0.8;
    add({ x: h.x - 46, dir: 1, hunger: 0.9, name: 'Wooliam', state: 'eat', hayRef: h });
    const shy = add({ x: lo + (W - lo) * 0.12, dir: -1, wool: 0, name: 'Cumulus', state: 'idle', timer: 99, shyUntil: 99 });
    say(shy, "Don't look!!", 99);
    const k = add({ x: lo + (W - lo) * 0.52, dir: 1, black: true, name: 'Noodle', state: 'idle', timer: 99, happy: 0.8 });
    say(k, 'Hi Nicky!', 99);
    add({ x: lo + (W - lo) * 0.7, y: GROUND - 230, chute: true, air: true, vy: 60, name: 'Nimbus', state: 'idle' });
    const f = add({ x: W - 150, dir: -1, name: 'Biscuit', state: 'idle', timer: 99 });
    G.dog.active = true; G.dog.until = 999; G.dog.x = W - 60; G.dog.y = GROUND - 120; G.dog.dir = -1; G.dog.barkT = 99;
    G.ptr.x = W - 90; G.ptr.y = GROUND - 154;
    say(f, 'Doggo!', 99);
    G.wool = 7;
    burst(lo + (W - lo) * 0.36, GROUND - 150, 'MUNCH!', A.C.pop, 0.8);
    for (const fx0 of G.fx) { fx0.max = 99; fx0.age = 30; }
  }

  // ---------- main loop ----------
  let last = performance.now();
  let acc = 0;
  let saveT = 0;
  let statT = 0;
  const FRAME = PREVIEW ? 0 : 1 / 30;

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25; // after sleep or hidden window
    acc += dt;
    if (acc < FRAME) return;
    dt = Math.min(acc, 0.05);
    acc = 0;
    step(dt);
    render();
  }

  function step(dt) {
    G.time += dt;
    if (!DEMO && G.time > G.nextSpawn) {
      spawn();
      scheduleSpawn();
    }
    // the pointer slows down when it stops sending events
    G.ptr.vx *= 1 - Math.min(1, dt * 6);
    G.ptr.vy *= 1 - Math.min(1, dt * 6);
    updateDog(dt);
    for (let i = G.sheep.length - 1; i >= 0; i--) if (G.sheep[i]) updateSheep(G.sheep[i], dt);
    updateHay(dt);
    updateFx(dt);
    updateCapture();
    statT -= dt;
    if (statT < 0) { statT = 0.5; syncToolbox(); }
    saveT -= dt;
    if (saveT < 0 || (G.dirty && saveT < 8)) { saveT = 10; G.dirty = false; if (!DEMO) save(); }
  }

  function applySettings(s) {
    const prevRate = G.settings.spawn;
    Object.assign(G.settings, s || {});
    SND.enabled = G.settings.sound;
    toolbox.hidden = !G.settings.toolbox;
    tbRect = null;
    if (prevRate !== G.settings.spawn) scheduleSpawn();
    while (G.sheep.length > G.settings.maxFlock) {
      const free = G.sheep.filter((x) => !x.penned && x.state !== 'leave');
      if (!free.length) break;
      const s = pick(free);
      s.state = 'leave';
      say(s, pick(LINES.leave));
      break; // one at a time; the rest leave on later frames
    }
  }

  function command(cmd) {
    if (cmd === 'spawn') {
      if (!spawn()) { const s = pick(G.sheep); if (s) say(s, LINES.full[0], 2.5); }
    } else if (cmd === 'hay') {
      const free = G.sheep.filter((s) => !s.penned);
      const x = free.length ? free.reduce((a, s) => a + s.x, 0) / free.length + rand(-80, 80) : rand(pen.x1 + 80, W - 80);
      addHay(clamp(x, pen.x1 + 40, W - 40), 40, 0, 0);
    } else if (cmd === 'dog') {
      toggleDog();
    } else if (cmd === 'save') {
      save();
    }
  }

  async function boot() {
    resize();
    readTheme();
    window.addEventListener('resize', () => { resize(); tbRect = null; });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', readTheme);
    new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('pagehide', () => { if (!DEMO) save(); });

    document.body.classList.toggle('preview', PREVIEW && !BARE);
    document.body.classList.toggle('bare', BARE);
    try { await document.fonts.load('20px Bangers'); await document.fonts.load('700 13px "Comic Neue"'); } catch (e) { /* fallback fonts */ }
    paintIcons();

    let data = null;
    if (host) {
      const init = await host.init();
      applySettings(init.settings);
      data = init.flock;
      host.onCursor((p) => setPtr(p.x, p.y));
      host.onSettings(applySettings);
      host.onCommand(command);
    } else {
      applySettings({ toolbox: params.get('toolbox') !== '0' });
      if (window.innerWidth < 520) toolbox.classList.add('folded');
      try { data = JSON.parse(localStorage.getItem('nickys-flock') || 'null'); } catch (e) { data = null; }
    }

    if (DEMO) {
      seedDemo();
    } else if (!restore(data)) {
      // first visit: one sheep parachutes in, a second one strolls in a bit later
      setTimeout(() => spawn('chute'), 1200);
      setTimeout(() => spawn('walk'), PREVIEW ? 6000 : 9000);
    }
    scheduleSpawn();
    syncToolbox();
    requestAnimationFrame((t) => { last = t; frame(t); });
    if (host) host.ready();
  }

  // exposed for the self-test
  window.__flock = { G, spawn, command, snapshot };
  boot();
})();
