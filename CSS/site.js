import { siteRoot, siteURL } from './site-paths.js';

function resolveFragmentLinks(fragment) {
    fragment.querySelectorAll('[href], [src]').forEach(el => {
        for (const attr of ['href', 'src']) {
            if (el.hasAttribute(attr)) el.setAttribute(attr, siteURL(el.getAttribute(attr)));
        }
    });
}
function normalizePage(url) {
    const u = new URL(url, siteRoot);
    return decodeURIComponent(u.pathname).replace(/\/index\.html$/, '/');
}
function highlight(nav) {
    const page = normalizePage(location.href);
    let section = document.body.dataset.siteSection;
    // Anchors such as News and Open Positions belong to their navigation sections.
    const exact = [...nav.querySelectorAll('.yw-sub a')].find(a => {
        const u = new URL(a.href);
        return normalizePage(u) === page && u.hash && u.hash === location.hash;
    });
    if (exact) section = exact.closest('[data-section]').dataset.section;
    nav.querySelectorAll('.yw-item').forEach(item => {
        const current = item.dataset.section === section;
        item.classList.toggle('is-current', current);
        const link = item.querySelector('.yw-link');
        link.removeAttribute('aria-current');
        if (current) link.setAttribute('aria-current', normalizePage(link.href) === page ? 'page' : 'true');
    });
    nav.querySelectorAll('.yw-sub a').forEach(a => {
        const u = new URL(a.href);
        a.removeAttribute('aria-current');
        if (normalizePage(u) === page && (!u.hash || u.hash === location.hash)) a.setAttribute('aria-current', u.hash ? 'location' : 'page');
    });
}
function setupNavigation(nav) {
    const toggle = nav.querySelector('.yw-toggle');
    const items = [...nav.querySelectorAll('.yw-item')];
    function expand(item, open) {
        item.classList.toggle('is-expanded', open);
        item.querySelector('.yw-expand')?.setAttribute('aria-expanded', String(open));
    }
    function closeAll() { items.forEach(item => expand(item, false)); }
    function closeMenu() {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open navigation menu');
        closeAll();
    }
    toggle.addEventListener('click', () => {
        const open = nav.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
        if (!open) closeAll();
    });
    items.forEach(item => {
        const button = item.querySelector('.yw-expand');
        if (!button) return;
        button.addEventListener('click', () => {
            const open = !item.classList.contains('is-expanded');
            closeAll(); expand(item, open);
        });
        button.addEventListener('keydown', event => {
            if (event.key === 'ArrowDown') {
                event.preventDefault(); closeAll(); expand(item, true);
                item.querySelector('.yw-sub a').focus();
            }
        });
        item.addEventListener('mouseenter', () => {
            if (matchMedia('(hover: hover) and (min-width: 1400px)').matches) { closeAll(); expand(item, true); }
        });
        item.addEventListener('mouseleave', () => {
            if (matchMedia('(hover: hover) and (min-width: 1400px)').matches && !item.contains(document.activeElement)) expand(item, false);
        });
        item.addEventListener('focusout', event => {
            if (!item.contains(event.relatedTarget)) expand(item, false);
        });
    });
    nav.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const item = event.target.closest('.yw-item.is-expanded');
        if (item) { expand(item, false); item.querySelector('.yw-expand').focus(); }
        else if (nav.classList.contains('is-open')) { closeMenu(); toggle.focus(); }
    });
    nav.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
    document.addEventListener('click', event => { if (!nav.contains(event.target)) closeMenu(); });
    matchMedia('(min-width: 1400px)').addEventListener('change', closeMenu);
    highlight(nav);
    addEventListener('hashchange', () => highlight(nav));
}
async function loadMenu() {
    const host = document.getElementById('menu-placeholder');
    if (!host) return;
    try {
        const response = await fetch(new URL('menu.html', siteRoot));
        if (!response.ok) throw new Error(`Navigation: HTTP ${response.status}`);
        host.innerHTML = await response.text();
        resolveFragmentLinks(host);
        setupNavigation(host.querySelector('.yw-nav'));
    } catch (error) {
        host.innerHTML = '<p class="site-notice">Navigation could not load. <a href="' + siteURL('menu.html') + '">View navigation links</a> or reload this page.</p>';
        console.error(error);
    }
}
async function loadFooter() {
    const host = document.createElement('div');
    host.id = 'footer-placeholder';
    document.body.append(host);
    try {
        const response = await fetch(new URL('footer.html', siteRoot));
        if (!response.ok) throw new Error(`Footer: HTTP ${response.status}`);
        host.innerHTML = await response.text();
        resolveFragmentLinks(host);
    } catch (error) { console.warn(error); }
}
loadMenu();
loadFooter();
// Legacy publication filter chips become keyboard-operable without changing filtering logic.
document.querySelectorAll('.filter .chip').forEach(chip => {
    chip.tabIndex = 0;
    chip.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); chip.click(); }
    });
});
