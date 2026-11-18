// Light unless the person chose dark (avatar menu). Runs before the page is drawn, so there is no flash of the wrong theme.
// A separate file (not inline) so the site's security policy can forbid inline scripts entirely.
try {
  var t = localStorage.getItem('pm.theme')
  document.documentElement.dataset.theme = t === 'dark' ? 'dark' : 'light'
} catch {
  document.documentElement.dataset.theme = 'light'
}
