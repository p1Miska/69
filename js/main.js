'use strict';
/* Всё, что нужно игре, грузится сразу при входе на сайт (см. Assets в core.js) */
function preloadList() {
  const imgs = [
    ...Object.values(CARDS).map(c => c.img),
    ...PACKS.map(p => p.img),
    ...CURRENCIES.filter(c => c.img).map(c => c.img),
    ...LEVELS.filter(l => l.bg).map(l => l.bg),
    ...INTRO.map(s => s.img),
    'images/empty.png', 'images/potate.png', 'images/magaz.png', 'images/craft.png', 'images/kazik.png', 'images/evil.png',
  ];
  return [
    { kind: 'font', srcs: ['fonts/minecraft.woff2', 'fonts/minecraft.ttf'] },
    ...[...new Set(imgs)].map(src => ({ kind: 'img', src })),
    ...[...Object.values(Sfx.files), Sfx.musicFile].map(src => ({ kind: 'audio', src })),
    { kind: 'video', src: 'videos/shpr.mp4' },
  ];
}

function preload() {
  const fill = $('#loadingFill');
  return Assets.load(preloadList(), (done, total) => { fill.style.width = (done / total * 100) + '%'; });
}

window.addEventListener('DOMContentLoaded', async () => {
  Sfx.init();
  $('#btnLogin').onclick = () => openLocked('Вход в аккаунт', '2.0');
  $('#btnBoard').onclick = () => openLocked('Лидерборд', '2.0');
  $('#btnRoadmap').onclick = () => UI.openRoadmap();
  $('#ver').textContent = 'версия ' + VERSION;

  const vid = $('#shprVideo'), vo = $('#videoOverlay');
  vid.onended = () => vo.classList.remove('show');
  vo.onclick = () => { vid.pause(); vo.classList.remove('show'); };

  await preload();
  vid.src = A('videos/shpr.mp4'); vid.load();
  $('#loading').classList.remove('show');
  UI.renderTitle();

  setInterval(() => { if (Game.slot !== null && $('#game').classList.contains('show')) { Game.tick(); UI.refreshCur(); UI.refreshDock(); } }, 1000);
  setInterval(() => { if (Game.slot !== null) UI.tickLab(); }, 500);
  setInterval(() => Game.save(), 5000);
  addEventListener('beforeunload', () => Game.save());
  document.addEventListener('visibilitychange', () => { if (document.hidden) Game.save(); });

  /* пробел / Enter = клик (удобно на ПК и для стримов) */
  addEventListener('keydown', e => {
    if ((e.code === 'Space' || e.code === 'Enter') && Game.slot !== null && $('#game').classList.contains('show') && !openApis.length && !$('#fade').classList.contains('on')) {
      e.preventDefault();
      const r = $('#clickBtn').getBoundingClientRect();
      UI.doClick(r.left + r.width / 2, r.top + r.height / 2);
    }
  });
});
