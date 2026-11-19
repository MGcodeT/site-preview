// The module lives in CSS/, so its parent is the deployment root at any URL prefix.
export const siteRoot = new URL('../', import.meta.url);
export function siteURL(value) {
    if (!value) return '';
    const path = String(value).trim();
    if (/^https?:\/\/yweng3\.github\.io(?:\/|$)/i.test(path)) {
        const old = new URL(path);
        return new URL(old.pathname.replace(/^\//, '') + old.search + old.hash, siteRoot).href.replace(/'/g, '%27');
    }
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(path)) return path.replace(/'/g, '%27');
    return new URL(path.replace(/^\//, ''), siteRoot).href.replace(/'/g, '%27');
}
