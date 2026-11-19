// "Add account" started from the Pivot Mail desktop app ends here, in the browser that showed Google's permission page.
// The result comes in the address fragment (never sent to a server) and is only shown as text.
;(function () {
  var TEXT = {
    session: 'Please sign in to the Pivot Mail app again, then add the mailbox.',
    forbidden: 'Only administrators can add a shared mailbox.',
    domain: 'That account does not belong to the company you chose. Choose the other company in Pivot Mail and try again.',
    scope: "Mail access was not allowed. Tick every permission on Google's screen and try again.",
    norefresh: "Google did not give lasting access. Remove Pivot Mail from your Google account's connected apps and try again.",
    config: 'Mailbox connection is not set up yet. Ask your administrator.',
    unavailable: 'The service is busy. Please try again in a moment.',
    expired: 'The connection expired. Start again from the Pivot Mail app.',
    state: 'The connection expired. Start again from the Pivot Mail app.',
    cancelled: 'Connection cancelled.',
    google: "Google could not finish. Please try again from the Pivot Mail app.",
  }
  var h = location.hash
  try { history.replaceState(null, '', location.pathname) } catch (e) { /* the text is not secret */ }
  var added = /[#&]added=([^&]+)/.exec(h)
  var err = /[#&]error=([a-z]+)/.exec(h)
  var title = document.getElementById('title')
  var msg = document.getElementById('msg')
  if (added) {
    var email = decodeURIComponent(added[1])
    if (/^[^\s<>@]+@[^\s<>@]+$/.test(email)) msg.textContent = email + ' is added. Go back to the Pivot Mail app: it shows up there in a moment.'
  } else {
    title.textContent = 'The mailbox was not added'
    msg.textContent = (err && TEXT[err[1]]) || 'Something went wrong. Please try again from the Pivot Mail app.'
  }
})()
