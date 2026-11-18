// The small sign-in window (like Outlook's): two Google buttons. Google itself opens in the person's normal browser
// (Google refuses sign-in inside app windows); the app hands the result back and opens the full Pivot Mail window.
var q = new URLSearchParams(location.search)
var bridge = window.pivotDesktop
var ERRORS = {
  expired: ['Sign-in expired', 'That sign-in took too long or was started elsewhere. Please start again.'],
  state: ['Sign-in expired', 'That sign-in took too long or was started elsewhere. Please start again.'],
  disabled: ['Access denied', 'Your access has been turned off. Ask your administrator.'],
  invite: ['Access denied', 'Your account has not been added yet. Ask your administrator to invite you.'],
  unavailable: ['Sign-in is busy', 'Pivot Mail could not finish signing you in. Please try again in a moment.'],
  config: ['Sign-in is not available', 'Ask your administrator.'],
}
var $ = function (id) { return document.getElementById(id) }
if (q.get('dark') === '1') document.body.classList.add('dark')
if (q.get('v')) $('ver').textContent = 'v' + q.get('v')
if (q.get('first') === '1') document.querySelector('#choose h1').textContent = 'Welcome to Pivot Mail'
/** Shows one step (choose / waiting / finishing), with or without an error note. Only the panel's content changes, with a short
 *  fade: the logo and the panel stay where they are. Used at load and whenever the app moves to the next step. */
function apply(p) {
  var err = ERRORS[p.error || '']
  $('error').hidden = !err
  if (err) {
    $('error-title').textContent = err[0]
    $('error-text').textContent = err[1]
  }
  var step = p.state === 'waiting' || p.state === 'finishing' ? p.state : 'choose'
  ;['choose', 'waiting', 'finishing'].forEach(function (id) { $(id).hidden = id !== step })
  $('domain').textContent = p.co === 'tmc' ? '@pivottmc.com' : '@pivotscl.com'
}
apply({ state: q.get('state'), co: q.get('co'), error: q.get('error') })
if (bridge.onSignInState) bridge.onSignInState(function (p) { apply(p || {}) })
document.querySelectorAll('button[data-co]').forEach(function (b) {
  b.addEventListener('click', function () {
    bridge.signIn(b.getAttribute('data-co'))
  })
})
$('reopen').addEventListener('click', function () { bridge.signInReopen() })
$('back').addEventListener('click', function () { bridge.signInBack() })
