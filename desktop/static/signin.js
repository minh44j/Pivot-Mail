// The small sign-in window (like Outlook's): two Google buttons. Google itself opens in the person's normal browser
// (Google refuses sign-in inside app windows); the app hands the result back and opens the full Pivot Mail window.
var q = new URLSearchParams(location.search)
var bridge = window.pivotDesktop
var ERRORS = {
  expired: ['Sign-in expired', 'That sign-in took too long or was started elsewhere. Please start again.'],
  state: ['Sign-in expired', 'That sign-in took too long or was started elsewhere. Please start again.'],
  disabled: ['Access denied', 'Your access has been turned off. Ask your administrator.'],
  invite: ['Access denied', 'Your account has not been added yet. Ask your administrator to invite you.'],
  unavailable: ['Sign-in is busy', 'Please try again in a moment.'],
  config: ['Sign-in is not available', 'Ask your administrator.'],
  signedout: ['Signed out', 'Sign in again to open your mail.'],
}
if (q.get('dark') === '1') document.body.classList.add('dark')
var err = ERRORS[q.get('error') || '']
if (err) {
  document.getElementById('error-title').textContent = err[0]
  document.getElementById('error-text').textContent = err[1]
  document.getElementById('error').hidden = false
}
if (q.get('state') === 'waiting') {
  document.getElementById('choose').hidden = true
  document.getElementById('waiting').hidden = false
  document.getElementById('domain').textContent = q.get('co') === 'tmc' ? '@pivottmc.com' : '@pivotscl.com'
}
document.querySelectorAll('button[data-co]').forEach(function (b) {
  b.addEventListener('click', function () {
    bridge.signIn(b.getAttribute('data-co'))
  })
})
document.getElementById('reopen').addEventListener('click', function () {
  bridge.signInReopen()
})
document.getElementById('back').addEventListener('click', function () {
  bridge.signInBack()
})
