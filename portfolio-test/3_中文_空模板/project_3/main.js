const dialog=document.querySelector('dialog'),large=document.getElementById('large-image'),caption=document.getElementById('image-caption');let opener;
document.querySelectorAll('[data-image]').forEach(button=>button.addEventListener('click',()=>{opener=button;large.src=button.dataset.image;large.alt=button.querySelector('img').alt;caption.textContent=button.querySelector('span').textContent.replace(' ↗','');dialog.showModal();document.body.classList.add('viewer-open');document.querySelector('.viewer-content').scrollTop=0;}));
document.getElementById('close-viewer').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{document.body.classList.remove('viewer-open');opener?.focus({preventScroll:true});});dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
const links=[...document.querySelectorAll('.chapter-links a')],sections=links.map(a=>document.querySelector(a.hash));let pending=false;
function update(){document.querySelector('.chapter-nav').classList.toggle('is-stuck',document.querySelector('.chapter-nav').getBoundingClientRect().top<=0);let active=sections[0];sections.forEach(s=>{if(s.getBoundingClientRect().top<innerHeight*.35)active=s;});links.forEach(a=>{if(a.hash==='#'+active.id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});pending=false;}
addEventListener('scroll',()=>{if(!pending){pending=true;requestAnimationFrame(update)}},{passive:true});addEventListener('resize',update);update();

// Reveal each section once. Prepare only offscreen content, so loading and
// browser back never pull an already-visible section away from its position.
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window) || !Element.prototype.animate) return;
  const items = [...document.querySelectorAll([
    '.section-top', '.intro-grid > *', '.questions article',
    '.feature-heading > *', '.comparison-label', '.screens .screen',
    '.order-overview > *', '.reflection article', '.takeaway', '.closing', '.source'
  ].join(','))];
  const queued = new Map();
  const running = new Set();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const animation = queued.get(entry.target);
      if (animation) {
        queued.delete(entry.target);
        running.add(animation);
        entry.target.dataset.reveal = 'playing';
        animation.play();
        animation.finished.then(() => {
          entry.target.dataset.reveal = 'complete';
          running.delete(animation);
          animation.cancel();
        }).catch(() => {});
      }
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -45px 0px', threshold: 0 });
  items.forEach(item => {
    if (item.getBoundingClientRect().top < innerHeight) return;
    const peers = [...item.parentElement.children];
    let delay = Math.min(peers.indexOf(item) * 120, 240);
    const side = item.closest('.comparison-side');
    if (side) delay = (side === side.parentElement.firstElementChild ? 0 : 140) +
      (item.classList.contains('screen') ? peers.indexOf(item) * 100 : 0);
    const animation = item.animate([
      { opacity: 0, translate: '0 36px' },
      { opacity: 1, translate: '0 0' }
    ], { duration: 1050, delay, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both' });
    animation.pause();
    animation.currentTime = 0;
    item.dataset.reveal = 'waiting';
    queued.set(item, animation);
    observer.observe(item);
  });
  function finishReveals() {
    observer.disconnect();
    queued.forEach((animation, item) => {
      animation.cancel();
      item.dataset.reveal = 'complete';
    });
    queued.clear();
    running.forEach(animation => animation.cancel());
    running.clear();
  }
  addEventListener('pagehide', finishReveals);
  addEventListener('pageshow', event => { if (event.persisted) finishReveals(); });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => {
    if (event.matches) finishReveals();
  });
})();
