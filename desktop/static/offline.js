// The built-in "cannot connect" screen: shown by the app itself (no internet needed). The app keeps trying in the background
// and opens Pivot Mail by itself the moment it can connect; this page only explains and offers "Try again now".
var q = new URLSearchParams(location.search)
if (q.get('dark') === '1') document.body.classList.add('dark')
if (q.get('reason') === 'server') {
  document.getElementById('title').textContent = 'Pivot Mail is not answering'
  document.getElementById('lead').textContent = 'The internet works, but the Pivot Mail server did not answer. This is usually short.'
}
var code = q.get('code')
if (code) document.getElementById('code').textContent = 'For IT: ' + code
var retry = document.getElementById('retry')
function tryNow() {
  document.getElementById('status').textContent = 'Connecting…'
  window.pivotDesktop.retry()
  setTimeout(function () {
    document.getElementById('status').textContent = 'Still no connection. Pivot Mail will open by itself as soon as it can.'
  }, 4000)
}
retry.addEventListener('click', tryNow)
window.addEventListener('online', tryNow)
