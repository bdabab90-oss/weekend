// [البند 19] كان سكربتاً مضمّناً في index.html و admin.html — نُقل لملف خارجي ليعمل مع CSP بدون 'unsafe-inline'
(function () {
    window.__deferredPwaPrompt = null;
    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        window.__deferredPwaPrompt = e;
    });
    // [البند 27] رابط canonical للصفحة الرئيسية أو لصفحة المنشأة (?venue=ID) — للصفحة العامة فقط
    try {
        if (/^\/(index\.html)?$/.test(window.location.pathname)) {
            var origin = 'https://weekend-three-xi.vercel.app';
            var venue = new URLSearchParams(window.location.search).get('venue');
            var href = origin + '/' + (venue && /^[1-9][0-9]{0,17}$/.test(venue) ? '?venue=' + venue : '');
            var link = document.createElement('link');
            link.rel = 'canonical';
            link.href = href;
            document.head.appendChild(link);
        }
    } catch (e) {}
})();
