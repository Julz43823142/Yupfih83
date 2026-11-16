/* Browser-only screenshot-to-FEN. No image is uploaded to EloScanner. */
const fileInput = document.getElementById('position-photo');
const scanButton = document.getElementById('position-scan');
const scanStatus = document.getElementById('position-scan-status');
const preview = document.getElementById('position-photo-preview');
const side = document.getElementById('position-side');
const editor = document.getElementById('physical-board-editor');
let imageFile = null;
let previewUrl = null;
let scanning = false;
const report = message => { scanStatus.textContent = message; };
const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
function selectFile(file) {
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
  imageFile = null;
  preview.hidden = true;
  preview.removeAttribute('src');
  scanButton.disabled = true;
  if (!file) { report('Choose a chess screenshot or diagram.'); return; }
  if (!allowedTypes.has(file.type)) { report('Use a PNG, JPG or WebP image.'); return; }
  if (file.size > 12 * 1024 * 1024) { report('Image is too large (maximum 12 MB).'); return; }
  imageFile = file;
  previewUrl = URL.createObjectURL(file);
  preview.src = previewUrl;
  preview.hidden = false;
  scanButton.disabled = scanning;
  report('Image ready. Tap Scan position. Screenshots and flat diagrams work best.');
}
fileInput.addEventListener('change', () => selectFile(fileInput.files?.[0]));
window.addEventListener('pagehide', () => { if (previewUrl) URL.revokeObjectURL(previewUrl); });
document.addEventListener('paste', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  const file = [...(event.clipboardData?.files || [])].find(item => allowedTypes.has(item.type));
  if (file) { event.preventDefault(); selectFile(file); }
});
scanButton.addEventListener('click', async () => {
  if (!imageFile || scanning) return;
  scanning = true;
  scanButton.disabled = true;
  report('Loading the recognition model and reading 64 squares…');
  try {
    // Bundle the pinned ONNX Runtime dependency with the library; otherwise
    // browser ESM cannot resolve the bare "onnxruntime-web" import.
    const { createRecognizer, resolveOrientation, placementToFen } =
      await import('https://esm.sh/@scoriiu/fenshot@0.1.5?bundle&deps=onnxruntime-web@1.26.0');
    if (typeof createRecognizer !== 'function') throw Error('Recognition library unavailable');
    const recognizer = createRecognizer({
      modelUrl: 'https://cdn.jsdelivr.net/npm/@scoriiu/fenshot@0.1.5/model/chess-tiles-v2.onnx',
      wasmPaths: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/'
    });
    const result = await recognizer.recognize(imageFile);
    if (!result) {
      editor.open = true;
      report('No 2D chessboard detected. Use a straight-on screenshot or correct the position manually below.');
      return;
    }
    const { placement } = resolveOrientation(result.placement);
    window.dispatchEvent(new CustomEvent('elo-scanner-placement', { detail: { placement } }));
    editor.open = true;
    if (!result.reliable) {
      report('Some squares are uncertain. Review and correct the detected pieces below, then tap Analyze this position.');
      return;
    }
    // Even high-confidence results are shown in the editor first. Photos
    // cannot establish move history, castling or en-passant rights.
    const fen = placementToFen(placement, side.value);
    report('Position detected. Check the editable board below before analyzing. Suggested FEN: ' + fen);
  } catch (error) {
    console.error('Photo recognition unavailable:', error);
    editor.open = true;
    report('Automatic recognition could not start. Your image is still available above. Enter or correct the pieces in the editor below.');
  } finally {
    scanning = false;
    scanButton.disabled = !imageFile;
  }
});
