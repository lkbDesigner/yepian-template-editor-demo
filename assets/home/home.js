const templates = [
  {id:'mono',number:'01',name:'Mono',title:'把留白，留给作品。',category:'minimal',tag:'极简 · 个人作品集',colors:['#eeede7','#bfc7b3','#242724'],description:'用克制的字体、宽松的留白和大幅作品画面，把注意力交还给你的设计。适合产品与体验设计作品的呈现。'},
  {id:'index',number:'02',name:'Index',title:'有条理，也有自己的秩序。',category:'minimal',tag:'栅格 · 产品设计',colors:['#cfe1f0','#ddf0ca','#24232c'],description:'清晰的栅格与项目索引，让多份作品井然有序。适合展示完整案例、设计系统与复杂产品。'},
  {id:'forma',number:'03',name:'Forma',title:'大胆一点，很像你。',category:'expressive',tag:'高对比 · 品牌创意',colors:['#2524e9','#f5fb7c','#ff8cce'],description:'大胆的标题、高对比配色与直接的视觉表达，为品牌、视觉传达和创意项目留出发挥的空间。'},
  {id:'folio',number:'04',name:'Folio',title:'让每个项目，都有故事。',category:'editorial',tag:'杂志感 · 案例叙事',colors:['#eee8de','#b75836','#8d9e76'],description:'像翻阅一本设计杂志，以细腻的排版和有节奏的图文，串起项目背景、设计过程与最终呈现。'},
  {id:'canvas',number:'05',name:'Canvas',title:'不止一面，自由表达。',category:'expressive',tag:'活泼 · 插画与视觉',colors:['#d9caff','#ffa561','#6842bf'],description:'柔和底色搭配富有个性的图形，让插画、视觉实验与多元创作在同一个空间里自由生长。'},
  {id:'sunday',number:'06',name:'Sunday',title:'温柔呈现，日常灵感。',category:'editorial',tag:'自然 · 生活方式',colors:['#edf0e6','#304f3c','#d4b590'],description:'温暖的自然色、舒展的图文模块，为生活方式、物件与品牌故事创造一个安静的展示空间。',live:true}
];
const grid=document.getElementById('template-grid');
const dialog=document.getElementById('preview-dialog');
let opener;
function renderCards(filter='all') {
  const visible=templates.filter(t=>filter==='all'||t.category===filter);
  grid.innerHTML=visible.map(t=>`<article class="template-card"><button class="template-cover" data-preview="${t.id}" aria-label="预览 ${t.name}：${t.title}"><img src="./assets/home/${t.id}.svg" alt="${t.name} 网页风格封面" loading="lazy" width="1200" height="800"><span class="cover-label">${t.live?'可体验示例':'风格预览'}</span><span class="cover-hover">展开预览 <span aria-hidden="true">↗</span></span></button><div class="card-body"><div class="card-top"><span class="template-number">${t.number}</span><h3>${t.name}</h3><span class="color-dots" aria-label="配色示例">${t.colors.map(c=>`<i style="background:${c}"></i>`).join('')}</span><button class="card-arrow" data-preview="${t.id}" aria-label="查看 ${t.name}">↗</button></div><p class="card-tag">${t.tag}</p><p class="card-description">${t.title}</p></div></article>`).join('');
  document.getElementById('filter-status').textContent=`显示 ${visible.length} 个模板`;
}
function openPreview(id,element) {
  const t=templates.find(t=>t.id===id);if(!t)return;
  opener=element;
  document.getElementById('preview-image').src=`./assets/home/${t.id}.svg`;
  document.getElementById('preview-image').alt=`${t.name} 网页风格大图`;
  document.getElementById('preview-kicker').textContent=`NO. ${t.number} / ${t.tag}`;
  document.getElementById('preview-title').textContent=t.name+' — '+t.title;
  document.getElementById('preview-description').textContent=t.description;
  document.getElementById('preview-availability').textContent=t.live?'已有完整示例，可进入现有编辑器体验。':'这是设计风格预览，完整展示页与空白模板将在下一步制作。';
  const actions=document.getElementById('preview-actions');actions.replaceChildren();
  if(t.live){const a=document.createElement('a');a.className='primary-button';a.href='./studio.html';a.textContent='查看完整示例 ↗';actions.append(a)}
  else{const label=document.createElement('span');label.className='upcoming';label.textContent='完整模板即将开放';actions.append(label)}
  const close=document.createElement('button');close.className='secondary-button';close.textContent='继续浏览';close.addEventListener('click',()=>dialog.close());actions.append(close);
  dialog.showModal();document.body.classList.add('modal-open');
}
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button))});renderCards(button.dataset.filter);
}));
grid.addEventListener('click',e=>{const button=e.target.closest('[data-preview]');if(button)openPreview(button.dataset.preview,button)});
dialog.querySelector('.close-dialog').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
dialog.addEventListener('close',()=>{document.body.classList.remove('modal-open');opener?.focus()});
renderCards();
