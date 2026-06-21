// Hides video rendering to reduce CPU/memory while keeping audio
(function () {
    const style = document.createElement('style');
    style.textContent = 'video { visibility: hidden !important; }';
    document.documentElement.appendChild(style);

    const observer = new MutationObserver(() => {
        document.querySelectorAll('video').forEach(v => {
            v.style.visibility = 'hidden';
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
