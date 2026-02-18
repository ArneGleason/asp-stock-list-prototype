/**
 * Shared Prototype Navigation
 * Injects a top-level navigation bar into all prototype versions.
 */

(function () {
    const VERSIONS = [
        { id: 'v1', label: 'V1 – Baseline', href: 'v1.html', desc: 'Current Production State' },
        { id: 'v2', label: 'V2 – Demo', href: 'v2.html', desc: 'Demo Version 2' },
        { id: 'v3', label: 'V3 – Demo', href: 'v3.html', desc: 'Demo Version 3' }
    ];

    function init() {
        const navContainer = document.getElementById('prototype-nav');
        if (!navContainer) {
            console.warn('Prototype Nav: #prototype-nav container not found.');
            return;
        }

        // Identify current version from URL
        const path = window.location.pathname;
        const currentFilename = path.substring(path.lastIndexOf('/') + 1); // e.g., "v1.html"

        // Find current index
        let currentIndex = VERSIONS.findIndex(v => v.href === currentFilename);
        if (currentIndex === -1) currentIndex = 0; // Default to first if unknown

        const currentVersion = VERSIONS[currentIndex];

        // render
        navContainer.innerHTML = renderNav(currentVersion, currentIndex);

        // Bind events if any (e.g. mobile toggle)
        const toggle = document.getElementById('proto-nav-toggle');
        if (toggle) {
            toggle.addEventListener('click', function () {
                const menu = document.querySelector('.proto-nav-menu');
                menu.classList.toggle('open');
            });
        }
    }

    function renderNav(current, index) {
        const prev = VERSIONS[index - 1];
        const next = VERSIONS[index + 1];

        // Generate Tabs/Links
        const linksHtml = VERSIONS.map(v => {
            const isActive = v.id === current.id ? 'active' : '';
            return `<a href="${v.href}" class="proto-nav-link ${isActive}" title="${v.desc}">${v.label}</a>`;
        }).join('');

        return `
            <div class="proto-nav-bar">
                <div class="proto-nav-left">
                    <span class="proto-brand">ASP Prototype</span>
                    <button id="proto-nav-toggle" class="proto-nav-toggle">
                        <span class="material-icons">menu</span>
                        <span class="current-label-mobile">${current.label}</span>
                    </button>
                    <div class="proto-nav-menu">
                        ${linksHtml}
                    </div>
                </div>
                <div class="proto-nav-right">
                    ${prev ? `<a href="${prev.href}" class="btn btn-xs btn-default proto-btn">« ${prev.id.toUpperCase()}</a>` : '<span class="proto-spacer"></span>'}
                    <span class="proto-divider"></span>
                    ${next ? `<a href="${next.href}" class="btn btn-xs btn-primary proto-btn">${next.id.toUpperCase()} »</a>` : '<span class="proto-spacer"></span>'}
                </div>
            </div>
        `;
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
