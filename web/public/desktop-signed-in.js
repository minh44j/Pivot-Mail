// Hands the finished sign-in to the Pivot Mail desktop app. The ticket arrived in the address fragment (never sent to a server);
// it is removed from this tab's history at once and only passed to the app, which also needs its own secret to use it.
;(function () {
  var m = /[#&]t=([^&]+)/.exec(location.hash)
  var go = document.getElementById('go')
  var msg = document.getElementById('msg')
  try { history.replaceState(null, '', location.pathname) } catch { /* old browsers: the ticket still expires in two minutes */ }
  if (!m) {
    msg.textContent = 'This sign-in link has already been used. Start again from the Pivot Mail app.'
    go.style.display = 'none'
    return
  }
  var link = 'pivotmail://auth?t=' + m[1]
  go.href = link
  location.href = link
})()
