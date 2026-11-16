/* The Image tab belongs to the same Game Review import workflow as PGN/FEN/link. */
(() => {
  const imageTab = document.getElementById('image-import-tab');
  const photoPanel = document.getElementById('position-photo-panel');
  const textPanel = document.getElementById('text-import-panel');
  const textTabs = [...document.querySelectorAll('.tab-row [data-mode]')];
  if (!imageTab || !photoPanel || !textPanel) return;
  function showImage(active) {
    photoPanel.hidden = !active;
    textPanel.hidden = active;
    imageTab.classList.toggle('selected', active);
    imageTab.setAttribute('aria-expanded', String(active));
    if (active) textTabs.forEach(tab => tab.classList.remove('selected'));
  }
  imageTab.addEventListener('click', () => showImage(true));
  for (const tab of textTabs) tab.addEventListener('click', () => showImage(false));
  showImage(false);
})();
