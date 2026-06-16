// Demo site config — lets the editor preview this page locally.
window.CMSConfig = {
  siteId: 'demo',
  backend: { type: 'api', base: 'http://localhost:4001' },
  variants: [
    { id: 'default', label: 'Groom' },
    { id: 'bride', label: 'Bride' },
  ],
  groups: ['Hero', 'The Promise', 'Packages', 'Results', 'FAQ', 'Contact', 'Footer'],
  groupIcons: { Results: 'image' },
};
