document.querySelectorAll('button[data-co]').forEach(function (b) {
  b.addEventListener('click', function () {
    window.pivotDesktop.chooseCompany(b.getAttribute('data-co'))
  })
})
