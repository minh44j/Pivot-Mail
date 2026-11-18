// The built-in "cannot connect" screen: shown by the app itself (no internet needed). The app keeps trying in the background
// and opens Pivot Mail by itself the moment it can connect; this page only explains and offers "Try again now".
var q = new URLSearchParams(location.search)
var $ = function (id) { return document.getElementById(id) }
if (q.get('dark') === '1') document.body.classList.add('dark')
if (q.get('reason') === 'server') {
  document.body.classList.add('server')
  $('title').textContent = 'Pivot Mail is not answering'
  $('lead').textContent = 'The internet works, but the Pivot Mail server did not answer. This is usually short.'
  $('far-label').textContent = 'Pivot Mail server'
}
var code = q.get('code')
if (code) $('code').textContent = 'For IT: ' + code
var timer = null
function tryNow() {
  document.body.classList.add('trying')
  $('status').textContent = 'Connecting…'
  window.pivotDesktop.retry()
  clearTimeout(timer)
  timer = setTimeout(function () {
    document.body.classList.remove('trying')
    $('status').textContent = 'Still no connection. Pivot Mail will open by itself as soon as it can.'
  }, 4000)
}
$('retry').addEventListener('click', tryNow)
window.addEventListener('online', tryNow)
