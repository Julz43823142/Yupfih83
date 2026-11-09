// The public preview signup URL is encoded as a static QR matrix. It carries
// no account details, challenge, session, token, or tracking parameters.
// Phone registration happens on the phone itself, not in Windows Hello.
(() => {
  const previewHost = 'feature-passkey-foundation-2.fairplaychess.pages.dev';
  const signupURL = 'https://' + previewHost + '/account.html?view=signup';
  const rows = [
    '1fc6df64e17f','1048d4311a41','1753b020da5d','174822b1235d',
    '1759f5fe5f5d','1052b31e2841','1fd55555557f','000ce1105c00',
    '095bbbfa1cb4','19382676db4a','17c23baee9da','1d1038c0b521',
    '085a76d25ee0','0ba4524fe35e','1270b844f15a','0c82e7e85aa1',
    '117db80e36c3','11ba96c4e15a','0e478d25495a','0787befc3e2a',
    '11f46bfa9ff9','1b1bcb12db12','115c8f51e95a','0f1c411a1312',
    '1bfdb7fed7f8','0ebe5505c02e','17c9b1bcfa92','151336da5d69',
    '00592acedc30','139a363fc92e','1651f2edc29a','18af40323d70',
    '16df70ae1db3','0d21bd96c966','015995d7f892','0f35874e9142',
    '1340abfef9f9','0011b515cb1c','1fc5e955c352','104e811c3312',
    '17590bfa7ff9','1748571a52f9','174a1627f816','105d22cc58b0',
    '1fcd09a21d29'
  ];
  const isPhone = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    navigator.userAgentData?.mobile === true ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const renderQr = element => {
    if (!element || (location.hostname !== previewHost && location.hostname !== 'localhost')) return false;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 53 53');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'QR code: open EloScanner signup on your phone');
    svg.setAttribute('width', '254');
    svg.setAttribute('height', '254');
    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('width', '53'); bg.setAttribute('height', '53');
    bg.setAttribute('fill', '#fff');
    svg.appendChild(bg);
    const path = document.createElementNS(ns, 'path');
    const squares = [];
    for (let y = 0; y < rows.length; y++) {
      const bits = BigInt('0x' + rows[y]);
      for (let x = 0; x < 45; x++) {
        if ((bits >> BigInt(44 - x)) & 1n)
          squares.push('M' + (x + 4) + ' ' + (y + 4) + 'h1v1h-1z');
      }
    }
    path.setAttribute('d', squares.join(''));
    path.setAttribute('fill', '#101820');
    svg.appendChild(path);
    element.replaceChildren(svg);
    const link = document.getElementById('signup-phone-link');
    if (link) { link.href = signupURL; link.textContent = signupURL; }
    return true;
  };
  window.eloPhoneSignup = Object.freeze({ isPhone, renderQr });
})();
