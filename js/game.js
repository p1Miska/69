'use strict';
/* Вся логика игры. Про DOM тут ничего нет — только состояние и правила. */
const Game = {
  state: null, slot: null,
  fx: { click: 0, cardMult: 0, income: {}, clickFlat: 1, incomeDiv: 1 },
  incomeMult() { return (1 + this.fx.cardMult) / this.fx.incomeDiv; },

  /* ---------- состояние и сохранения ---------- */
  emptyCraft() { return { a: null, b: null, active: false, endsAt: null, result: null }; },
  newState() {
    const cur = {}; CURRENCIES.forEach(c => cur[c.id] = 0);
    return { v: 1, level: 1, cur, slots: Array(SLOT_COUNT).fill(null), inv: {}, flags: {},
             stats: { clicks: 0, earned: 0 }, craft: this.emptyCraft(), ts: Date.now() };
  },
  load(d) {
    const b = this.newState(); if (!d) return b;
    const s = { ...b, ...d };
    s.cur = { ...b.cur, ...d.cur }; s.flags = { ...b.flags, ...d.flags };
    s.stats = { ...b.stats, ...d.stats }; s.craft = { ...b.craft, ...d.craft };
    s.inv = { ...d.inv };
    for (const id in s.inv) if (!CARDS[id] || s.inv[id] <= 0) delete s.inv[id];
    s.slots = Array.from({ length: SLOT_COUNT }, (_, i) => { const id = d.slots && d.slots[i]; return CARDS[id] && s.inv[id] ? id : null; });
    s.level = Math.min(Math.max(1, s.level | 0), LEVELS.filter(l => !l.locked).length);
    return s;
  },
  start(slot, data) { this.slot = slot; this.state = this.load(data); this.refreshFx(); },
  save() { if (this.slot !== null && this.state) Store.write(this.slot, { ...this.state, ts: Date.now() }); },
  level() { return LEVELS[this.state.level - 1]; },

  /* ---------- валюта ---------- */
  can(cost) { return Object.entries(cost).every(([k, v]) => (this.state.cur[k] || 0) >= v); },
  pay(cost) { if (!this.can(cost)) return false; for (const k in cost) this.state.cur[k] -= cost[k]; return true; },
  add(k, n) { this.state.cur[k] = (this.state.cur[k] || 0) + n; if (k === 'money' && n > 0) this.state.stats.earned += n; },

  /* ---------- эффекты карточек ---------- */
  computeEffects() {
    const acc = { click: 0, cardMult: 0, income: {}, clickFlat: 1, incomeDiv: 1 };
    const cards = this.state.slots.filter(Boolean).map(id => CARDS[id]);
    const dbl = new Set(cards.map(c => c.fx.doubleRarity).filter(Boolean));
    const src = [];
    cards.forEach(c => { src.push(c); if (dbl.has(c.rarity)) src.push(c); });
    cards.forEach(c => {
      if (!c.fx.cloneRandom) return;
      const pool = cards.filter(x => x !== c && !x.fx.cloneRandom);
      if (pool.length) src.push(rand(pool));
    });
    cards.forEach(c => { if (c.fx.clickFlat) acc.clickFlat *= c.fx.clickFlat; if (c.fx.incomeDiv) acc.incomeDiv *= c.fx.incomeDiv; });
    src.forEach(c => {
      const f = c.fx;
      if (f.clickMult) acc.click += f.clickMult;
      if (f.cardMult) acc.cardMult += f.cardMult;
      if (f.income) for (const k in f.income) acc.income[k] = (acc.income[k] || 0) + f.income[k];
    });
    return acc;
  },
  refreshFx() { this.fx = this.computeEffects(); },

  /* ---------- клик и пассивный доход ---------- */
  click() {
    const p = Math.max(1, Math.round((1 + this.fx.click) * this.fx.clickFlat));
    this.add('money', p); this.state.stats.clicks++;
    return p;
  },
  tick() {   // раз в секунду
    this.refreshFx();
    const m = this.incomeMult();
    for (const k in this.fx.income) this.add(k, this.fx.income[k] * m);
  },

  /* ---------- карточки ---------- */
  count(id) { return this.state.inv[id] || 0; },
  addCard(id) { this.state.inv[id] = this.count(id) + 1; },
  takeCard(id) {
    if (this.count(id) <= 0) return;
    this.state.inv[id]--;
    if (this.state.inv[id] <= 0) { delete this.state.inv[id]; this.state.slots = this.state.slots.map(s => s === id ? null : s); }
    this.refreshFx();
  },
  burn(id) { this.takeCard(id); this.save(); },   // Шпротик сгорает
  setSlot(i, id) { this.state.slots[i] = id; this.refreshFx(); },
  owned() { return new Set(Object.keys(this.state.inv)).size; },
  sellPrice(id) { return RARITY[CARDS[id].rarity].sell; },
  sell(id) {                       // продаются только дубликаты
    if (this.count(id) < 2) return false;
    this.state.inv[id]--; this.add('potato', this.sellPrice(id)); return true;
  },

  /* ---------- магазин и паки ---------- */
  exchange(b) { if (!this.pay(b.cost)) return false; for (const k in b.get) this.add(k, b.get[k]); return true; },
  cardsOf(r) { return Object.values(CARDS).filter(c => c.rarity === r); },
  rollPack(p) {
    let r = Math.random() * 100, acc = 0, pick = null;
    for (const [rar, ch] of Object.entries(p.chances)) { acc += ch; if (r < acc && ch > 0) { pick = rar; break; } }
    if (!pick || !this.cardsOf(pick).length) {      // на случай пустой редкости — берём ближайшую имеющуюся
      pick = Object.keys(RARITY).find(k => this.cardsOf(k).length && p.chances[k] > 0) || 'cool';
    }
    return rand(this.cardsOf(pick));
  },
  buyPack(p) {
    if (this.state.level < p.level || !this.pay(p.price)) return null;
    const card = this.rollPack(p), isNew = !this.count(card.id);
    this.addCard(card.id); this.save();
    return { card, isNew };
  },

  /* ---------- лаборатория ---------- */
  craftRule(a, b) {
    const [x, y] = [CARDS[a].rarity, CARDS[b].rarity].sort((p, q) => RARITY[p].order - RARITY[q].order);
    return CRAFT_RULES[x + '+' + y] || null;
  },
  canCraft(a, b) {
    if (!a || !b || CARDS[a].noCraft || CARDS[b].noCraft || !this.craftRule(a, b)) return false;
    return a !== b || this.count(a) >= 2;
  },
  startCraft() {
    const c = this.state.craft;
    if (c.active || !this.canCraft(c.a, c.b)) return false;
    this.takeCard(c.a); this.takeCard(c.b);
    c.active = true; c.endsAt = Date.now() + CRAFT_SECONDS * 1000; c.result = null;
    this.save(); return true;
  },
  checkCraft() {   // true, если крафт только что завершился
    const c = this.state.craft;
    if (!c.active || c.result || Date.now() < c.endsAt) return false;
    const rule = this.craftRule(c.a, c.b), roll = Math.random() * 100;
    let acc = rule.fail, res = { type: 'fail' };
    if (roll >= acc) for (const [rar, ch] of Object.entries(rule.results)) {
      if (roll < (acc += ch)) { res = { type: 'success', cardId: rand(this.cardsOf(rar)).id }; break; }
    }
    c.result = res; this.save(); return true;
  },
  finishCraft() {
    const c = this.state.craft;
    if (c.result && c.result.type === 'success') this.addCard(c.result.cardId);
    this.state.craft = this.emptyCraft(); this.save();
  },

  /* ---------- подъём по бункеру ---------- */
  nextLevel() { const n = LEVELS[this.state.level]; return n && !n.locked ? n : null; },
  canLevelUp() { const n = this.nextLevel(); return !!n && this.can(n.enter); },
  levelUp() {
    const n = this.nextLevel();
    if (!n || !this.pay(n.enter)) return null;
    this.state.level = n.id; this.save();
    Leaderboard.submit(this.score());
    return n;
  },
  score() { return { level: this.state.level, earned: Math.floor(this.state.stats.earned), cards: this.owned() }; },
};
