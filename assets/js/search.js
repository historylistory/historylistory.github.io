(function () {
  var searchInput = document.getElementById('search-input');
  var resultsContainer = document.getElementById('search-results');
  var searchInfo = document.getElementById('search-info');
  var index, store;
  var debounceTimer;

  // Load the search index
  fetch('/search.json')
    .then(function (response) { return response.json(); })
    .then(function (data) {
      store = data;
      index = lunr(function () {
        this.ref('url');
        this.field('title', { boost: 10 });
        this.field('category', { boost: 2 });
        this.field('subcategory', { boost: 2 });
        this.field('content');

        data.forEach(function (doc) {
          this.add(doc);
        }, this);
      });
    });

  searchInput.addEventListener('input', function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(performSearch, 300);
  });

  // Support query parameter for direct linking
  var params = new URLSearchParams(window.location.search);
  var initialQuery = params.get('q');
  if (initialQuery) {
    searchInput.value = initialQuery;
    // Wait for index to load, then search
    var waitForIndex = setInterval(function () {
      if (index) {
        clearInterval(waitForIndex);
        performSearch();
      }
    }, 100);
  }

  function performSearch() {
    var query = searchInput.value.trim();

    if (!query) {
      resultsContainer.innerHTML = '';
      searchInfo.textContent = '';
      return;
    }

    if (!index) {
      searchInfo.textContent = 'Loading search index...';
      return;
    }

    var results;
    try {
      // Try the query with a wildcard for partial matching
      results = index.search(query + '*');
      // Also try exact match and merge
      var exact = index.search(query);
      var seen = {};
      var merged = [];
      exact.concat(results).forEach(function (r) {
        if (!seen[r.ref]) {
          seen[r.ref] = true;
          merged.push(r);
        }
      });
      results = merged;
    } catch (e) {
      // If lunr query syntax fails, escape and retry
      results = index.search(query.replace(/[:\*\~\^]/g, ''));
    }

    if (results.length === 0) {
      searchInfo.textContent = 'No results found for "' + query + '"';
      resultsContainer.innerHTML = '';
      return;
    }

    searchInfo.textContent = results.length + ' result' + (results.length === 1 ? '' : 's') + ' for "' + query + '"';

    var html = '';
    var queryTerms = query.toLowerCase().split(/\s+/);

    results.slice(0, 50).forEach(function (result) {
      var doc = store.find(function (d) { return d.url === result.ref; });
      if (!doc) return;

      var snippet = getSnippet(doc.content, queryTerms);

      html += '<div class="search-result">';
      html += '<a href="' + escapeUrl(doc.url) + '" class="search-result-title">' + highlightTerms(doc.title, queryTerms) + '</a>';
      html += '<div class="search-result-breadcrumb">' + escapeHtml(titleCase(doc.category)) + ' &rsaquo; ' + escapeHtml(titleCase(doc.subcategory)) + '</div>';
      html += '<p class="search-result-snippet">' + highlightTerms(snippet, queryTerms) + '</p>';
      html += '</div>';
    });

    resultsContainer.innerHTML = html;
  }

  function getSnippet(content, terms) {
    var lower = content.toLowerCase();
    var bestPos = -1;

    // Find the first occurrence of any search term
    for (var i = 0; i < terms.length; i++) {
      var pos = lower.indexOf(terms[i]);
      if (pos !== -1 && (bestPos === -1 || pos < bestPos)) {
        bestPos = pos;
      }
    }

    if (bestPos === -1) {
      return content.substring(0, 200) + '...';
    }

    var start = Math.max(0, bestPos - 80);
    var end = Math.min(content.length, bestPos + 200);
    var snippet = content.substring(start, end);

    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';

    return snippet;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeUrl(url) {
    // Only allow relative and http(s) URLs — block javascript:, data:, etc.
    if (/^https?:\/\//.test(url) || url.charAt(0) === '/') {
      return escapeHtml(url);
    }
    return '#';
  }

  function highlightTerms(text, terms) {
    var escaped = escapeHtml(text);
    terms.forEach(function (term) {
      if (term.length < 2) return;
      var re = new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      escaped = escaped.replace(re, '<mark>$1</mark>');
    });
    return escaped;
  }

  function titleCase(str) {
    return str.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
})();
