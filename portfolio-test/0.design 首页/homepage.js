(() => {
  'use strict';
  const header = document.querySelector('.site-header');
  const menu = document.querySelector('.mobile-menu-toggle');
  menu.addEventListener('click', () => {
    const open = header.classList.toggle('menu-open');
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? '收起导航' : '展开导航');
    menu.textContent = open ? '×' : '☰';
  });
  function closeMenu() {
    header.classList.remove('menu-open');
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', '展开导航');
    menu.textContent = '☰';
  }
  document.querySelectorAll('.main-nav a').forEach(a => a.addEventListener('click', closeMenu));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  const search = document.getElementById('gallery-search');
  const cards = [...document.querySelectorAll('.inspiration-item')];
  const more = document.getElementById('gallery-more');
  const count = document.getElementById('gallery-count');
  let limit = 6;
  function renderGallery() {
    const query = search.value.trim().toLocaleLowerCase();
    let matches = 0, shown = 0;
    cards.forEach(card => {
      const matchesQuery = card.dataset.search.toLocaleLowerCase().includes(query);
      const visible = matchesQuery && matches++ < limit;
      card.hidden = !visible;
      if (visible) shown++;
    });
    document.getElementById('empty-state').hidden = matches > 0;
    more.hidden = matches <= limit;
    count.textContent = `已展示 ${shown} / ${matches} 个作品集案例`;
  }
  search.addEventListener('input', () => { limit = 6; renderGallery(); });
  more.addEventListener('click', () => {
    const last = cards.filter(c => !c.hidden).at(-1);
    limit += 9;
    renderGallery();
    const next = cards.slice(cards.indexOf(last) + 1).find(c => !c.hidden);
    if (next) next.querySelector('a').focus({ preventScroll: true });
  });
  renderGallery();
  document.querySelector('.back-top').addEventListener('click', () => {
    document.querySelector('.brand').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  });
})();
