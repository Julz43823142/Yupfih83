// Dedicated Play Bots input: always permit human pieces while the bot is thinking.
export function attachPlayBotControls({board,getPosition,getSelected,setSelected,playMove,repaint,getArrows,getHighlights,canSelectPiece,canAttemptMove,onRightClick}){
 let drag=null,right=null;
 const squareAt=(x,y)=>{
  const rect=board.getBoundingClientRect();
  if(x<rect.left||x>=rect.right||y<rect.top||y>=rect.bottom)return null;
  const file=Math.min(7,Math.floor((x-rect.left)*8/rect.width));
  const rank=Math.min(7,Math.floor((y-rect.top)*8/rect.height));
  const reverse=board.dataset.orientation==='black';
  return String.fromCharCode(97+(reverse?7-file:file))+(reverse?rank+1:8-rank);
 };
 const movable=sq=>{
  const piece=sq&&getPosition().get(sq);
  return !!(piece&&(canSelectPiece?canSelectPiece(sq,piece):piece.color===getPosition().turn()));
 };
 const clearAnnotations=()=>{const arrows=getArrows?.();if(arrows)arrows.length=0;getHighlights?.()?.clear()};
 const release=record=>{
  if(!record)return;
  record.ghost?.remove();
  if(record.source)record.source.style.visibility='';
  try{if(board.hasPointerCapture?.(record.id))board.releasePointerCapture(record.id)}catch{}
 };
 const cancelDrag=()=>{release(drag);drag=null;setSelected(null);repaint()};
 const attempt=(from,to)=>{
  if(!from||!to||from===to)return false;
  if(canAttemptMove?!canAttemptMove(from,to):!getPosition().moves({square:from,verbose:true}).some(m=>m.to===to))return false;
  clearAnnotations();
  if(!playMove(from,to))return false;
  setSelected(null);repaint();return true;
 };
 board.addEventListener('contextmenu',e=>e.preventDefault());
 board.addEventListener('dragstart',e=>e.preventDefault());
 board.addEventListener('pointerdown',e=>{
  const sq=squareAt(e.clientX,e.clientY);
  if(e.button===2){
   e.preventDefault();if(drag)cancelDrag();onRightClick?.();
   right=sq?{sq,id:e.pointerId}:null;return;
  }
  if(e.button!==0||!sq)return;
  e.preventDefault();release(drag);
  const isMovable=movable(sq);
  drag={id:e.pointerId,from:sq,previous:getSelected(),movable:isMovable,x:e.clientX,y:e.clientY,dragging:false,source:null,ghost:null};
  if(isMovable){setSelected(sq);repaint()}
  drag.source=board.querySelector?.('[data-square="'+sq+'"] .chess-piece')||null;
  try{board.setPointerCapture(e.pointerId)}catch{}
 });
 board.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId)return;
  if(e.buttons&2){cancelDrag();onRightClick?.();return}
  if(!drag.movable)return;
  if(!drag.dragging&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>6){
   drag.dragging=true;
   if(drag.source){
    const ghost=drag.source.cloneNode(true),size=board.getBoundingClientRect().width/8;
    ghost.draggable=false;
    ghost.style.cssText='position:fixed;z-index:99999;pointer-events:none;width:'+size+'px;height:'+size+'px;transform:translate(-50%,-50%);opacity:.95';
    document.body.append(ghost);drag.ghost=ghost;drag.source.style.visibility='hidden';
   }
  }
  if(drag.ghost){drag.ghost.style.left=e.clientX+'px';drag.ghost.style.top=e.clientY+'px'}
 });
 board.addEventListener('pointerup',e=>{
  if(e.button===2){
   if(!right||right.id!==e.pointerId)return;
   const from=right.sq,to=squareAt(e.clientX,e.clientY);right=null;
   if(!to)return;
   if(from===to){const marks=getHighlights?.();if(marks?.has(to))marks.delete(to);else marks?.add(to)}
   else{const arrows=getArrows?.();if(arrows){const i=arrows.findIndex(a=>a[0]===from&&a[1]===to);if(i>=0)arrows.splice(i,1);else arrows.push([from,to,e.altKey?'rainbow':e.shiftKey?'#a855f7':e.ctrlKey?'#760018':'#0a9cff'])}}
   repaint();return;
  }
  if(e.button!==0||!drag||drag.id!==e.pointerId)return;
  const d=drag,to=squareAt(e.clientX,e.clientY);drag=null;release(d);
  if(d.dragging){if(d.movable&&attempt(d.from,to))return;setSelected(null);repaint();return}
  if(d.previous&&d.previous!==to&&attempt(d.previous,to))return;
  setSelected(d.previous===to?null:d.movable?to:null);repaint();
 });
 board.addEventListener('pointercancel',e=>{if(drag?.id===e.pointerId)cancelDrag();if(right?.id===e.pointerId)right=null});
 board.addEventListener('mousedown',e=>{if(e.button===2&&drag){e.preventDefault();cancelDrag();onRightClick?.()}});
 board.addEventListener('click',e=>{
  if(e.detail!==0)return;
  const sq=e.target?.closest?.('[data-square]')?.dataset?.square;
  if(!sq)return;
  const prior=getSelected();
  if(prior&&prior!==sq&&attempt(prior,sq))return;
  setSelected(prior===sq?null:movable(sq)?sq:null);repaint();
 });
 return {squareAt,cancelDrag,clearAnnotations};
}
