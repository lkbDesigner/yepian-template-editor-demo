const dialog=document.querySelector('.image-viewer'),image=document.getElementById('viewer-image'),caption=document.getElementById('viewer-caption');
const figures=[...document.querySelectorAll('[data-slide]')];let active=0,opener;
function showFigure(index){active=index;const source=figures[index];image.src=source.querySelector('img').src;image.alt=source.querySelector('img').alt;caption.textContent=source.querySelector('b').textContent;document.getElementById('prev-slide').disabled=index===0;document.getElementById('next-slide').disabled=index===figures.length-1;document.querySelector('.viewer-scroll').scrollTop=0;}
figures.forEach((button,index)=>button.addEventListener('click',()=>{opener=button;showFigure(index);dialog.showModal();document.body.classList.add('viewer-open');}));
document.getElementById('close-viewer').addEventListener('click',()=>dialog.close());
document.getElementById('prev-slide').addEventListener('click',()=>{if(active>0)showFigure(active-1)});
document.getElementById('next-slide').addEventListener('click',()=>{if(active<figures.length-1)showFigure(active+1)});
dialog.addEventListener('keydown',event=>{if(event.key==='ArrowRight'&&active<figures.length-1){event.preventDefault();showFigure(active+1)}if(event.key==='ArrowLeft'&&active>0){event.preventDefault();showFigure(active-1)}});
dialog.addEventListener('close',()=>{document.body.classList.remove('viewer-open');opener?.focus({preventScroll:true});});
dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
const navLinks=[...document.querySelectorAll('.chapter-links a')],sections=navLinks.map(a=>document.querySelector(a.hash));let pending=false;
function updateChapter(){document.querySelector('.chapter-nav').classList.toggle('is-stuck',document.querySelector('.chapter-nav').getBoundingClientRect().top<=0);let current=sections[0];sections.forEach(s=>{if(s.getBoundingClientRect().top<innerHeight*.35)current=s;});navLinks.forEach(a=>{if(a.hash==='#'+current.id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});pending=false;}
addEventListener('scroll',()=>{if(!pending){pending=true;requestAnimationFrame(updateChapter)}},{passive:true});updateChapter();

addEventListener('resize',updateChapter);

// Reveal each section once. Prepare only offscreen content, so loading and
// browser back never pull an already-visible section away from its position.
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window) || !Element.prototype.animate) return;
  const items = [...document.querySelectorAll([
    '.section-top', '.intro-grid > *', '.facts', '.design-figure',
    '.principles article', '.solution-heading > *', '.feature-intro', '.flow',
    '.prototype', '.reflection-list article', '.closing-line', '.source-note'
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
    if (!item.getClientRects().length || item.getBoundingClientRect().top < innerHeight) return;
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
