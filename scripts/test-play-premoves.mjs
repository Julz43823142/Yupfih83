import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {attachPlayBotControls} from '../play-bot-controls.mjs';
class Board extends EventTarget {
 constructor(){super();this.dataset={orientation:'white'};this.captured=new Set()}
 getBoundingClientRect(){return {left:0,top:0,width:800,height:800,right:800,bottom:800}}
 setPointerCapture(id){this.captured.add(id)}
 hasPointerCapture(id){return this.captured.has(id)}
 releasePointerCapture(id){this.captured.delete(id)}
 querySelector(){return null}
 fire(type,props={}){
  const event=new Event(type,{cancelable:true});
  Object.assign(event,{pointerId:1,button:0,buttons:1,clientX:0,clientY:0,...props});
  this.dispatchEvent(event);
 }
}
const xy=s=>{
 const file=s.charCodeAt(0)-97,rank=8-Number(s[1]);
 return {clientX:file*100+50,clientY:rank*100+50};
};
const board=new Board();
let selected=null,premove=null,painted=0,cancelled=0;
const human='w',pieces=new Map([['e2',{color:'w',type:'p'}],['g1',{color:'w',type:'n'}],['d7',{color:'b',type:'p'}]]);
const chess={turn:()=> 'b',get:s=>pieces.get(s)||null};
const arrows=[],highlights=new Set();
const controls=attachPlayBotControls({
 board,getPosition:()=>chess,getSelected:()=>selected,setSelected:v=>{selected=v},
 playMove:(from,to)=>{premove={from,to};return true},
 repaint:()=>painted++,getArrows:()=>arrows,getHighlights:()=>highlights,
 canSelectPiece:(_s,p)=>p.color===human,
 canAttemptMove:(from,to)=>(from==='e2'&&to==='e4')||(from==='g1'&&to==='f3'),
 onRightClick:()=>{premove=null;cancelled++}
});
assert.equal(controls.squareAt(450,650),'e2');
assert.equal(controls.squareAt(450,450),'e4');
// A click on the human pawn must select it even though Black is to move.
board.fire('pointerdown',xy('e2'));board.fire('pointerup',xy('e2'));
assert.equal(selected,'e2');
board.fire('pointerdown',xy('e4'));board.fire('pointerup',xy('e4'));
assert.deepEqual(premove,{from:'e2',to:'e4'});
assert.equal(selected,null);
// Dragging the knight while the opponent is still to move must also queue.
board.fire('pointerdown',xy('g1'));
board.fire('pointermove',{...xy('f3'),buttons:1});
board.fire('pointerup',xy('f3'));
assert.deepEqual(premove,{from:'g1',to:'f3'});
// Right click clears the queued premove, preserving annotations.
board.fire('pointerdown',{...xy('a1'),button:2,buttons:2});
board.fire('pointerup',{...xy('a1'),button:2,buttons:0});
assert.equal(premove,null);
assert.ok(cancelled>=1);
assert.equal(highlights.has('a1'),true);
// Board orientation is also respected for a black-side game.
board.dataset.orientation='black';
assert.equal(controls.squareAt(350,150),'e2');
assert.ok(painted>0);
const play=readFileSync(new URL('../play.js',import.meta.url),'utf8');
assert.ok(play.includes('attachPlayBotControls({board'));
assert.ok(play.includes('runPremove()'));
assert.ok(play.includes('premove={from,to,promotion:promotion'));
console.log('PASS: premove clicks, drag and drop, right-click cancellation, flipped board and integration.');
