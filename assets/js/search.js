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

    // Common English stop words that inflate results
    var stopWords = ['a','an','the','and','or','but','in','on','at','to','for',
      'of','with','by','from','is','it','as','be','was','are','were','been',
      'has','had','do','does','did','will','would','could','should','may',
      'might','shall','can','this','that','these','those','he','she','his',
      'her','him','they','them','their','we','our','us','its','my','your',
      'who','which','what','where','when','how','not','no','so','if','then',
      'than','too','very','just','about','up','out','into','over','after'];

    var queryLower = query.toLowerCase();
    var allTerms = queryLower.split(/\s+/).filter(function (t) { return t.length > 0; });
    // Filter stop words but keep them if they're ALL the user typed
    var searchTerms = allTerms.filter(function (t) { return stopWords.indexOf(t) === -1; });
    if (searchTerms.length === 0) searchTerms = allTerms;

    var results;
    try {
      // Search each meaningful term individually with wildcards
      var docScores = {};
      var docMatches = {};

      searchTerms.forEach(function (term) {
        var safeTerm = term.replace(/[:\*\~\^]/g, '');
        if (!safeTerm) return;

        var termResults = [];
        try {
          termResults = index.search('*' + safeTerm + '*');
        } catch (e) {
          try { termResults = index.search(safeTerm); } catch (e2) { /* skip */ }
        }

        termResults.forEach(function (r) {
          if (!docScores[r.ref]) {
            docScores[r.ref] = 0;
            docMatches[r.ref] = 0;
          }
          docScores[r.ref] += r.score;
          docMatches[r.ref] += 1;
        });
      });

      // Phrase boost: check actual content for the full query or consecutive terms
      var phraseBoost = {};
      if (allTerms.length > 1) {
        Object.keys(docScores).forEach(function (ref) {
          var doc = store.find(function (d) { return d.url === ref; });
          if (!doc) return;
          var content = (doc.title + ' ' + doc.content).toLowerCase();

          // Full phrase match — massive boost
          if (content.indexOf(queryLower) !== -1) {
            phraseBoost[ref] = 1000;
          } else {
            // Check for consecutive term pairs — partial phrase boost
            var pairCount = 0;
            for (var i = 0; i < allTerms.length - 1; i++) {
              var pair = allTerms[i] + ' ' + allTerms[i + 1];
              if (content.indexOf(pair) !== -1) pairCount++;
            }
            if (pairCount > 0) {
              phraseBoost[ref] = pairCount * 100;
            }
          }
        });
      }

      // Sort: phrase boost first, then term matches, then Lunr score
      results = Object.keys(docScores).map(function (ref) {
        return {
          ref: ref,
          score: docScores[ref],
          matches: docMatches[ref],
          phrase: phraseBoost[ref] || 0
        };
      }).sort(function (a, b) {
        if (b.phrase !== a.phrase) return b.phrase - a.phrase;
        if (b.matches !== a.matches) return b.matches - a.matches;
        return b.score - a.score;
      });
    } catch (e) {
      // Final fallback
      try {
        results = index.search(query.replace(/[:\*\~\^]/g, ''));
      } catch (e2) {
        results = [];
      }
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

    // First try to find the full phrase
    var fullPhrase = terms.join(' ');
    var phrasePos = lower.indexOf(fullPhrase);
    if (phrasePos !== -1) {
      bestPos = phrasePos;
    }

    // Otherwise find the first occurrence of any search term
    if (bestPos === -1) {
      for (var i = 0; i < terms.length; i++) {
        var pos = lower.indexOf(terms[i]);
        if (pos !== -1 && (bestPos === -1 || pos < bestPos)) {
          bestPos = pos;
        }
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
