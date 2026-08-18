// The measurement id rides on this script's data-ga-id attribute (app/layout.tsx)
// so NEXT_PUBLIC_GA_ID stays the only place it's defined. No id -> no-op.
(function () {
  var el = document.currentScript;
  var id = el && el.getAttribute('data-ga-id');
  if (!id) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', id);
})();
