/* Physical-board fallback: user-assisted transcription, no unverified AI claims. */
const root=document.getElementById("physical-board-editor");
const board=root.querySelector(".physical-grid");
const palette=root.querySelector(".physical-palette");
const status=root.querySelector(".physical-status");
const pieces={K:"♔",Q:"♕",R:"♖",B:"♗",N:"♘",P:"♙",k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟"};
let squares=Array(64).fill(""),chosen="P",flipped=false;
window.addEventListener('elo-scanner-placement',event=>{
  const placement=event.detail?.placement;
  if(typeof placement!=='string')return;
  const ranks=placement.split('/');
  if(ranks.length!==8)return;
  const next=[];
  for(const rank of ranks){for(const char of rank){if(/[1-8]/.test(char))next.push(...Array(Number(char)).fill(''));else if(pieces[char])next.push(char);else return;}}
  if(next.length!==64)return;
  squares=next;draw();root.open=true;
  status.textContent='Recognized pieces loaded for review. Correct any squares, then analyze.';
});
function draw(){
  board.replaceChildren();
  for(let visual=0;visual<64;visual++){
    const i=flipped?63-visual:visual;
    const b=document.createElement("button");
    b.type="button";b.className="physical-square "+((Math.floor(visual/8)+visual%8)%2?"dark":"light");
    b.textContent=pieces[squares[i]]||"";
    b.setAttribute("aria-label",String.fromCharCode(97+i%8)+(8-Math.floor(i/8))+" "+(squares[i]||"empty"));
    b.addEventListener("click",()=>{squares[i]=chosen;draw()});
    board.append(b);
  }
}
for(const key of ["",...Object.keys(pieces)]){
  const b=document.createElement("button");b.type="button";b.className="physical-piece";
  b.textContent=pieces[key]||"×";b.title=key||"Erase";b.setAttribute("aria-pressed",String(chosen===key));
  b.onclick=()=>{chosen=key;palette.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b)))};
  palette.append(b);
}
root.querySelector(".physical-clear").onclick=()=>{squares.fill("");draw();status.textContent="Board cleared."};
root.querySelector(".physical-flip").onclick=()=>{flipped=!flipped;draw()};
root.querySelector(".physical-import").onclick=()=>{
  if(squares.filter(x=>x==="K").length!==1||squares.filter(x=>x==="k").length!==1){
    status.textContent="Place exactly one white king and one black king.";return;
  }
  const ranks=[];
  for(let r=0;r<8;r++){
    let rank="",empty=0;
    for(let c=0;c<8;c++){
      const p=squares[r*8+c];
      if(!p){empty++;continue}
      if(empty){rank+=empty;empty=0}rank+=p;
    }
    if(empty)rank+=empty;ranks.push(rank);
  }
  const side=document.getElementById("position-side").value;
  const fen=ranks.join("/")+" "+side+" - - 0 1";
  const tab=document.querySelector('[data-mode="fen"]');
  if(!tab){status.textContent="FEN import is unavailable.";return}
  tab.click();
  document.getElementById("import-value").value=fen;
  document.getElementById("load")?.click();
  status.textContent="Position sent to analysis. Check the board. Castling and en passant default to unavailable.";
};
draw();
