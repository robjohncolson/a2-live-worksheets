'use strict';

document.getElementById('verify-form').addEventListener('submit', async function (event) {
  event.preventDefault();
  const status = document.getElementById('verify-status');
  const details = document.getElementById('verify-details');
  details.textContent = '';
  const target = ReceiptVerify.parseVerifyTarget(document.getElementById('receipt').value.trim());
  if (!target) {
    status.textContent = 'Paste a signed receipt or a link containing a receipt.';
    return;
  }
  status.textContent = 'Checking signature…';
  try {
    let compact = target.value;
    if (target.kind === 'commit' && !compact.includes('.')) {
      const bytes = ReceiptVerify.b64urlToBytes(compact);
      compact = JSON.parse(new TextDecoder().decode(bytes)).m;
    }
    const result = await ReceiptVerify.verifyReceipt(compact, { includeTestKeys: ReceiptVerify.hasTestModeFlag() });
    status.textContent = result.ok ? 'Valid signature — signed by ' + result.issuer.name + '.' : 'Signature could not be verified.';
    if (result.ok && target.kind === 'commit') status.textContent += ' Manifest signature checked; individual receipts were not checked.';
    if (result.ok) details.textContent = JSON.stringify(result.payload, null, 2);
  } catch (_) {
    status.textContent = 'Could not verify this receipt. Check the receipt and browser support.';
  }
});

if (location.hash) {
  document.getElementById('receipt').value = location.href;
  document.getElementById('verify-form').requestSubmit();
}
