(() => {
  'use strict';
  const header = document.querySelector('.site-header');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 1001px)');
  const motionOK = () => !reducedMotion.matches;
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
    if (motionOK()) cards.slice(cards.indexOf(last) + 1).filter(c => !c.hidden).forEach((card, i) => {
      card.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], {
        duration: 380, delay: i * 35, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards'
      });
    });
  });
  renderGallery();
  document.querySelector('.back-top').addEventListener('click', () => {
    document.querySelector('.brand').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  });

  // Match the reference's scroll-driven card stack without a rendering library.
  const hero = document.querySelector('.hero');
  const heroPlanes = [...hero.querySelectorAll('.hero-preview')];
  const defaultPlane = hero.querySelector('.hero-preview.center');
  const secondPlane = hero.querySelector('.hero-preview.right');
  const thirdPlane = hero.querySelector('.hero-preview.left');
  const heroShowcase = hero.querySelector('.hero-showcase');
  const planeHoverDelay = 120;
  const planeCooldown = 850;
  let lastPlaneHoverPoint = null;
  let planeSwitchReadyAt = 0;
  let planeHoverTimer = null;
  let pendingPlane = null;
  let pendingPlanePoint = null;
  const planeMotions = new WeakMap();
  const planeTimings = [
    { duration: 620, delay: 0, arc: -18 },
    { duration: 650, delay: 70, arc: -8 },
    { duration: 680, delay: 130, arc: 12 }
  ];
  const planeOrders = new Map([
    [defaultPlane, [defaultPlane, secondPlane, thirdPlane]],
    [secondPlane, [secondPlane, thirdPlane, defaultPlane]],
    [thirdPlane, [thirdPlane, secondPlane, defaultPlane]]
  ]);
  function activateHeroPlane(plane) {
    const order = planeOrders.get(plane);
    const animate = hero.dataset.heroStyle === 'glass' && motionOK() &&
      !!defaultPlane.dataset.planeRank && !plane.classList.contains('is-plane-active');
    heroPlanes.forEach(item => {
      const rank = order.indexOf(item);
      const timing = planeTimings[rank];
      planeMotions.get(item)?.cancel();
      if (animate) {
        item.style.setProperty('--plane-duration', `${timing.duration}ms`);
        item.style.setProperty('--plane-delay', `${timing.delay}ms`);
      }
      item.classList.toggle('is-plane-active', item === plane);
      item.dataset.planeRank = String(rank + 1);
      if (animate && item.animate) {
        const arc = timing.arc * Math.min(1, innerWidth / 1000);
        // A shallow vertical arc complements the horizontal slot transition:
        // lead first, then follow, then the outgoing card settles at the back.
        const motion = item.animate([
          { translate: '0px 0px', offset: 0 },
          { translate: `0px ${arc}px`, offset: .42 },
          { translate: '0px 0px', offset: 1 }
        ], { duration: timing.duration, delay: timing.delay, easing: 'cubic-bezier(.22,.7,.2,1)' });
        planeMotions.set(item, motion);
      }
    });
  }
  activateHeroPlane(defaultPlane);
  function cancelPlaneHover() {
    clearTimeout(planeHoverTimer);
    planeHoverTimer = null;
    pendingPlane = null;
    pendingPlanePoint = null;
  }
  function hoverHeroPlane(plane, event) {
    if (event.pointerType === 'touch' || hero.dataset.heroStyle !== 'glass' || plane.classList.contains('is-plane-active') || performance.now() < planeSwitchReadyAt) {
      cancelPlaneHover(); return;
    }
    // Ignore layout-generated enters at a stationary cursor. New intent needs
    // a small dwell, and changes during the cooldown are discarded, not queued.
    if (lastPlaneHoverPoint && Math.hypot(event.clientX - lastPlaneHoverPoint.x, event.clientY - lastPlaneHoverPoint.y) < 16) {
      cancelPlaneHover(); return;
    }
    const point = { x: event.clientX, y: event.clientY };
    if (pendingPlane === plane) { pendingPlanePoint = point; return; }
    cancelPlaneHover();
    pendingPlane = plane;
    pendingPlanePoint = point;
    planeHoverTimer = setTimeout(() => {
      const candidate = pendingPlane, hoverPoint = pendingPlanePoint;
      cancelPlaneHover();
      if (!candidate || hero.dataset.heroStyle !== 'glass' || !candidate.matches(':hover') || performance.now() < planeSwitchReadyAt) return;
      lastPlaneHoverPoint = hoverPoint;
      planeSwitchReadyAt = performance.now() + planeCooldown;
      activateHeroPlane(candidate);
    }, planeHoverDelay);
  }
  heroPlanes.forEach(plane => {
    plane.addEventListener('pointerenter', event => hoverHeroPlane(plane, event));
    plane.addEventListener('focus', () => {
      cancelPlaneHover();
      if (hero.dataset.heroStyle === 'glass' && !plane.classList.contains('is-plane-active')) {
        planeSwitchReadyAt = performance.now() + planeCooldown;
        activateHeroPlane(plane);
      }
    });
  });
  heroShowcase.addEventListener('pointermove', event => {
    const plane = event.target.closest('.hero-preview');
    if (plane && heroShowcase.contains(plane)) hoverHeroPlane(plane, event);
    else cancelPlaneHover();
  });
  heroShowcase.addEventListener('pointerleave', () => { cancelPlaneHover(); lastPlaneHoverPoint = null; });
  const schemeOptions = [...document.querySelectorAll('[name="hero-scheme"]')];
  function setHeroScheme(glass, updateUrl = false) {
    cancelPlaneHover();
    heroPlanes.forEach(plane => planeMotions.get(plane)?.cancel());
    hero.dataset.heroStyle = glass ? 'glass' : 'classic';
    schemeOptions.forEach(input => { input.checked = input.value === (glass ? 'glass' : 'classic'); });
    if (updateUrl) {
      const url = new URL(location.href);
      if (glass) url.searchParams.set('scheme', '2');
      else url.searchParams.delete('scheme');
      history.replaceState(history.state, '', url);
    }
  }
  setHeroScheme(new URLSearchParams(location.search).get('scheme') === '2');
  schemeOptions.forEach(input => input.addEventListener('change', () => {
    if (input.checked) setHeroScheme(input.value === 'glass', true);
  }));
  addEventListener('popstate', () => setHeroScheme(new URLSearchParams(location.search).get('scheme') === '2'));
  const featureCards = [...document.querySelectorAll('.feature')];
  let scheduled = false;
  function updateScroll() {
    scheduled = false;
    header.classList.toggle('is-scrolled', scrollY > 20);
    const progress = Math.max(0, Math.min(1, -hero.getBoundingClientRect().top / 650));
    hero.style.setProperty('--hero-spread', motionOK() ? `${progress * 42}px` : '0px');
    hero.style.setProperty('--hero-angle', motionOK() ? `${progress * 3}deg` : '0deg');
    featureCards.forEach((card, i) => {
      const next = featureCards[i + 1];
      const top = 106 + i * 9;
      const overlap = next && desktop.matches && motionOK()
        ? Math.max(0, Math.min(1, 1 - (next.getBoundingClientRect().top - top) / card.offsetHeight)) : 0;
      card.style.setProperty('--stack-scale', 1 - overlap * .045);
      card.style.setProperty('--stack-shade', overlap * .11);
    });

  }
  function scheduleScroll() { if (!scheduled) { scheduled = true; requestAnimationFrame(updateScroll); } }
  addEventListener('scroll', scheduleScroll, { passive: true });
  addEventListener('resize', scheduleScroll, { passive: true });
  reducedMotion.addEventListener('change', scheduleScroll);
  updateScroll();

  // Reveal at the point of reading; leave all content visible without JS or IO.
  if ('IntersectionObserver' in window && motionOK()) {
    const reveal = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      reveal.unobserve(entry.target);
    }), { threshold: .12 });
    document.querySelectorAll('.section-heading,.feature-copy,.small-feature,.workflow-steps li,.section-top,.experience-copy,.faq-intro').forEach((node, i) => {
      node.classList.add('scroll-reveal');
      node.style.setProperty('--reveal-delay', `${node.matches('.small-feature,.workflow-steps li') ? (i % 3) * 70 : 0}ms`);
      reveal.observe(node);
    });
  }

  // One FAQ at a time, with cancelable animations for rapid repeated clicks.
  const faqs = [...document.querySelectorAll('.faq-item')];
  const faqAnimations = new WeakMap();
  function setFaq(item, open) {
    const summary = item.querySelector('summary');
    const answer = item.querySelector('.faq-answer');
    const currentHeight = answer.getBoundingClientRect().height;
    const previous = faqAnimations.get(item);
    previous?.cancel();
    faqAnimations.delete(item);
    item.dataset.expanded = String(open);
    summary.setAttribute('aria-expanded', String(open));
    if (open) item.open = true;
    if (!motionOK() || !answer.animate) {
      item.open = open;
      answer.style.height = '';
      return;
    }
    if (!open && !item.open) return;
    answer.style.height = 'auto';
    const targetHeight = open ? answer.scrollHeight : 0;
    const animation = answer.animate([
      { height: `${currentHeight}px`, opacity: open ? .25 : 1 },
      { height: `${targetHeight}px`, opacity: open ? 1 : 0 }
    ], { duration: 260, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' });
    faqAnimations.set(item, animation);
    animation.onfinish = () => {
      if (faqAnimations.get(item) !== animation) return;
      item.open = open;
      animation.cancel();
      answer.style.height = '';
      faqAnimations.delete(item);
    };
  }
  faqs.forEach(item => {
    const summary = item.querySelector('summary');
    summary.setAttribute('aria-expanded', String(item.open));
    item.dataset.expanded = String(item.open);
    summary.addEventListener('click', e => {
      e.preventDefault();
      const open = item.dataset.expanded !== 'true';
      if (open) faqs.forEach(other => { if (other !== item && other.dataset.expanded === 'true') setFaq(other, false); });
      setFaq(item, open);
    });
  });

  // A real, keyboard-accessible preview area instead of a static feature image.
  const tabs = [...document.querySelectorAll('.experience-tabs [role="tab"]')];
  const phoneLayout = matchMedia('(max-width: 700px)');
  function syncTabOrientation() {
    document.querySelector('.experience-tabs').setAttribute('aria-orientation', phoneLayout.matches ? 'horizontal' : 'vertical');
  }
  phoneLayout.addEventListener('change', syncTabOrientation);
  syncTabOrientation();
  function selectTab(tab) {
    tabs.forEach(button => {
      const selected = button === tab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(button.getAttribute('aria-controls'));
      panel.hidden = !selected;
      if (selected && motionOK()) panel.animate([
        { opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }
      ], { duration: 330, easing: 'cubic-bezier(.2,.7,.2,1)' });
    });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', e => {
      let next;
      if (['ArrowDown','ArrowRight'].includes(e.key)) next = (index + 1) % tabs.length;
      if (['ArrowUp','ArrowLeft'].includes(e.key)) next = (index + tabs.length - 1) % tabs.length;
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      e.preventDefault(); selectTab(tabs[next]); tabs[next].focus();
    });
  });
  function pressedGroup(button, selector) {
    document.querySelectorAll(selector).forEach(peer => peer.setAttribute('aria-pressed', String(peer === button)));
  }
  document.querySelectorAll('[data-demo-color]').forEach(button => button.addEventListener('click', () => {
    pressedGroup(button, '[data-demo-color]');
    document.querySelector('.style-preview').style.setProperty('--demo-accent', button.dataset.demoColor);
  }));
  document.querySelectorAll('[data-demo-cover]').forEach(button => button.addEventListener('click', () => {
    pressedGroup(button, '[data-demo-cover]');
    const image = document.querySelector('.demo-cover-image');
    image.src = `assets/homepage/preview-${button.dataset.demoCover}.webp`;
    image.alt = `当前选择：${button.dataset.coverName}封面`;
  }));
  document.querySelectorAll('[data-demo-device]').forEach(button => button.addEventListener('click', () => {
    pressedGroup(button, '[data-demo-device]');
    document.querySelector('.demo-viewport').dataset.device = button.dataset.demoDevice;
  }));
  const statuses = [
    ['✎','编辑中','完善个人信息与作品资料，随时保存你的进度。'],
    ['↗','审核中','已提交项目资料，由管理员制作作品详情并审核。'],
    ['✓','审核通过','内容已确认，你可以返回“我的模板”主动发布。'],
    ['◎','已发布','作品集已上线，可以通过链接分享给更多人。']
  ];
  document.querySelectorAll('[data-demo-status]').forEach(button => button.addEventListener('click', () => {
    pressedGroup(button, '[data-demo-status]');
    const [icon, title, description] = statuses[Number(button.dataset.demoStatus)];
    document.querySelector('.status-demo-icon').textContent = icon;
    document.querySelector('.status-demo-title').textContent = title;
    document.querySelector('.status-demo-description').textContent = description;
  }));
})();
