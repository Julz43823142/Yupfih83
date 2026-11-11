// Sculpted, high-contrast wooden and enamel chess figurines.
// A single silhouette renderer powers enemies, the player and shop previews.
export function paintChessPiece(ctx,kind,skin,x,y,size,{enemy=false,jump=0,shadow=true}={}){
 const u=size,base=skin.color||'#bba17a',light=skin.accent||'#f5dfae',trim=skin.trim||'#d8b36e';
 ctx.save();ctx.translate(x,y-jump*u*.34);
 const outline=enemy?'#482631':'#30251e';
 const poly=(pts,fill,stroke=outline)=>{ctx.beginPath();ctx.moveTo(pts[0][0]*u,pts[0][1]*u);for(const p of pts.slice(1))ctx.lineTo(p[0]*u,p[1]*u);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.lineWidth=u*.025;ctx.strokeStyle=stroke;ctx.stroke()}};
 const ellipse=(x,y,rx,ry,fill,stroke)=>{ctx.beginPath();ctx.ellipse(x*u,y*u,rx*u,ry*u,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=u*.023;ctx.stroke()}};
 const rect=(x,y,w,h,fill,r=.02,stroke=outline)=>{ctx.beginPath();ctx.roundRect(x*u,y*u,w*u,h*u,r*u);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.lineWidth=u*.021;ctx.strokeStyle=stroke;ctx.stroke()}};
 const gradient=ctx.createLinearGradient(-u*.3,-u*.6,u*.27,-u*.52);
 gradient.addColorStop(0,outline);gradient.addColorStop(.17,base);gradient.addColorStop(.48,light);gradient.addColorStop(.74,base);gradient.addColorStop(1,outline);
 if(shadow)ellipse(0,.235,.32,.085,'#130e0b66');
 // Layered turned-wood foot, wide enough to read but never hide the square.
 ellipse(0,.12,.29,.095,outline);
 rect(-.28,.055,.56,.105,gradient,.04);
 rect(-.24,.005,.48,.085,trim,.035);
 ellipse(0,.015,.235,.045,gradient,outline);
 // Tapered shaft and collar.
 poly([[-.18,-.02],[.18,-.02],[.125,-.42],[-.125,-.42]],gradient);
 rect(-.19,-.46,.38,.085,gradient,.025);
 rect(-.165,-.475,.33,.035,trim,.014,null);
 if(kind==='pawn'){
  ellipse(0,-.68,.19,.20,outline);
  ellipse(0,-.705,.16,.168,gradient);
  ellipse(-.062,-.785,.05,.029,'#fff7df70');
 }else if(kind==='bishop'){
  ellipse(0,-.70,.17,.245,outline);
  ellipse(0,-.715,.139,.207,gradient);
  ctx.beginPath();ctx.moveTo(-.10*u,-.58*u);ctx.lineTo(.11*u,-.88*u);ctx.strokeStyle=outline;ctx.lineWidth=u*.043;ctx.stroke();
  ellipse(0,-.985,.045,.05,trim,outline);
 }else if(kind==='knight'){
  // Articulated brass automaton horse: long muzzle, clear jaw, crest and gears.
  poly([[-.20,-.44],[-.24,-.57],[-.36,-.69],[-.34,-.83],[-.20,-.86],[-.19,-1.04],[-.09,-1.16],[.01,-1.00],[.12,-1.12],[.22,-.97],[.27,-.75],[.21,-.55],[.11,-.44]],outline);
  poly([[-.16,-.48],[-.20,-.60],[-.30,-.72],[-.29,-.79],[-.15,-.80],[-.14,-1.01],[-.08,-1.08],[.015,-.93],[.11,-1.05],[.16,-.92],[.22,-.73],[.16,-.55],[.08,-.48]],gradient);
  // A pronounced jaw and segmented mechanical muzzle.
  poly([[-.33,-.76],[-.18,-.77],[-.11,-.68],[-.24,-.65],[-.37,-.69]],trim);
  rect(-.35,-.76,.14,.035,outline,.008,null);
  ctx.strokeStyle=trim;ctx.lineWidth=u*.037;ctx.beginPath();ctx.moveTo(.15*u,-.94*u);ctx.lineTo(.20*u,-.74*u);ctx.lineTo(.12*u,-.54*u);ctx.stroke();
  // Glowing monocular eye, riveted cheek and steel mane.
  ellipse(-.17,-.87,.062,.064,outline);
  ellipse(-.18,-.88,.035,.038,'#a2f3d7');
  ellipse(.035,-.71,.09,.10,outline);
  ellipse(.035,-.71,.052,.06,trim);
  ellipse(.035,-.71,.018,.022,outline);
  for(let i=0;i<4;i++){
   const yy=-.95+i*.105;
   poly([[.15,yy],[.30,yy+.045],[.18,yy+.09]],trim,outline);
  }
 }else if(kind==='rook'){
  rect(-.19,-.80,.38,.36,gradient,.015);
  rect(-.26,-.84,.52,.085,trim,.015);
  for(const a of [-.23,-.07,.09])rect(a,-1.04,.14,.20,gradient,.012);
  rect(-.25,-.89,.50,.055,outline,.009,null);
  rect(-.11,-.68,.22,.16,'#352a2877',.025,null);
 }else if(kind==='queen'){
  poly([[-.23,-.45],[-.30,-.93],[-.14,-.77],[0,-1.08],[.14,-.77],[.30,-.93],[.23,-.45]],outline);
  poly([[-.19,-.48],[-.24,-.84],[-.12,-.69],[0,-.99],[.12,-.69],[.24,-.84],[.19,-.48]],gradient);
  for(const a of [-.26,0,.26])ellipse(a,a===0?-1.07:-.92,.046,.05,trim,outline);
  rect(-.24,-.55,.48,.08,trim,.02);
 }else if(kind==='king'){
  poly([[-.21,-.46],[-.25,-.82],[-.14,-.90],[.14,-.90],[.25,-.82],[.21,-.46]],gradient);
  rect(-.25,-.57,.5,.075,trim,.02);
  ellipse(0,-.91,.16,.07,gradient,outline);
  rect(-.045,-1.18,.09,.31,trim,.015);
  rect(-.145,-1.10,.29,.075,trim,.015);
 }
 // A warm rim light makes the silhouette readable on dark wooden squares.
 ctx.strokeStyle='#fff0c08c';ctx.lineWidth=Math.max(1,u*.014);ctx.lineCap='round';
 ctx.beginPath();ctx.moveTo(-.15*u,-.35*u);ctx.lineTo(-.18*u,-.11*u);ctx.stroke();
 ctx.restore();
}
