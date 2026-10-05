/* Small code-native icons, styled with the app's pastel palette. */
(function () {
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/><path d="m1 10 11-9 11 9"/>',
    book: '<path d="M12 5c-3-3-7-3-10-2v16c4-1 7 0 10 2 3-2 6-3 10-2V3c-3-1-7-1-10 2Z"/><path d="M12 5v16"/>',
    plane: '<path d="m22 12-9 2-4 8H6l2-8-6-2 6-2-2-8h3l4 8Z"/>',
    user: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2Z"/>',
    archive: '<rect x="3" y="6" width="18" height="15" rx="3"/><path d="M5 3h14M9 11c2-3 3 0 3 0s2-3 4-1c2 2-4 5-4 5s-5-2-3-4Z"/>',
    folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    send: '<path d="m3 3 19 9-19 9 4-9Z"/><path d="M7 12h15"/>',
    star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
    sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM21 2v4M19 4h4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6M17 2v6M3 11h18M7 15h1M12 15h1M17 15h1M7 18h1M12 18h1"/>',
    tags: '<path d="M3 7h6M6 4v6M13 7h8M3 15h18M3 21h12"/>',
    shuffle: '<path d="M3 6h3c5 0 7 12 12 12h3M18 15l3 3-3 3M3 18h3c2 0 3-2 5-5M13 8c2-2 3-2 5-2h3M18 3l3 3-3 3"/>',
    map: '<path d="m2 5 7-3 6 3 7-3v17l-7 3-6-3-7 3ZM9 2v17M15 5v17"/>',
    smile: '<circle cx="12" cy="12" r="10"/><path d="M7 14c3 5 7 5 10 0M8 8h.1M16 8h.1"/>',
    chart: '<path d="M12 2v10h10A10 10 0 0 0 12 2Z"/><path d="M8 3a10 10 0 1 0 13 13"/>',
    photo: '<rect x="2" y="3" width="20" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m2 18 6-6 4 4 4-5 6 7"/>',
    video: '<rect x="2" y="5" width="14" height="14" rx="3"/><path d="m16 10 6-4v12l-6-4"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    arrow: '<path d="M3 12h18m-6-6 6 6-6 6"/>',
    plus: '<path d="M12 3v18M3 12h18"/>',
    refresh: '<path d="M20 7V2l-4 4a9 9 0 1 0 4 11M20 2h-5"/>',
    heart: '<path d="M20 4c-4-4-8 1-8 1S8 0 4 4c-5 5 8 16 8 16S25 9 20 4Z"/>',
    cloud: '<path d="M7 19a5 5 0 1 1-1-10 6 6 0 0 1 12-1 5 5 0 0 1 0 11Z"/>'
  };
  window.LoveIcon = (name, className = '') => `<svg class="app-icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.heart}</svg>`;
})();
