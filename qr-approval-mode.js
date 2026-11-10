// Select the isolated phone approval view before account content renders.
if (new URLSearchParams(location.search).has('qr')) {
  document.documentElement.classList.add('qr-approval-view');
}
