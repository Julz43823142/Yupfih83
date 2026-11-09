// Static local QR: navigates to the account page to sign in to an EXISTING
// account on a phone. Contains NO credentials, account IDs, codes or tokens.
// Separate from signup QR; production and preview hosts stay isolated.
(() => {
  const preview = 'feature-passkey-foundation-2.fairplaychess.pages.dev';
  const productionRows = [
    '0000000000',
    '0000000000',
    '0000000000',
    '0000000000',
    '01fd1e57f0',
    '0105aea410',
    '01757c35d0',
    '0174e7b5d0',
    '01755ae5d0',
    '0104bdd410',
    '01fd5557f0',
    '0000d50000',
    '013f2d8970',
    '011b666360',
    '014db74840',
    '006234ab90',
    '01bc2d3410',
    '01100347f0',
    '0186b7ee50',
    '015a2c2e50',
    '012e833280',
    '0179226160',
    '019c6f3390',
    '01a85816c0',
    '01c439bfe0',
    '00012a3180',
    '01fd0ab580',
    '01056ab120',
    '0175e93fb0',
    '0175f6d810',
    '0174b78b70',
    '0104244bd0',
    '01fd573d00',
    '0000000000',
    '0000000000',
    '0000000000',
    '0000000000'
  ];
  const previewRows = [
    '000000000000',
    '000000000000',
    '000000000000',
    '000000000000',
    '01fca4de97f0',
    '0104f8a56410',
    '0175af7a75d0',
    '017536e7e5d0',
    '01750c7a45d0',
    '0105ba5c7410',
    '01fd555557f0',
    '000177387000',
    '017cf873e7c0',
    '01e2a7825ae0',
    '01e6a8142d30',
    '01a9410c1310',
    '01a66dc5cdf0',
    '014a11b71220',
    '01bf3e94e7b0',
    '00d2e4c90730',
    '00bf8f26ad50',
    '00427e5a00a0',
    '003ff3ec3f70',
    '01fbe27e4c10',
    '00d427e6fdc0',
    '01629972d080',
    '01c62f48f7b0',
    '00bace187f10',
    '008c4845ff60',
    '012b738612c0',
    '014d8484b7b0',
    '014ad55b7c30',
    '011ce8b5ffc0',
    '0001f5fa5180',
    '01fccf9c1570',
    '01059acb5190',
    '01750f07ff50',
    '0175827a2d10',
    '0175ab9c8830',
    '0104ba5b7d10',
    '01fdd2a5c970',
    '000000000000',
    '000000000000',
    '000000000000',
    '000000000000'
  ];
  const isPhone = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    navigator.userAgentData?.mobile === true ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const render = element => {
    const hostname = location.hostname;
    if (!element || !['eloscanner.com', preview, 'localhost'].includes(hostname)) return false;
    const host = hostname === 'eloscanner.com' ? hostname : preview;
    const rows = host === 'eloscanner.com' ? productionRows : previewRows;
    const url = 'https://' + host + '/account.html';
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    const width = rows.length;
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + width);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'QR code to open your EloScanner account on your phone');
    svg.setAttribute('width', '254'); svg.setAttribute('height', '254');
    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('width', width); bg.setAttribute('height', width);
    bg.setAttribute('fill', '#fff'); svg.appendChild(bg);
    const squares = [];
    for (let y = 0; y < rows.length; y++) {
      const bits = BigInt('0x' + rows[y]);
      for (let x = 0; x < width; x++) {
        if ((bits >> BigInt(width - x - 1)) & 1n)
          squares.push('M' + x + ' ' + y + 'h1v1h-1z');
      }
    }
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', squares.join(''));
    path.setAttribute('fill', '#101820'); svg.appendChild(path);
    element.replaceChildren(svg);
    const link = document.getElementById('passkey-phone-enroll-link');
    if (link) { link.href = url; link.textContent = url; }
    return true;
  };
  window.eloPhoneAccount = Object.freeze({ isPhone, render });
})();
