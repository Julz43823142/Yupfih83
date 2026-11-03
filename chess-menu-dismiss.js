// Dismiss an expanded chess menu when interacting elsewhere on the page.
(() => {
  const menus = [...document.querySelectorAll('details.mobile-chess-menu')];
  if (!menus.length) return;
  document.addEventListener('pointerdown', (event) => {
    for (const menu of menus) {
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    }
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      for (const menu of menus) {
        if (menu.open) {
          menu.open = false;
          menu.querySelector('summary')?.focus();
        }
      }
    }
  });
})();
