// Accessible accordion: animate both opening and closing of strength tiers.
document.addEventListener('DOMContentLoaded',()=>{
 const tiers=[...document.querySelectorAll('.play-bot-tier')];
 for(const tier of tiers){
  const summary=tier.querySelector(':scope > summary');
  const content=tier.querySelector(':scope > .play-bots');
  if(!summary||!content)continue;
  const drawer=document.createElement('div'),inner=document.createElement('div');
  drawer.className='play-tier-drawer';inner.className='play-tier-drawer-inner';
  content.before(drawer);inner.append(content);drawer.append(inner);
  summary.setAttribute('aria-expanded',String(tier.open));
  summary.addEventListener('click',event=>{
   event.preventDefault();
   if(tier.dataset.closing==='true'){tier.dataset.closing='false';tier.open=true;summary.setAttribute('aria-expanded','true');return}
   if(tier.open){
    tier.dataset.closing='true';summary.setAttribute('aria-expanded','false');
    drawer.style.gridTemplateRows='0fr';drawer.style.opacity='0';
    setTimeout(()=>{if(tier.dataset.closing==='true'){tier.open=false;tier.dataset.closing='false'}drawer.style.removeProperty('grid-template-rows');drawer.style.removeProperty('opacity')},300);
   }else{tier.open=true;summary.setAttribute('aria-expanded','true')}
  });
 }
});
