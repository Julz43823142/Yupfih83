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
  // Readable side-profile mechanical horse: muzzle points LEFT, neck slopes RIGHT.
  // Strong single silhouette, not a humanoid mask or an abstract gear.
  poly([[-.12,-.43],[-.27,-.58],[-.43,-.60],[-.48,-.70],[-.43,-.80],
        [-.31,-.83],[-.32,-.99],[-.24,-1.16],[-.10,-1.05],[.02,-1.13],
        [.16,-.97],[.23,-.74],[.18,-.52],[.13,-.43]],outline);
  poly([[-.10,-.47],[-.23,-.62],[-.39,-.65],[-.42,-.71],[-.38,-.76],
        [-.25,-.78],[-.26,-.99],[-.22,-1.08],[-.10,-.98],[.01,-1.06],
        [.11,-.94],[.17,-.73],[.12,-.55],[.09,-.47]],gradient);
  // Wide rectangular snout, a mechanical lower jaw and visible nostril.
  rect(-.47,-.76,.22,.095,trim,.025);
  rect(-.44,-.68,.045,.035,outline,.012,null);
  ctx.strokeStyle=outline;ctx.lineWidth=u*.023;ctx.beginPath();ctx.moveTo(-u*.44,-u*.65);ctx.lineTo(-u*.28,-u*.65);ctx.stroke();
  // Distinct pointed ears and riveted plate along the back of the mane.
  poly([[-.26,-1.04],[-.27,-1.26],[-.13,-1.13]],trim);
  poly([[-.07,-1.08],[.03,-1.23],[.07,-1.01]],outline);
  for(let i=0;i<4;i++){
   const yy=-1.00+i*.13;
   poly([[.10,yy],[.28,yy+.04],[.13,yy+.11]],trim);
  }
  ellipse(-.28,-.90,.059,.063,outline);
  ellipse(-.29,-.91,.033,.036,'#9df5df');
  // Jaw hinge and a little brass winding key in the neck.
  ellipse(.04,-.65,.085,.085,outline);
  ellipse(.04,-.65,.052,.052,trim);
  ellipse(.04,-.65,.020,.020,outline);
  ctx.strokeStyle=trim;ctx.lineWidth=u*.026;ctx.beginPath();ctx.moveTo(.04*u,-.65*u);ctx.lineTo(.16*u,-.65*u);ctx.stroke();
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
