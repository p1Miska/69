'use strict';
/* ============================================================
   ВСЯ ИГРОВАЯ ДАТА ЖИВЁТ ЗДЕСЬ.
   Новая карточка / пак / уровень / валюта = просто новая запись.
   Код в game.js и ui.js трогать не нужно.
   ============================================================ */

const VERSION = '1.0';
const SAVE_PREFIX = 'pribal_save_v5_';
const SAVE_SLOTS = 3;
const SLOT_COUNT = 5;          // слотов для карточек в игре
const CRAFT_SECONDS = 60;      // время скрещивания в лаборатории

/* ---------- ВАЛЮТЫ (в 2.0 сюда добавятся ещё 3) ---------- */
const CURRENCIES = [
  { id: 'money',  name: 'Прибаль',  icon: '💸' },
  { id: 'potato', name: 'Картошка', icon: '', img: 'images/potate.png' },
];

/* ---------- РЕДКОСТИ ---------- */
const RARITY = {
  cool:  { name: 'Крутая',       color: '#4ade80', order: 1, sell: 1 },
  super: { name: 'Суперкрутая',  color: '#60a5fa', order: 2, sell: 3 },
  mega:  { name: 'Мегакрутая',   color: '#ef4444', order: 3, sell: 8 },
  ultra: { name: 'Ультракрутая', color: '#ffd93d', order: 4, sell: 20 },
};

/* ---------- КАРТОЧКИ ----------
   fx (эффекты, работают пока карточка в слоте):
     clickMult:   +N к множителю клика (0.5 = +50%)
     cardMult:    +N к множителю дохода всех карточек
     income:      { валюта: N в секунду }
     doubleRarity:'cool'  -> карточки этой редкости в слотах работают дважды
     cloneRandom: 1       -> копирует эффект случайной другой карточки в слотах
     clickFlat: N         -> клик умножается на N;  incomeDiv: N -> доход карточек делится на N
     burnOnSlot: 1        -> сгорает при постановке в слот (играет видео videos/shpr.mp4)
     noCraft: true        -> (на уровне карточки) нельзя скрещивать
   Картинка по умолчанию: images/<id>.png                            */
const CARDS = {
  candu:      { name: 'Канду',      rarity: 'cool',  fx: { clickMult: 0.5 },            desc: '+50% к силе клика' },
  sintwo:     { name: 'Синтво',     rarity: 'cool',  fx: { income: { money: 1 } },      desc: '+1 прибаль в секунду' },
  delta:      { name: 'Дельта',     rarity: 'cool',  fx: { income: { money: 2 } },      desc: '+2 прибали в секунду' },
  shprotik:   { name: 'Шпротик',    rarity: 'cool',  fx: { burnOnSlot: 1 }, noCraft: true, desc: 'Сгорает, если поставить в слот. Что будет — сюрприз. Скрещивать нельзя.' },
  fix:        { name: 'Фикс',       rarity: 'cool',  fx: {},                            desc: 'Ничего не делает. Просто Фикс.' },
  allincy:    { name: 'Аллинси',    rarity: 'super', fx: { cardMult: 0.5 },             desc: '+50% к доходу всех карточек' },
  nnwen:      { name: 'Ннвен',      rarity: 'super', fx: { income: { potato: 0.1 } },   desc: '+0.1 картошки в секунду' },
  wixon:      { name: 'Виксон',     rarity: 'super', fx: { income: { money: 3 } },      desc: '+3 прибали в секунду' },
  igrobaiter: { name: 'Игробайтер', rarity: 'super', fx: { doubleRarity: 'cool' },      desc: 'Крутые карточки в слотах работают дважды' },
  complitplay:{ name: 'Complitplay', rarity: 'mega', fx: { clickFlat: 4, incomeDiv: 2 }, desc: 'Клик ×4, но доход всех карточек ÷2' },
  bibz:       { name: 'Бибз',       rarity: 'mega',  fx: { income: { potato: 0.2 } },   desc: '+0.2 картошки в секунду' },
  backfun:    { name: 'Бэкфан',     rarity: 'ultra', fx: { cloneRandom: 1 },            desc: 'Каждую секунду копирует случайную карточку в слотах' },
  miska:      { name: 'Миська',     rarity: 'ultra', fx: { income: { money: 20, potato: 0.5 } }, desc: '+20 прибали и +0.5 картошки в секунду' },
};
for (const id in CARDS) { CARDS[id].id = id; CARDS[id].img = CARDS[id].img || `images/${id}.png`; }

/* ---------- ПАКИ (ящики) ----------
   level: с какого уровня бункера доступен.
   chances: шансы в %, в сумме 100.  img: у каждого ящика своя картинка (box1.png, box2.png, box3.png).
   tint: необязательный css-filter (сейчас не нужен — у каждого своя текстура) */
const PACKS = [
  { id: 'small',  name: 'Маленький ящик', img: 'images/box1.png', level: 1, price: { potato: 3 },
    chances: { cool: 80, super: 18, mega: 2, ultra: 0 }, tint: 'none' },
  { id: 'medium', name: 'Средний ящик',   img: 'images/box2.png', level: 1, price: { potato: 12 },
    chances: { cool: 50, super: 38, mega: 11, ultra: 1 }, tint: 'none' },
  { id: 'big',    name: 'Большой ящик',   img: 'images/box3.png', level: 2, price: { potato: 30 },
    chances: { cool: 25, super: 40, mega: 28, ultra: 7 }, tint: 'none' },
];

/* ---------- УРОВНИ БУНКЕРА ----------
   enter: цена входа на этот уровень. lab: открывает лабораторию.
   locked: '2.0' -> показывается с замочком.                         */
const LEVELS = [
  { id: 1, name: 'Бункер · Уровень 1', short: 'Нижний бункер', color: '#1a1512', bg: 'images/level1.png' },
  { id: 2, name: 'Бункер · Уровень 2', short: 'Лаборатория',   color: '#0e1a18', bg: 'images/level2.png',
    lab: true, enter: { money: 1500, potato: 10 } },
  { id: 3, short: 'Уровень 3', locked: '2.0' },
  { id: 4, short: 'Уровень 4', locked: '2.0' },
  { id: 5, short: 'Уровень 5', locked: '2.0' },
  { id: 6, short: 'Уровень 6', locked: '2.0' },
  { id: 7, short: 'Уровень 7', locked: '2.0' },
];

/* ---------- МАГАЗИН: обмен прибали на картошку ---------- */
const EXCHANGE = [
  { get: { potato: 1 },  cost: { money: 69 } },
  { get: { potato: 10 }, cost: { money: 450 } },
  { get: { potato: 50 }, cost: { money: 2000 } },
];

/* ---------- МАГАЗИН: «донат» (шутка) ---------- */
const DONATE = [
  { name: 'Мешок картошки',   amount: 100,  price: '99 ₽' },
  { name: 'Тележка картошки', amount: 600,  price: '499 ₽' },
  { name: 'Вагон картошки',   amount: 3000, price: '1990 ₽' },
];

/* ---------- КРАФТ: ключ = «меньшая+большая» редкость ---------- */
const CRAFT_RULES = {
  'cool+cool':   { fail: 50, results: { super: 50 } },
  'super+super': { fail: 50, results: { mega: 50 } },
  'mega+mega':   { fail: 50, results: { ultra: 50 } },
  'cool+super':  { fail: 50, results: { cool: 25, super: 25 } },
  'cool+mega':   { fail: 50, results: { mega: 50 } },
  'super+mega':  { fail: 25, results: { super: 25, mega: 25, ultra: 25 } },
};

/* ---------- ИНТРО (в 2.0 сюда же добавляется полная катсцена) ---------- */
const INTRO = [
  { img: 'images/evil.png', text: 'ВОНЮЧИЙ СКУНС УКРАЛ МОЮ ПРИБАЛЬ😡😡😡' },
  { img: 'images/evil.png', text: 'НАДО ЕМУ ОТОМСТИТЬ ✅✅✅' },
];

/* ---------- ЧТО БУДЕТ В 2.0 ---------- */
const ROADMAP = [
  { ver: '2.0', title: 'Большое обновление', items: [
    '5 новых уровней бункера (с 3-го по 7-й)',
    'Десятки новых карточек и новые редкости',
    'Много новых паков и ящиков',
    '3 новые валюты',
    'Мини-игры (начиная с 3-го уровня)',
    'Полноценная катсцена как в Undertale: картинки, текст и музыка',
    'Регистрация и вход в аккаунт',
    'Онлайн-лидерборд и собственный сервер',
    'Переработка баланса и экономики',
    'И ещё очень-очень много всего',
  ] },
  { ver: '2.2', title: 'DLC «ЗаМедСание»', items: [
    'Отдельное DLC с новым контентом',
    'Подробности позже',
  ] },
];
