// Replace resumeUrl with your Feishu file sharing URL when the resume is ready.
// Both the header and footer Resume links use this setting.
const portfolioConfig = {
  resumeUrl: "https://drewhansen.design/Drew-Hansen-Resume.pdf",
};

document.querySelectorAll("[data-resume-link]").forEach((link) => {
  link.href = portfolioConfig.resumeUrl;
});

document.documentElement.classList.add("js");

// On return, cards must be fully painted before the browser captures the
// destination snapshot; entrance animations must not replay over the shrink.
let returningFromCase = false;
try {
  const navigation = JSON.parse(sessionStorage.getItem('portfolio-case-navigation') || 'null');
  returningFromCase = Boolean(navigation?.returning && navigation.sourcePath === location.pathname) || document.documentElement.classList.contains('case-crossfade-return');
} catch {}

const revealItems = document.querySelectorAll(".reveal");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Prepare offscreen items before they enter the viewport, so entry never
// jumps from an already-visible state back to the beginning of the animation.
if ("IntersectionObserver" in window && !prefersReducedMotion && Element.prototype.animate) {
  const pending = new Map();
  const timing = { duration: 1200, easing: "cubic-bezier(.22,.61,.36,1)" };
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const animations = pending.get(entry.target);
      if (animations) animations.forEach((animation) => animation.play());
      pending.delete(entry.target);
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -60px 0px", threshold: 0 });

  revealItems.forEach((item) => {
    const box = item.getBoundingClientRect();
    // Preserve the restored viewport during a case return; offscreen items
    // still get their own entrance when the visitor continues scrolling.
    if (returningFromCase && box.top < window.innerHeight) {
      item.classList.add("is-visible");
      return;
    }
    const animations = [item.animate([{ opacity: 0 }, { opacity: 1 }], timing)];
    // Keep the card background and hover transform stable; move its content only.
    const motionTargets = item.classList.contains("project-card") ? [...item.children] : [item];
    motionTargets.forEach((target) => {
      animations.push(target.animate([{ translate: "0 48px" }, { translate: "0 0" }], timing));
    });
    animations.forEach((animation) => { animation.pause(); animation.currentTime = 0; });
    pending.set(item, animations);
    revealObserver.observe(item);
  });
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    pending.forEach((animations, item) => {
      const box = item.getBoundingClientRect();
      if (box.top >= window.innerHeight || box.bottom <= 0) return;
      animations.forEach((animation) => animation.finish());
      item.classList.add("is-visible");
      revealObserver.unobserve(item);
      pending.delete(item);
    });
  });
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = document.querySelector(link.getAttribute("href"));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", link.getAttribute("href"));
  });
});

// Page navigation uses independent HTML documents; active state is defined in each page.

// Fit full cover titles without wrapping, clipping or ellipsis.
const coverTitles = document.querySelectorAll(".project-copy h3");
function fitCoverTitles() {
  coverTitles.forEach((title) => {
    title.style.removeProperty("font-size");
    const available = title.clientWidth;
    const natural = title.scrollWidth;
    if (available > 0 && natural > available) {
      const size = parseFloat(getComputedStyle(title).fontSize);
      title.style.fontSize = `${Math.floor(size * available / natural * 10) / 10}px`;
    }
  });
}
fitCoverTitles();
if ("ResizeObserver" in window) {
  const titleSizer = new ResizeObserver(fitCoverTitles);
  document.querySelectorAll(".project-copy").forEach((copy) => titleSizer.observe(copy, { box: "border-box" }));
} else window.addEventListener("resize", fitCoverTitles);
if (document.fonts) document.fonts.ready.then(fitCoverTitles);

// Derive the homepage ambience from the first displayed project cover.
(() => {
  const ambient = document.querySelector('.hero-ambient');
  const grid = document.querySelector('.work-grid');
  if (!ambient || !grid) return;
  function toHsl([r,g,b]) {
    r/=255;g/=255;b/=255;
    const hi=Math.max(r,g,b),lo=Math.min(r,g,b),d=hi-lo,l=(hi+lo)/2;
    if (!d) return [0,0,l];
    const s=d/(1-Math.abs(2*l-1));
    let h=hi===r?((g-b)/d)%6:hi===g?(b-r)/d+2:(r-g)/d+4;
    return [(h*60+360)%360,s,l];
  }
  function toRgb([h,s,l]) {
    const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;
    const base=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
    return base.map(v=>Math.round((v+m)*255));
  }
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  function parse(color) {
    if (!ctx) return null;
    ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);
    const pixel=[...ctx.getImageData(0,0,1,1).data];
    return pixel[3]>100?pixel.slice(0,3):null;
  }
  function sync() {
    const card=[...grid.querySelectorAll('.project-card')].find(el=>getComputedStyle(el).display!=='none');
    if (!card) return;
    const css=getComputedStyle(card),solid=parse(css.backgroundColor);
    const stops=(css.backgroundImage.match(/#[\da-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi)||[]).map(parse).filter(Boolean);
    const candidates=[solid,...stops].filter(Boolean);
    const ranked=candidates.map(rgb=>({rgb,hsl:toHsl(rgb)})).filter(c=>c.hsl[1]>.16&&c.hsl[2]>.07&&c.hsl[2]<.94);
    ranked.sort((a,b)=>(b.hsl[1]*Math.min(b.hsl[2],.6))-(a.hsl[1]*Math.min(a.hsl[2],.6)));
    const primary=ranked[0]?.rgb||solid||[77,139,255];
    const [h,s,l]=toHsl(primary);
    const secondary=toRgb([(h-22+360)%360,Math.max(.35,s*.9),Math.min(.62,Math.max(.35,l))]);
    const key=primary.join(',')+'|'+secondary.join(',');
    if (ambient.dataset.palette===key) return;
    ambient.dataset.palette=key;
    ambient.style.setProperty('--ambient-primary',primary.join(' '));
    ambient.style.setProperty('--ambient-secondary',secondary.join(' '));
  }
  sync();
  let pending=false;
  new MutationObserver(()=>{if(!pending){pending=true;requestAnimationFrame(()=>{pending=false;sync()})}}).observe(grid,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden']});
})();
