/* Mwasa Musiki : menu mobile, année du pied de page, événements passés masqués. */
(function () {
  var b = document.getElementById('burger'), m = document.getElementById('menu');
  if (b && m) {
    var set = function (open) { m.classList.toggle('open', open); b.setAttribute('aria-expanded', open ? 'true' : 'false'); };
    b.addEventListener('click', function () { set(!m.classList.contains('open')); });
    m.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
  }
  var y = document.getElementById('annee');
  if (y) y.textContent = new Date().getFullYear();
  var now = new Date(), today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  document.querySelectorAll('.events').forEach(function (list) {
    var left = 0;
    list.querySelectorAll('.event').forEach(function (ev) {
      var d = ev.getAttribute('data-date') || '';
      if (d && d < today) ev.classList.add('past'); else left++;
    });
    list.classList.toggle('all-past', left === 0);
  });
})();
