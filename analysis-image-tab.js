/* Keep the Image import tab in sync with PGN, FEN and Game link. */
(() => {
 const imageTab=document.getElementById('image-import-tab');
 const photoPanel=document.getElementById('position-photo-panel');
 const textPanel=document.getElementById('text-import-panel');
 if(!imageTab||!photoPanel||!textPanel)return;
 const textTabs=[...document.querySelectorAll('.tab-row [data-mode]')];
 const showImage=active=>{
  photoPanel.hidden=!active;
  textPanel.hidden=active;
  imageTab.classList.toggle('selected',active);
  imageTab.setAttribute('aria-expanded',String(active));
  imageTab.setAttribute('aria-selected',String(active));
  for(const tab of textTabs){if(active)tab.classList.remove('selected');tab.setAttribute('aria-selected',String(!active&&tab.classList.contains('selected')));}
 };
 imageTab.addEventListener('click',event=>{event.preventDefault();showImage(true);});
 for(const tab of textTabs)tab.addEventListener('click',()=>showImage(false));
 showImage(false);
})();
