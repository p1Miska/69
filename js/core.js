'use strict';
/* ---------- мелкие хелперы ---------- */
const $ = (s, r = document) => r.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = arr => arr[Math.floor(Math.random() * arr.length)];
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : String(Math.floor(n));
const rate = r => (Math.round(r * 10) / 10).toString();

/* h('div', {class:'x', onclick:fn}, 'текст', child, ...) */
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  kids.flat().forEach(c => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); });
  return e;
}

/* ---------- ХРАНИЛИЩЕ ----------
   Сейчас localStorage. В 2.0 заменяется на сервер в ЭТОМ месте:
   достаточно сохранить те же три метода (read / write / remove).   */
const Store = {
  read(i) { try { return JSON.parse(localStorage.getItem(SAVE_PREFIX + i)); } catch (e) { return null; } },
  write(i, data) { try { localStorage.setItem(SAVE_PREFIX + i, JSON.stringify(data)); } catch (e) {} },
  remove(i) { localStorage.removeItem(SAVE_PREFIX + i); },
};

/* ---------- ЗАГЛУШКИ ДЛЯ 2.0 ---------- */
const Auth = {
  enabled: false, user: null,
  login()  { return Promise.reject(new Error('Будет в версии 2.0')); },
  logout() { this.user = null; },
};
const Leaderboard = {
  enabled: false,
  submit(score) { /* 2.0: отправка на сервер. score = {level, earned, cards} */ },
  top()  { return Promise.resolve([]); },
};

/* ---------- ЗАГРУЗЧИК ФАЙЛОВ ----------
   Всё (картинки, звуки, видео, шрифт) скачивается ОДИН РАЗ при входе на сайт и
   лежит в памяти как blob. Браузер не может выкинуть это из кэша, а игра берёт
   файлы через A('путь'). Если blob недоступен (например, открыто как file://),
   A() просто вернёт обычный путь, и всё работает как раньше.                */
const Assets = {
  map: {}, status: {}, keep: [],
  url(p) { return this.map[p] || p; },
  async fetchBlob(p) {
    try {
      const r = await fetch(p);
      if (!r.ok) { this.status[p] = 'missing'; return null; }
      const b = await r.blob(); this.status[p] = 'ok'; return b;
    } catch (e) { this.status[p] = 'fail'; return null; }
  },
  async one(it) {
    if (it.kind === 'font') {
      for (const src of it.srcs) {
        const b = await this.fetchBlob(src); if (!b) continue;
        try {
          const ff = new FontFace('MC', `url(${URL.createObjectURL(b)})`);
          await ff.load(); document.fonts.add(ff); return;
        } catch (e) {}
      }
      return;
    }
    const b = await this.fetchBlob(it.src);
    if (!b) {                                   // запасной вариант: обычная загрузка, но держим объект в памяти
      if (it.kind === 'img' && this.status[it.src] !== 'missing') {
        await new Promise(res => { const im = new Image(); im.onload = im.onerror = res; im.src = it.src; this.keep.push(im); });
      }
      return;
    }
    const u = URL.createObjectURL(b); this.map[it.src] = u;
    if (it.kind === 'img') {
      const im = new Image(); im.src = u;
      try { await im.decode(); } catch (e) {}
      this.keep.push(im);
    } else if (it.kind === 'audio') {
      await Sfx.register(it.src, await b.arrayBuffer());
    }
  },
  async load(list, onStep) {
    let done = 0;
    await Promise.all(list.map(it => this.one(it).catch(() => {}).then(() => onStep && onStep(++done, list.length))));
  },
};
const A = p => Assets.url(p);

/* ---------- ЗВУК ----------
   Всё идёт через Web Audio: музыка зацикливается без щелчка и НЕ показывается
   как «плеер» в шторке телефона. При сворачивании вкладки / блокировке экрана
   звук ставится на паузу, при возвращении — продолжается. Мут запоминается.   */
const Sfx = {
  files: { click: 'sounds/click.mp3', pack: 'sounds/kazik.mp3', stairs: 'sounds/stairs.mp3', craft: 'sounds/craft.mp3' },
  musicFile: 'sounds/soundtrack.mp3', musicVol: 0.3,
  buf: {}, muted: false, ctx: null, master: null, musicGain: null, musicSrc: null, musicEl: null, wantMusic: false,

  init() {
    try { this.muted = localStorage.getItem('pribal_muted') === '1'; } catch (e) {}
    const C = window.AudioContext || window.webkitAudioContext;
    if (C) {
      this.ctx = new C();
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = this.musicVol; this.musicGain.connect(this.master);
    }
    document.addEventListener('visibilitychange', () => this.sync());
    ['pointerdown', 'touchend', 'keydown'].forEach(ev => addEventListener(ev, () => this.sync(), { passive: true, capture: true }));
  },
  keyOf(path) { return path === this.musicFile ? 'music' : Object.keys(this.files).find(k => this.files[k] === path); },
  async register(path, ab) {                      // вызывается загрузчиком: декодируем звук заранее
    const k = this.keyOf(path); if (!k || !this.ctx) return;
    try { this.buf[k] = await this.ctx.decodeAudioData(ab); } catch (e) {}
  },
  missing(k) { return Assets.status[k === 'music' ? this.musicFile : this.files[k]] === 'missing'; },

  play(k, vol = 0.7) {
    if (this.muted || this.missing(k)) return;
    if (this.ctx && this.buf[k]) {
      const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
      s.buffer = this.buf[k]; g.gain.value = vol; s.connect(g); g.connect(this.master); s.start(0);
      return;
    }
    const a = new Audio(A(this.files[k])); a.volume = vol;   // запасной путь (нет Web Audio / не декодировалось)
    a.addEventListener('error', () => { Assets.status[this.files[k]] = 'missing'; });
    a.play().catch(() => {});
  },
  startMusic() {
    this.wantMusic = true;
    if (!this.musicSrc && !this.musicEl) {
      if (this.ctx && this.buf.music) {
        const s = this.ctx.createBufferSource();
        s.buffer = this.buf.music; s.loop = true; s.connect(this.musicGain); s.start(0); this.musicSrc = s;
      } else if (!this.missing('music')) {
        const a = new Audio(A(this.musicFile)); a.loop = true; a.volume = this.musicVol; a.setAttribute('playsinline', ''); this.musicEl = a;
      }
    }
    this.sync();
  },
  /* приводит звук в соответствие: мут / вкладка скрыта / нужно возобновить */
  sync() {
    const off = this.muted || document.hidden;
    if (this.musicEl) { if (off) this.musicEl.pause(); else if (this.wantMusic) this.musicEl.play().catch(() => {}); }
    if (!this.ctx) return;
    if (off) { if (this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
    else if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  },
  toggle() {
    this.muted = !this.muted;
    try { localStorage.setItem('pribal_muted', this.muted ? '1' : '0'); } catch (e) {}
    this.sync();
    return this.muted;
  },
  /* лестница: свой файл sounds/stairs.mp3, а если его нет — синтезируем шаги */
  stairs() {
    if (this.muted) return;
    if (!this.missing('stairs') && (this.buf.stairs || !this.ctx)) return this.play('stairs', 1);
    if (!this.ctx) return;
    const ctx = this.ctx;
    for (let i = 0; i < 9; i++) {
      const t = ctx.currentTime + i * 0.33, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(140 - i * 4, t);
      o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
      g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.15);
    }
  },
};

/* ---------- АНИМАЦИИ ---------- */
const Fx = {
  floatText(text, x, y, color = '#ffd93d') {
    const e = h('div', { class: 'float', style: `left:${x + (Math.random() * 40 - 20)}px;top:${y - 30}px;color:${color}` }, text);
    document.body.append(e); setTimeout(() => e.remove(), 800);
  },
  burst(x, y, ch, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 60;
      const p = h('div', { class: 'particle', style: `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 30}px` }, ch);
      document.body.append(p); setTimeout(() => p.remove(), 700);
    }
  },
  flash() { const f = h('div', { class: 'flash' }); document.body.append(f); setTimeout(() => f.remove(), 500); },
  anim(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); },
};
