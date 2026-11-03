// Shared board input controller for Analysis and Repertoire Explorer.
// Owns pointer selection, drag-and-drop, cancellation and right-click annotations.
// Both pages keep their own chess data and engine presentation.
export function attachChessBoardControls({
  board, getPosition, getSelected, setSelected, playMove, repaint,
  getArrows, getHighlights
}) {
  let left = null;
  let right = null;
  const squareAt = (x, y) => {
    const rect = board.getBoundingClientRect();
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) return null;
    const file = Math.floor((x - rect.left) * 8 / rect.width);
    const rank = Math.floor((y - rect.top) * 8 / rect.height);
    return String.fromCharCode(97 + file) + (8 - rank);
  };
  const clearAnnotations = () => {
    const arrows = getArrows();
    if (arrows) arrows.length = 0;
    getHighlights()?.clear();
  };
  const release = record => {
    if (!record) return;
    record.ghost?.remove();
    if (record.source) record.source.style.visibility = '';
    try {
      if (board.hasPointerCapture(record.id)) board.releasePointerCapture(record.id);
    } catch {}
  };
  const cancelDrag = () => {
    if (!left) return;
    release(left);
    left.cancelled = true;
    left.dragging = false;
    setSelected(null);
    repaint();
  };
  const tryMove = (from, to) => {
    if (!from || !to || from === to) return false;
    const chess = getPosition();
    if (!chess.moves({ square: from, verbose: true }).some(m => m.to === to)) return false;
    setSelected(null);
    clearAnnotations();
    if (playMove(from, to)) return true;
    return false;
  };
  const chooseSquare = square => {
    const chess = getPosition();
    const previous = getSelected();
    const piece = chess.get(square);
    const movable = piece && piece.color === chess.turn();
    clearAnnotations();
    if (previous && previous !== square && tryMove(previous, square)) return;
    setSelected(previous === square ? null : movable ? square : null);
    repaint();
  };
  // A secondary mouse button may not fire pointerdown while the primary
  // button is held: mousedown still fires, so use it to cancel reliably.
  board.addEventListener('mousedown', e => {
    if (e.button === 2 && left) { e.preventDefault(); cancelDrag(); }
  });
  board.addEventListener('contextmenu', e => e.preventDefault());
  board.addEventListener('dragstart', e => e.preventDefault());
  board.addEventListener('pointerdown', e => {
    const square = squareAt(e.clientX, e.clientY);
    if (e.button === 2) {
      e.preventDefault();
      if (left) { cancelDrag(); return; }
      if (square) right = { square, id: e.pointerId };
      return;
    }
    if (e.button !== 0 || !square) return;
    e.preventDefault();
    if (left) { release(left); left = null; }
    right = null;
    const previous = getSelected();
    const chess = getPosition();
    const piece = chess.get(square);
    const movable = Boolean(piece && piece.color === chess.turn());
    left = {
      id: e.pointerId, square, previous, movable,
      x: e.clientX, y: e.clientY, dragging: false,
      cancelled: false, source: null, ghost: null
    };
    clearAnnotations();
    if (movable) setSelected(square); // dots appear as soon as the piece is held
    repaint();
    left.source = board.querySelector('[data-square="' + square + '"] .chess-piece');
    try { board.setPointerCapture(e.pointerId); } catch {}
  });
  board.addEventListener('pointermove', e => {
    if (!left || left.id !== e.pointerId || left.cancelled) return;
    // On most browsers a second mouse button changes buttons rather than
    // emitting another pointerdown: treat both ways as drag cancellation.
    if (e.buttons & 2) { cancelDrag(); return; }
    if (!left.movable) return;
    if (!left.dragging && Math.hypot(e.clientX - left.x, e.clientY - left.y) > 8) {
      left.dragging = true;
      const img = left.source;
      if (img) {
        const ghost = img.cloneNode(true);
        const squareSize = board.getBoundingClientRect().width / 8;
        ghost.draggable = false;
        ghost.style.cssText =
          'position:fixed;z-index:99999;pointer-events:none;display:block;' +
          'width:' + squareSize + 'px;height:' + squareSize + 'px;' +
          'transform:translate(-50%,-50%);opacity:.95';
        document.body.append(ghost);
        left.ghost = ghost;
        img.style.visibility = 'hidden';
      }
    }
    if (left.ghost) {
      left.ghost.style.left = e.clientX + 'px';
      left.ghost.style.top = e.clientY + 'px';
    }
  });
  board.addEventListener('pointerup', e => {
    if (e.button === 2) {
      if (left) { cancelDrag(); return; }
      if (!right) return;
      const from = right.square, to = squareAt(e.clientX, e.clientY);
      right = null;
      if (!to) return;
      if (to === from) {
        const squares = getHighlights();
        if (squares.has(to)) squares.delete(to);
        else squares.add(to);
      } else {
        const arrows = getArrows();
        const idx = arrows.findIndex(a => a[0] === from && a[1] === to);
        if (idx >= 0) arrows.splice(idx, 1);
        else arrows.push([from, to]);
      }
      repaint();
      return;
    }
    if (e.button !== 0 || !left || e.pointerId !== left.id) return;
    const current = left;
    const target = squareAt(e.clientX, e.clientY);
    left = null;
    release(current);
    if (current.cancelled) { setSelected(null); repaint(); return; }
    if (current.dragging) {
      if (current.movable && tryMove(current.square, target)) return;
      setSelected(null); // invalid/outside drops return the piece to its source
      repaint();
      return;
    }
    if (current.previous && current.previous !== current.square &&
        tryMove(current.previous, current.square)) return;
    setSelected(current.movable
      ? (current.previous === current.square ? null : current.square)
      : null);
    repaint();
  });
  board.addEventListener('pointercancel', e => {
    if (left && left.id === e.pointerId) {
      release(left); left = null; setSelected(null); repaint();
    }
    if (right?.id === e.pointerId) right = null;
  });
  // Keyboard-accessible board cells retain the same selection semantics.
  board.addEventListener('click', e => {
    if (e.detail !== 0) return;
    const square = e.target.closest('[data-square]')?.dataset.square;
    if (square) chooseSquare(square);
  });
  return { squareAt, clearAnnotations, cancelDrag };
}
