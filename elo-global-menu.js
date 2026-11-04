// Keep tool-page navigation consistent without changing the homepage.
(()=>{
 if(location.pathname==='/'||location.pathname==='/index.html')return;
 const header=document.querySelector('header.navbar');if(!header)return;
 document.body.classList.add('elo-subpage');
 const previous=header.querySelectorAll('.mobile-chess-menu,.play-nav,.puzzles-site-nav');
 previous.forEach(el=>el.remove());
 const routes=[['Home','/'],['Play','/play.html'],['Analyse','/analysis.html'],['Player Prep','/player-prep.html'],['Puzzels','/puzzles.html'],['Mini Games','/minigames.html']];
 const details=document.createElement('details');details.className='elo-global-menu';
 const summary=document.createElement('summary');summary.setAttribute('aria-label','Open navigatiemenu');
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','2');svg.setAttribute('stroke-linecap','round');
 for(const d of ['M4 7h16','M4 12h16','M4 17h16']){const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',d);svg.append(p)}
 const caption=document.createElement('span');caption.textContent='Menu';summary.append(svg,caption);
 const nav=document.createElement('nav');nav.setAttribute('aria-label','Chess Tools');
 routes.forEach(([name,href])=>{const a=document.createElement('a');a.textContent=name;a.href=href;if(location.pathname===href||((location.pathname==='/puzzle-top100.html')&&href==='/puzzles.html')||(location.pathname==='/knight-maze.html'&&href==='/minigames.html')||(location.pathname==='/opening-explorer.html'&&href==='/analysis.html'))a.setAttribute('aria-current','page');nav.append(a)});
 const current=nav.querySelector('a[aria-current="page"]');
 if(current){
  document.body.dataset.activeTool=current.textContent.toLowerCase().replace(/\s+/g,'-');
  summary.setAttribute('aria-label','Open navigatiemenu. Current page: '+current.textContent);
  caption.textContent='Menu · '+current.textContent;
 }
 details.append(summary,nav);header.append(details);
 document.addEventListener('pointerdown',e=>{if(details.open&&!details.contains(e.target))details.open=false});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&details.open){details.open=false;summary.focus()}});
})();
