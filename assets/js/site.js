// Close mobile nav on small screens; scroll sidebar on desktop
(function () {
  if (window.innerWidth <= 960) {
    var nav = document.querySelector('.mobile-nav-toggle');
    if (nav) nav.removeAttribute('open');
  } else {
    // On desktop, scroll the sidebar so the active subcategory is visible
    var active = document.querySelector('.sidebar-subcategory[open] > summary')
              || document.querySelector('.sidebar-category[open] > summary');
    if (active) {
      active.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  }
})();

// Append Wayback Machine archive links next to external links
(function () {
  var links = document.querySelectorAll('#main-content a[href^="http"]');
  for (var i = 0; i < links.length; i++) {
    var a = links[i];
    // Skip links that are inside nav, breadcrumbs, or cards
    if (a.closest('.breadcrumb, .link-card, .sidebar-nav')) continue;
    // Open external links in a new tab
    if (a.hostname !== location.hostname) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    // Skip links that already point to web.archive.org
    if (a.hostname === 'web.archive.org') continue;
    var archiveUrl = 'https://web.archive.org/web/' + a.href;
    var archiveLink = document.createElement('a');
    archiveLink.href = archiveUrl;
    archiveLink.className = 'archive-link';
    archiveLink.target = '_blank';
    archiveLink.rel = 'noopener noreferrer';
    archiveLink.textContent = '[archive]';
    archiveLink.title = 'View on Wayback Machine';
    a.after(archiveLink);
  }
})();
