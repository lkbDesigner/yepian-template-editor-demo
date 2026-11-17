
const search=document.querySelector('input[placeholder="Search…"]');
search.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();let count=0;document.querySelectorAll('.portfolio-card').forEach(card=>{card.hidden=!card.dataset.search.toLowerCase().includes(q);if(!card.hidden)count++});document.querySelectorAll('.review-card').forEach(card=>card.hidden=!!q);document.getElementById('empty-state').hidden=count!==0;});
