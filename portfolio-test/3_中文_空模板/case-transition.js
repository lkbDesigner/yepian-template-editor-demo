(() => {
  const key='portfolio-case-navigation';
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const here=location.pathname;
  const native='onpagereveal' in window&&CSS.supports('view-transition-name','portfolio-case')&&/^https?:$/.test(location.protocol);
  const read=()=>{try{return JSON.parse(sessionStorage.getItem(key)||'null')}catch{return null}};
  const store=value=>{try{sessionStorage.setItem(key,JSON.stringify(value))}catch{}};
  const clear=()=>{try{sessionStorage.removeItem(key)}catch{}};
  const selected=state=>state&&[...document.querySelectorAll('.project-card')].find(c=>c.getAttribute('href')===state.href);
  function noNativeNavigation(){
    if(document.getElementById('case-return-no-native'))return;
    const style=document.createElement('style');style.id='case-return-no-native';style.textContent='@view-transition{navigation:none;}';document.head.append(style);
  }
  const initial=read();
  // Disable competing browser snapshots before the destination's first paint.
  if(initial?.returning&&initial.sourcePath===here)document.documentElement.classList.add('case-crossfade-return');
  const full=()=>({left:'0px',top:'0px',width:innerWidth+'px',height:innerHeight+'px',borderRadius:'0px'});
  const box=card=>{const r=card.getBoundingClientRect();return{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',borderRadius:getComputedStyle(card).borderRadius}};
  function overlay(card,from,to,returning=false){
    const clone=card.cloneNode(true);clone.removeAttribute('href');clone.removeAttribute('id');clone.setAttribute('aria-hidden','true');clone.inert=true;
    clone.classList.add('case-zoom-overlay','is-visible');clone.style.viewTransitionName='none';clone.style.opacity='1';
    if(returning) clone.style.boxShadow='none';
    clone.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
    clone.querySelectorAll('*').forEach(el=>{el.style.translate='none'});
    Object.assign(clone.style,from);document.body.append(clone);
    const geometry=clone.animate([from,to],{duration:returning?900:800,easing:'cubic-bezier(.22,.61,.36,1)',fill:'both'});
    // Geometry starts immediately, while the large cover is still transparent.
    // It becomes visible during the shrink rather than flashing full-screen.
    if(returning)clone.animate([{opacity:0},{opacity:1}],{duration:340,easing:'ease-out',fill:'both'});
    const animation=geometry;
    return animation.finished.catch(()=>{}).then(()=>{if(returning)clone.remove()});
  }
  function restore(card,state){
    document.documentElement.classList.add('case-returning');
    const top=Number.isFinite(state.cardTop)?card.getBoundingClientRect().top+scrollY-state.cardTop:state.scrollY;
    scrollTo({left:0,top,behavior:'instant'});
  }
  let returnStarted=false;
  function runReturn(){
    const state=read();if(!state||state.sourcePath!==here||returnStarted)return;
    const card=selected(state);if(!card){clear();return}
    returnStarted=true;restore(card,state);
    document.querySelectorAll('.project-card').forEach(c=>{c.style.removeProperty('view-transition-name');c.classList.add('is-visible')});
    if(reduced){clear();document.documentElement.classList.remove('case-returning');return}
    // The native root transition crossfades the two real viewport snapshots.
    // Keep the homepage fully painted: no clones, hidden cards or layout motion.
    if(!native){
      const fade=document.body.animate([{opacity:0},{opacity:1}],{duration:650,easing:'ease-out'});
      fade.finished.catch(()=>{}).finally(()=>{document.documentElement.classList.remove('case-returning','case-crossfade-return');clear()});
    }
  }
  function markCover(){
    const state=read(),cover=document.querySelector('.cover');
    if(cover&&state&&new URL(state.destination).pathname===here){
      cover.style.viewTransitionName='portfolio-case';
      document.querySelectorAll('a.back,footer>a:first-child').forEach(a=>a.href=new URL('index.html',state.source).href);
    }
  }
  function bind(){
    const state=read();
    if(state?.sourcePath===here&&(state.returning||state.mode==='overlay'))runReturn();
    else markCover();
    const origin=read();
    let leaving=false;
    if(origin&&new URL(origin.destination).pathname===here){
      document.querySelectorAll('a.back,footer>a:first-child').forEach(a=>a.addEventListener('click',event=>{
        if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
        if(leaving){event.preventDefault();return}
        const destination=new URL(a.href);
        store({...origin,returning:true,source:destination.href,sourcePath:destination.pathname});
        leaving=true; // Navigate immediately; no outgoing animation or wait.
        // Let the destination animate a real card. Never name an offscreen hero
        // or the full document root, and never scroll the case back to its top.
        document.getElementById('case-return-no-native')?.remove();
        document.querySelector('.cover')?.style.removeProperty('view-transition-name');
      }));
    }
    document.querySelectorAll('.project-card').forEach(card=>card.addEventListener('click',event=>{
      if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||reduced)return;
      document.getElementById('case-return-no-native')?.remove();
      const url=new URL(card.href),useNative=native&&url.origin===location.origin;
      document.querySelectorAll('.project-card').forEach(c=>c.style.removeProperty('view-transition-name'));
      store({source:location.href,sourcePath:here,href:card.getAttribute('href'),destination:url.href,scrollY,cardTop:card.getBoundingClientRect().top,mode:useNative?'native':'overlay'});
      if(useNative){card.style.viewTransitionName='portfolio-case';return}
      event.preventDefault();if(document.querySelector('.case-zoom-overlay'))return;
      overlay(card,box(card),full()).then(()=>location.assign(url.href));
    }));
  }
  document.addEventListener('DOMContentLoaded',bind,{once:true});
  addEventListener('pagereveal',event=>{
    const state=read();
    if(state?.sourcePath===here&&state.returning){
      runReturn();
      if(event.viewTransition)event.viewTransition.finished.finally(()=>{
        clear();document.documentElement.classList.remove('case-returning','case-crossfade-return');
      });
      else {clear();document.documentElement.classList.remove('case-returning','case-crossfade-return')}
      return;
    }
    markCover();
    // Browser Back (rather than the explicit return control) keeps its native
    // restoration and must not capture a hidden entrance animation.
    if(event.viewTransition&&state?.sourcePath===here){
      const card=selected(state);if(card){restore(card,state);card.style.viewTransitionName='portfolio-case'}
      event.viewTransition.finished.finally(()=>{clear();document.documentElement.classList.remove('case-returning')});
    }
  });
  addEventListener('pageshow',event=>{
    if(!event.persisted)return;
    document.body.getAnimations().forEach(animation=>animation.cancel());
    document.querySelectorAll('.case-zoom-overlay').forEach(el=>el.remove());
    document.querySelectorAll('.project-card').forEach(c=>c.style.removeProperty('visibility'));
    returnStarted=false;const state=read();if(state?.sourcePath===here&&state.returning)runReturn();
  });
})();
