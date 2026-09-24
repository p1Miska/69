'use strict';
const S = () => Game.state;
const cur = id => CURRENCIES.find(c => c.id === id);
/* иконка валюты: картинка (картошка) или эмодзи (прибаль) */
const ico = id => { const c = cur(id); return c.img ? h('img', { class: 'pi', src: A(c.img), alt: c.name }) : c.icon; };
const costEl = c => h('span', { class: 'cost' }, Object.entries(c).map(([k, v]) => h('span', { class: 'cost-i' }, ico(k), ' ' + fmt(v))));
const walletLine = () => h('div', { class: 'wallet-line' }, CURRENCIES.map(c => h('span', { class: 'cost-i' }, ico(c.id), ' ' + fmt(S().cur[c.id] || 0))));
const chanceSpans = p => Object.entries(p.chances).filter(([, v]) => v > 0)
  .map(([k, v]) => h('span', { style: `color:${RARITY[k].color}` }, `${v}% ${RARITY[k].name.toLowerCase()}`));
const labLevel = () => LEVELS.find(l => l.lab);

/* ---------- окна ---------- */
const openApis = [];
function openModal(title, cls, render) {
  const ov = h('div', { class: 'overlay' }), body = h('div', { class: 'modal-body' });
  const api = {
    close() { const i = openApis.indexOf(api); if (i >= 0) openApis.splice(i, 1); ov.classList.add('out'); setTimeout(() => ov.remove(), 150); if (api.onClose) api.onClose(); },
    redraw() { body.replaceChildren(); render(body, api); },
  };
  ov.append(h('div', { class: 'modal ' + cls },
    h('div', { class: 'modal-head' }, h('div', { class: 'modal-title' }, title), h('button', { class: 'x', onclick: () => api.close() }, '✕')), body));
  ov.addEventListener('click', e => { if (e.target === ov) api.close(); });
  $('#modalRoot').append(ov); openApis.push(api); api.redraw();
  return api;
}
const redrawAll = () => openApis.forEach(a => a.redraw());
const closeAll = () => openApis.slice().forEach(a => a.close());

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; Fx.anim(t, 'show');
}
function openLocked(title, ver) {
  openModal('🔒 ' + title, 'small', body => body.append(
    h('div', { class: 'lock-big' }, '🔒'),
    h('div', { class: 'center' }, `Будет доступно в версии ${ver}`)));
}

/* ---------- карточки ---------- */
function cardRow(id, o = {}) {
  const c = CARDS[id], r = RARITY[c.rarity];
  return h('div', { class: 'row' + (o.click ? ' click' : ''), style: `--rc:${r.color}`, onclick: o.click },
    h('div', { class: 'thumb' + (o.dim ? ' silhouette' : ''), style: `background-image:url('${A(c.img)}')` }),
    h('div', { class: 'row-t' },
      h('div', { class: 'row-name' }, o.dim ? '???' : c.name),
      h('div', { class: 'row-rar' }, r.name),
      h('div', { class: 'row-desc' }, o.dim ? 'Ещё не найдена' : c.desc),
      o.extra || null),
    o.count > 1 ? h('div', { class: 'cnt' }, '×' + o.count) : null);
}
/* универсальный выбор карточки: ids — функция, чтобы список обновлялся */
function pickCard({ title, ids, onPick, keep, note, head }) {
  return openModal(title, 'picker', (body, api) => {
    if (head) body.append(head(api));
    if (note) body.append(h('div', { class: 'note' }, note));
    const list = ids();
    if (!list.length) body.append(h('div', { class: 'empty' }, 'Тут пока пусто. Открой паки в магазине.'));
    list.forEach(({ id, extra }) => body.append(cardRow(id, {
      count: Game.count(id), extra,
      click: () => { if (!keep) api.close(); onPick(id); if (keep) redrawAll(); },
    })));
  });
}
const byRarity = (a, b) => RARITY[CARDS[a].rarity].order - RARITY[CARDS[b].rarity].order;

const UI = {
  curEls: {}, lab: null, labTimer: null,

  show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('show', s.id === id)); },

  /* ========== ТИТУЛ / СОХРАНЕНИЯ ========== */
  renderTitle() {
    this.show('title'); closeAll();
    const box = $('#saveSlots'); box.replaceChildren();
    for (let i = 0; i < SAVE_SLOTS; i++) {
      const d = Store.read(i);
      box.append(h('div', { class: 'save-slot' + (d ? ' filled' : ''), onclick: () => this.begin(i, d) },
        h('div', { class: 'st' }, 'Слот ' + (i + 1)),
        d ? h('div', { class: 'si' }, `Ур. ${d.level || 1} · 💸 ${fmt((d.cur && d.cur.money) || 0)} · `, ico('potato'), ' ' + fmt((d.cur && d.cur.potato) || 0))
          : h('div', { class: 'si dim' }, 'Пусто — нажми, чтобы начать'),
        d ? h('button', { class: 'btn small red', onclick: e => { e.stopPropagation(); if (confirm('Удалить сохранение ' + (i + 1) + '?')) { Store.remove(i); this.renderTitle(); } } }, 'Удалить') : null));
    }
  },
  begin(i, data) {
    Game.start(i, data); Sfx.startMusic();
    if (S().flags.introSeen) this.enterGame(); else this.playIntro();
  },

  /* ========== ИНТРО ========== */
  async playIntro() {
    this.show('intro');
    const img = $('#introImg'), txt = $('#introText'), scr = $('#intro');
    let i = 0, typing = false, skip = false;
    const type = async line => {
      typing = true; skip = false; txt.textContent = '';
      for (const ch of line) { if (skip) break; txt.textContent += ch; await sleep(28); }
      txt.textContent = line; typing = false;
    };
    const showLine = () => { img.src = A(INTRO[i].img); type(INTRO[i].text); };
    showLine();
    scr.onclick = () => {
      if (typing) { skip = true; return; }
      if (++i < INTRO.length) return showLine();
      scr.onclick = null; S().flags.introSeen = true; Game.save(); this.enterGame();
    };
  },

  /* ========== ИГРОВОЙ ЭКРАН ========== */
  enterGame() {
    this.buildGame(); this.applyLevel(); this.renderSlots(); this.refreshCur(); this.refreshDock();
    this.show('game');
  },
  buildGame() {
    const g = $('#game');
    const dock = (img, label, fn, id, emoji) => h('button', { class: 'dock-btn', id, onclick: fn },
      img ? h('img', { src: A(img), alt: label }) : h('div', { class: 'dock-emoji' }, emoji), h('span', {}, label));
    this.curEls = {};
    const wallet = h('div', { id: 'wallet' });
    CURRENCIES.forEach(c => {
      const e = { box: h('div', { class: 'cur' }), v: h('span', { class: 'v' }, '0'), r: h('span', { class: 'r' }) };
      e.bump = h('div', { class: 'cur-inner' },
        h('span', { class: 'cur-label' }, c.name),
        c.img ? h('img', { src: A(c.img), alt: c.name }) : h('span', { class: 'ic' }, c.icon),
        h('div', {}, e.v, e.r));
      e.box.append(e.bump);
      wallet.append(e.box); this.curEls[c.id] = e;
    });
    const clickBtn = h('div', { id: 'clickBtn', tabindex: '0' }, '💸');
    clickBtn.addEventListener('pointerdown', ev => this.doClick(ev.clientX, ev.clientY));
    g.replaceChildren(
      h('div', { id: 'topbar' },
        h('div', { class: 'lvl-chip', id: 'lvlChip' }),
        wallet,
        h('div', { class: 'top-r' },
          h('button', { class: 'icon-btn', id: 'colBtn', onclick: () => this.openCollection() }),
          h('button', { class: 'icon-btn', id: 'muteBtn', onclick: e => { e.currentTarget.textContent = Sfx.toggle() ? '🔇' : '🔊'; } }, Sfx.muted ? '🔇' : '🔊'),
          h('button', { class: 'icon-btn', onclick: () => this.openMenu() }, '☰'))),
      h('div', { id: 'stage' }, h('div', { id: 'clickWrap' }, clickBtn), h('div', { id: 'slots' })),
      h('div', { id: 'dock' },
        dock('images/magaz.png', 'Магазин', () => this.openShop(), 'shopBtn'),
        dock('images/kazik.png', 'Паки', () => this.openPacks(), 'packBtn'),
        dock('images/craft.png', 'Лаборатория', () => this.openLab(), 'labBtn'),
        dock(null, 'Лестница', () => this.openBunker(), 'stairBtn', '🪜')));
  },
  applyLevel() {
    const l = Game.level(), g = $('#game');
    g.style.backgroundColor = l.color; g.style.backgroundImage = '';
    const im = new Image(); im.onload = () => { g.style.backgroundImage = `url('${A(l.bg)}')`; }; im.src = A(l.bg);
    $('#lvlChip').replaceChildren(h('b', {}, `⬆ Ур. ${l.id}`), h('small', {}, l.short));
  },
  doClick(x, y) {
    const p = Game.click();
    Sfx.play('click', 0.5); Fx.floatText('+' + p, x, y); Fx.burst(x, y, '💸', 3);
    Fx.anim($('#clickBtn'), 'pressed'); this.refreshCur();
  },
  renderSlots() {
    const box = $('#slots'); box.replaceChildren();
    S().slots.forEach((id, i) => {
      const c = id && CARDS[id];
      box.append(h('div', { class: 'slot' + (c ? ' full' : ''), style: `background-image:url('${A(c ? c.img : 'images/empty.png')}');` + (c ? `--rc:${RARITY[c.rarity].color}` : ''),
        onclick: () => this.openEquip(i) }));
    });
  },
  refreshCur() {
    const s = S(); if (!s || !this.curEls) return;
    CURRENCIES.forEach(c => {
      const e = this.curEls[c.id]; if (!e) return;
      const v = Math.floor(s.cur[c.id] || 0);
      if (e.last !== v) { e.v.textContent = fmt(v); if (e.last !== undefined) Fx.anim(e.bump, 'bump'); e.last = v; }
      const r = (Game.fx.income[c.id] || 0) * Game.incomeMult();
      e.r.textContent = r > 0 ? '+' + rate(r) + '/с' : '';
    });
    const col = $('#colBtn'); if (col) col.textContent = `🃏 ${Game.owned()}/${Object.keys(CARDS).length}`;
  },
  refreshDock() {
    const lab = $('#labBtn'); if (!lab) return;
    const open = Game.level().lab;
    lab.classList.toggle('locked', !open);
    lab.classList.toggle('ready', !!(open && S().craft.result));
    $('#stairBtn').classList.toggle('ready', Game.canLevelUp());
  },

  /* ========== СЛОТЫ ========== */
  openEquip(i) {
    const cur = S().slots[i];
    pickCard({
      title: 'Выбери карточку в слот ' + (i + 1),
      ids: () => Object.keys(S().inv).filter(id => !S().slots.includes(id)).sort(byRarity).map(id => ({ id })),
      onPick: id => { if (CARDS[id].fx.burnOnSlot) { Game.burn(id); this.refreshCur(); return this.playShpr(); } Game.setSlot(i, id); this.renderSlots(); this.refreshCur(); Game.save(); },
      head: api => cur ? h('button', { class: 'btn small red', onclick: () => { api.close(); Game.setSlot(i, null); this.renderSlots(); this.refreshCur(); Game.save(); } }, 'Убрать из слота') : h('span'),
    });
  },
  openCollection() {
    openModal('Коллекция', 'picker', body => {
      body.append(h('div', { class: 'note' }, `Собрано ${Game.owned()} из ${Object.keys(CARDS).length}`));
      Object.keys(CARDS).sort(byRarity).forEach(id => body.append(cardRow(id, { dim: !Game.count(id), count: Game.count(id) })));
    });
  },

  /* ========== МАГАЗИН ========== */
  openPacks() {
    openModal('Паки', 'shop', body => {
      body.append(walletLine());
      this.shopPacks(body);
    });
  },
  playShpr() {
    const o = $('#videoOverlay'), v = $('#shprVideo');
    o.classList.add('show'); v.currentTime = 0;
    v.play().catch(() => setTimeout(() => o.classList.remove('show'), 2000));
  },
  openShop(tab = 'exchange') {
    let t = tab;
    openModal('Магазин бункера', 'shop', (body, api) => {
      body.append(h('div', { class: 'tabs' }, [['exchange', [ico('potato'), ' Обмен']], ['donate', '💎 Донат']]
        .map(([k, l]) => h('button', { class: 'tab' + (t === k ? ' on' : ''), onclick: () => { t = k; api.redraw(); } }, l))));
      body.append(walletLine());
      ({ exchange: this.shopExchange, donate: this.shopDonate })[t].call(this, body);
    });
  },
  shopPacks(body) {
    PACKS.forEach(p => {
      const locked = S().level < p.level, poor = !Game.can(p.price);
      const tile = h('div', { class: 'tile' + (locked ? ' locked' : poor ? ' poor' : '') },
        h('div', { class: 'pack-img', style: `background-image:url('${A(p.img)}');filter:${p.tint}` }),
        h('div', { class: 'tile-t' },
          h('div', { class: 'tile-name' }, p.name),
          h('div', { class: 'chances' }, chanceSpans(p)),
          h('div', { class: 'price' }, locked ? `🔒 Откроется на уровне ${p.level}` : costEl(p.price))));
      tile.onclick = () => {
        if (locked) return toast(`🔒 Откроется на уровне ${p.level}`);
        if (poor) { Fx.anim(tile, 'shake'); return toast('Не хватает картошки'); }
        this.reveal(p);
      };
      body.append(tile);
    });
  },
  shopExchange(body) {
    EXCHANGE.forEach(b => {
      const poor = !Game.can(b.cost);
      const tile = h('div', { class: 'tile' + (poor ? ' poor' : '') },
        h('div', { class: 'big-ic' }, ico('potato')),
        h('div', { class: 'tile-t' }, h('div', { class: 'tile-name' }, '× ' + fmt(b.get.potato) + ' картошки'), h('div', { class: 'price' }, costEl(b.cost))));
      tile.onclick = () => {
        if (!Game.exchange(b)) { Fx.anim(tile, 'shake'); return toast('Не хватает прибали'); }
        Sfx.play('click'); Game.save(); this.refreshCur(); this.refreshDock(); redrawAll();
      };
      body.append(tile);
    });
    body.append(h('div', { class: 'tile', onclick: () => this.openSell() },
      h('div', { class: 'big-ic' }, '🃏'),
      h('div', { class: 'tile-t' }, h('div', { class: 'tile-name' }, 'Продать дубликаты'), h('div', { class: 'price' }, 'Карточки → картошка'))));
  },
  shopDonate(body) {
    DONATE.forEach(d => {
      const tile = h('div', { class: 'tile gold', onclick: () => this.openDonateNo() },
        h('div', { class: 'big-ic' }, '💎'),
        h('div', { class: 'tile-t' }, h('div', { class: 'tile-name' }, d.name), h('div', { class: 'don-amt' }, ico('potato'), ` × ${fmt(d.amount)}`), h('div', { class: 'price' }, d.price)));
      body.append(tile);
    });
  },
  openDonateNo() {
    openModal('Стоп!', 'small', (body, api) => body.append(
      h('div', { class: 'lock-big' }, '🚫'),
      h('div', { class: 'center' }, 'Донатить в игры — плохо.'),
      h('div', { class: 'center dim' }, 'Ничего не списано. Это пародия на мобильные игры. Лучше покликай — это бесплатно.'),
      h('button', { class: 'btn green wide', onclick: () => api.close() }, 'Ладно, иду кликать')));
  },
  openSell() {
    pickCard({
      title: 'Продать дубликаты', keep: true,
      note: 'Продаются только лишние копии. Последняя копия остаётся у тебя.',
      ids: () => Object.keys(S().inv).filter(id => Game.count(id) > 1).sort(byRarity)
        .map(id => ({ id, extra: h('div', { class: 'row-price' }, 'Продать за ', ico('potato'), ' ' + Game.sellPrice(id)) })),
      onPick: id => { if (Game.sell(id)) { Sfx.play('click'); Game.save(); this.refreshCur(); } },
    });
  },

  /* ========== ОТКРЫТИЕ ПАКА ========== */
  reveal(p) {
    const res = Game.buyPack(p); if (!res) return;
    this.refreshCur(); Sfx.play('pack', 1);
    const ov = h('div', { class: 'overlay reveal' }), st = h('div', { class: 'reveal-stage' });
    const close = () => { ov.remove(); this.refreshDock(); redrawAll(); };
    st.append(h('div', { class: 'pack-anim', style: `background-image:url('${A(p.img)}');filter:${p.tint}` }));
    ov.append(st); $('#modalRoot').append(ov);
    setTimeout(() => {
      const c = res.card, r = RARITY[c.rarity], again = Game.can(p.price);
      Fx.flash();
      st.replaceChildren(h('div', { class: 'reveal-card', style: `--rc:${r.color}` },
        r.order >= 3 ? h('div', { class: 'rays' }) : null,
        h('div', { class: 'rc-img', style: `background-image:url('${A(c.img)}')` }),
        res.isNew ? h('div', { class: 'new' }, 'НОВАЯ!') : null,
        h('div', { class: 'rc-name' }, c.name),
        h('div', { class: 'rc-rar', style: `color:${r.color}` }, r.name),
        h('div', { class: 'rc-desc' }, c.desc),
        res.isNew ? null : h('div', { class: 'rc-note' }, '★ Уже есть: продай дубликат или скрести в лаборатории'),
        h('div', { class: 'rc-btns' },
          h('button', { class: 'btn green', onclick: close }, 'Забрать'),
          again ? h('button', { class: 'btn', onclick: () => { close(); this.reveal(p); } }, 'Ещё · ', costEl(p.price)) : null)));
      Fx.burst(innerWidth / 2, innerHeight / 2, r.order >= 4 ? '⭐' : '✨', 10);
    }, 1100);
  },

  /* ========== ЛАБОРАТОРИЯ ========== */
  openLab() {
    if (!Game.level().lab) return toast(`🔒 Лаборатория откроется на уровне ${labLevel().id}`);
    this.lab = openModal('Лаборатория', 'lab', (b, a) => this.renderLab(b, a));
    this.lab.onClose = () => { this.lab = null; this.labTimer = null; };
  },
  renderLab(body, api) {
    const c = S().craft, cardA = c.a && CARDS[c.a], cardB = c.b && CARDS[c.b];
    const slot = (card, which) => h('div', { class: 'craft-slot' + (c.active ? ' locked' : '') + (card ? ' full' : ''), style: `background-image:url('${A(card ? card.img : 'images/empty.png')}');` + (card ? `--rc:${RARITY[card.rarity].color}` : ''),
      onclick: () => { if (!c.active) this.pickCraft(which, api); } });
    const okPair = Game.canCraft(c.a, c.b);
    let info;
    if (c.result) info = h('div', { class: c.result.type === 'fail' ? 'red-t' : 'green-t' }, c.result.type === 'fail' ? '💀 Прогорело' : '✅ Готово!');
    else if (c.active) info = h('div', { class: 'dim' }, 'Идёт скрещивание…');
    else if (cardA && cardB && !okPair) info = h('div', { class: 'red-t' }, cardA === cardB ? 'Нужно две копии этой карточки' : 'Эти карточки нельзя скрестить');
    else if (cardA && cardB) {
      const r = Game.craftRule(c.a, c.b);
      info = h('div', { class: 'chances-c' },
        h('span', { class: 'red-t' }, r.fail + '% прогорит'),
        Object.entries(r.results).map(([k, v]) => h('span', { style: `color:${RARITY[k].color}` }, ` · ${v}% ${RARITY[k].name.toLowerCase()}`)));
    } else info = h('div', { class: 'dim' }, 'Выбери две карточки');
    const res = c.result && c.result.type === 'success' ? CARDS[c.result.cardId] : null;
    this.labTimer = h('div', { class: 'timer' }, this.timeLeft());
    body.append(
      h('div', { class: 'craft-row' }, slot(cardA, 'a'), h('div', { class: 'plus' }, '+'), slot(cardB, 'b')),
      h('div', { class: 'plus' }, '='),
      h('div', { class: 'craft-slot big' + (res ? ' full' : ''), style: `background-image:url('${A(res ? res.img : 'images/empty.png')}');` + (res ? `--rc:${RARITY[res.rarity].color}` : '') }),
      info,
      c.result ? h('button', { class: 'btn green wide', onclick: () => { Sfx.play('craft', 0.8); Game.finishCraft(); this.refreshCur(); this.refreshDock(); this.renderSlots(); api.redraw(); } }, 'Забрать')
        : c.active ? this.labTimer
        : h('button', { class: 'btn green wide' + (okPair ? '' : ' off'), onclick: () => { if (Game.startCraft()) { Sfx.play('craft', 0.8); this.renderSlots(); this.refreshCur(); api.redraw(); } } }, 'Начать'));
  },
  timeLeft() {
    const t = Math.max(0, Math.ceil((S().craft.endsAt - Date.now()) / 1000));
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  },
  pickCraft(which, labApi) {
    const c = S().craft, other = which === 'a' ? c.b : c.a;
    pickCard({
      title: 'Выбери карточку для скрещивания',
      ids: () => Object.keys(S().inv).filter(id => CARDS[id].rarity !== 'ultra' && !CARDS[id].noCraft && Game.count(id) - (other === id ? 1 : 0) > 0).sort(byRarity).map(id => ({ id })),
      onPick: id => { c[which] = id; labApi.redraw(); },
      note: 'Ультракрутые карточки скрещивать нельзя.',
    });
  },
  tickLab() {   // раз в 0.5 секунды
    if (!S()) return;
    const done = Game.checkCraft();
    if (done) this.refreshDock();
    if (!this.lab) return;
    if (done) this.lab.redraw(); else if (this.labTimer && S().craft.active) this.labTimer.textContent = this.timeLeft();
  },

  /* ========== БУНКЕР / ЛЕСТНИЦА ========== */
  openBunker() {
    openModal('Бункер', 'bunker', (body, api) => {
      LEVELS.forEach(l => {
        const here = l.id === S().level, done = !l.locked && l.id < S().level;
        const row = h('div', { class: 'lvl' + (here ? ' here' : '') + (l.locked ? ' locked' : '') },
          h('div', { class: 'lvl-n' }, l.locked ? '🔒' : done ? '✅' : here ? '📍' : '⬆'),
          h('div', { class: 'row-t' },
            h('div', { class: 'row-name' }, l.locked ? l.short : `${l.id}. ${l.short}`),
            h('div', { class: 'row-desc' }, l.locked ? `Будет доступно в версии ${l.locked}` : here ? 'Ты здесь' : done ? 'Пройден' : ['Цена подъёма: ', costEl(l.enter)])));
        body.append(row);
        if (!l.locked && l.id === S().level + 1) {
          body.append(h('button', { class: 'btn green wide' + (Game.can(l.enter) ? '' : ' off'),
            onclick: () => { if (Game.can(l.enter)) { api.close(); this.ascend(); } else toast('Не хватает ресурсов для подъёма'); } }, 'Подняться на уровень ' + l.id));
        }
      });
      body.append(h('div', { class: 'lvl locked dlc' }, h('div', { class: 'lvl-n' }, '🔒'),
        h('div', { class: 'row-t' }, h('div', { class: 'row-name' }, 'DLC «ЗаМедСание»'), h('div', { class: 'row-desc' }, 'Будет доступно в версии 2.2'))));
    });
  },
  async ascend() {
    if (!Game.levelUp()) return;
    closeAll();
    const f = $('#fade'); f.className = 'on'; f.replaceChildren();
    await sleep(800);
    f.replaceChildren(h('div', { class: 'fade-t' }, 'Поднимаемся…'));
    Sfx.stairs();
    await sleep(3200);
    this.applyLevel(); this.refreshCur(); this.refreshDock();
    const l = Game.level();
    f.replaceChildren(h('div', { class: 'fade-t big' }, l.name), h('div', { class: 'fade-s' }, l.short));
    await sleep(1800);
    f.className = ''; f.replaceChildren();
  },

  /* ========== МЕНЮ / 2.0 ========== */
  openMenu() {
    openModal('Меню', 'small', (body, api) => body.append(
      h('button', { class: 'btn wide', onclick: () => { Game.save(); Game.slot = null; this.renderTitle(); } }, '💾 Сохранить и выйти'),
      h('button', { class: 'btn wide', onclick: () => this.openRoadmap() }, '📜 Что будет в 2.0'),
      h('button', { class: 'btn wide locked', onclick: () => openLocked('Мини-игры', '2.0') }, '🔒 Мини-игры'),
      h('button', { class: 'btn wide locked', onclick: () => openLocked('Вход в аккаунт', '2.0') }, '🔒 Войти'),
      h('button', { class: 'btn wide locked', onclick: () => openLocked('Лидерборд', '2.0') }, '🔒 Лидерборд')));
  },
  openRoadmap() {
    openModal('Что будет в 2.0', 'roadmap', body => ROADMAP.forEach(s => body.append(
      h('div', { class: 'road' },
        h('div', { class: 'road-h' }, `🔒 Версия ${s.ver}: ${s.title}`),
        h('ul', {}, s.items.map(i => h('li', {}, i)))))));
  },
};
