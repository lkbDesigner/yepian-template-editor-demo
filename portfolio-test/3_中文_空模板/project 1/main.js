const navLinks=[...document.querySelectorAll('.chapter-links a')];
const sections=navLinks.map(a=>document.querySelector(a.hash));
let framePending=false;
function updateNavigation(){document.querySelector('.case-nav').classList.toggle('is-stuck',document.querySelector('.case-nav').getBoundingClientRect().top<=0);let current=sections[0];sections.forEach(s=>{if(s.getBoundingClientRect().top<innerHeight*.38)current=s});navLinks.forEach(a=>{const active=a.hash==='#'+current.id;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current')});framePending=false}
addEventListener('scroll',()=>{if(!framePending){framePending=true;requestAnimationFrame(updateNavigation)}},{passive:true});addEventListener('resize',updateNavigation);updateNavigation();
document.querySelectorAll('[data-theme]').forEach(button=>button.addEventListener('click',()=>{document.querySelector('.logo-preview').dataset.logoTheme=button.dataset.theme;document.querySelectorAll('[data-theme]').forEach(b=>{const on=b===button;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on))})}));
function selectApplication(button,focus=false){document.querySelectorAll('[data-application]').forEach(b=>{const active=b===button;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;document.getElementById(b.getAttribute('aria-controls')).hidden=!active});if(focus)button.focus()}
const appButtons=[...document.querySelectorAll('[data-application]')];appButtons.forEach((button,i)=>{button.tabIndex=i===0?0:-1;button.addEventListener('click',()=>selectApplication(button));button.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(i+1)%appButtons.length;if(event.key==='ArrowLeft')next=(i-1+appButtons.length)%appButtons.length;if(event.key==='Home')next=0;if(event.key==='End')next=appButtons.length-1;if(next!==undefined){event.preventDefault();selectApplication(appButtons[next],true)}})});
function toast(message){const el=document.querySelector('.toast');el.textContent=message;el.classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('visible'),2200)}
document.querySelectorAll('[data-color]').forEach(button=>button.addEventListener('click',async()=>{const color=button.dataset.color;try{if(!navigator.clipboard||!window.isSecureContext)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(color);toast('已复制色值 '+color)}catch{toast('色值：'+color+'（可直接选中文字复制）')}}));

// Reveal each section once. Prepare only offscreen content, so loading and
// browser back never pull an already-visible section away from its position.
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window) || !Element.prototype.animate) return;
  const items = [...document.querySelectorAll([
    '.section-heading', '.intro-grid > *', '.principles > *',
    '.chapter-divider > h2', '.chapter-divider > p', '.divider-mark',
    '.identity-board', '.identity-rationale', '.subsection-heading',
    '.logo-preview', '.logo-variants > *', '.standards-grid > *',
    '.statement-inner', '.shell-pattern', '.color-board > *',
    '.typography-board > *', '.graphic-panels > *', '.application-tabs',
    '.app-stage', '.application-pair > *', '.architecture-stage',
    '.digital-words', '.brand-phone', '.closing-copy', '.closing-banner', '.credits'
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
