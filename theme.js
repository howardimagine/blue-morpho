/* 主題:深色為預設,淺色可切(記在 localStorage bm.theme)。放在 <head> 最前面避免閃一下。 */
(function () {
  var KEY = 'bm.theme', root = document.documentElement, t = null;
  try { t = localStorage.getItem(KEY); } catch (e) {}
  root.dataset.theme = t === 'light' ? 'light' : 'dark';
  function paint() {
    var dark = root.dataset.theme === 'dark', m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', dark ? '#02020A' : '#FFFFFF');
    document.querySelectorAll('.theme-btn').forEach(function (b) { b.textContent = dark ? 'LIGHT' : 'DARK'; b.title = dark ? '切換淺色' : '切換深色'; });
  }
  window.bmTheme = function () {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, root.dataset.theme); } catch (e) {}
    paint(); window.dispatchEvent(new Event('bm-theme'));
  };
  document.addEventListener('DOMContentLoaded', function () {
    var host = document.querySelector('.nav-inner .nav-cta') || document.querySelector('.topbar .nav') || document.getElementById('hdr-tools');
    if (!host) return;
    var b = document.createElement('button'); b.className = 'theme-btn'; b.type = 'button'; b.onclick = window.bmTheme;
    if (host.classList.contains('nav-cta')) host.parentNode.insertBefore(b, host); else host.appendChild(b);
    paint();
  });
})();
