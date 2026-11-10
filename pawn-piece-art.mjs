// Original vector-style chess figurines. Shared by gameplay and shop previews.
export function paintChessPiece(ctx,kind,skin,x,y,size,{enemy=false,jump=0,shadow=true}={}){
 const u=size,base=skin.color,light=skin.accent,trim=skin.trim||'#dfbd7c';
 ctx.save();ctx.translate(x,y-jump*u*.34);
 const path=(pts,fill)=>{ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(pts[0][0]*u,pts[0][1]*u);for(const p of pts.slice(1))ctx.lineTo(p[0]*u,p[1]*u);ctx.closePath();ctx.fill()};
 const rect=(x,y,w,h,color,r=.02)=>{ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x*u,y*u,w*u,h*u,r*u);ctx.fill()};
 const ellipse=(x,y,rx,ry,color)=>{ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x*u,y*u,rx*u,ry*u,0,0,Math.PI*2);ctx.fill()};
 if(shadow)ellipse(0,.22,.31,.105,'#14232b70');
 const shade=ctx.createLinearGradient(-u*.28,0,u*.28,0);
 shade.addColorStop(0,base);shade.addColorStop(.36,light);shade.addColorStop(.76,base);shade.addColorStop(1,'#443e4d');
 const edge=enemy?'#543040':'#655344';
 rect(-.28,.045,.56,.13,edge,.045);
 rect(-.25,.025,.5,.105,shade,.04);
 rect(-.215,-.055,.43,.11,trim,.025);
 path([[-.20,-.06],[.20,-.06],[.13,-.48],[-.13,-.48]],edge);
 path([[-.17,-.07],[.17,-.07],[.102,-.45],[-.102,-.45]],shade);
 rect(-.19,-.51,.38,.095,edge,.026);
 rect(-.155,-.505,.31,.075,shade,.023);
 if(kind==='pawn'){
  ellipse(0,-.685,.205,.205,edge);ellipse(0,-.715,.173,.173,shade);
  ellipse(-.06,-.785,.06,.03,'#ffffff9c');
 }else if(kind==='bishop'){
  ellipse(0,-.70,.155,.24,edge);ellipse(0,-.71,.127,.207,shade);
  ellipse(0,-.94,.045,.05,trim);
  ctx.strokeStyle=edge;ctx.lineWidth=u*.036;ctx.beginPath();ctx.moveTo(.095*u,-.86*u);ctx.lineTo(-.09*u,-.61*u);ctx.stroke();
 }else if(kind==='knight'){
  path([[-.20,-.47],[-.12,-.71],[-.25,-.83],[-.13,-1.02],[.05,-1.06],[.22,-.84],[.26,-.59],[.13,-.47]],edge);
  path([[-.14,-.51],[-.07,-.70],[-.19,-.82],[-.08,-.96],[.035,-.99],[.17,-.82],[.19,-.58],[.09,-.50]],shade);
  ellipse(-.075,-.86,.027,.034,edge);
  path([[.05,-1.04],[.18,-.92],[.10,-.92]],trim);
 }else if(kind==='rook'){
  rect(-.20,-.76,.40,.27,edge,.02);rect(-.165,-.74,.33,.23,shade,.015);
  rect(-.25,-.82,.5,.075,edge,.015);
  for(const p of [-.22,-.065,.09])rect(p,-.98,.13,.17,shade,.01);
  rect(-.24,-.83,.48,.05,trim,.008);
 }else if(kind==='queen'||kind==='king'){
  path([[-.23,-.49],[-.28,-.91],[-.13,-.75],[0,-1.06],[.13,-.75],[.28,-.91],[.23,-.49]],edge);
  path([[-.19,-.51],[-.22,-.85],[-.12,-.69],[0,-.98],[.12,-.69],[.22,-.85],[.19,-.51]],shade);
  rect(-.245,-.56,.49,.07,trim,.015);
  for(const xx of [-.23,0,.23])ellipse(xx,xx===0?-1.03:-.88,.043,.045,trim);
  if(kind==='king'){
   ctx.strokeStyle=trim;ctx.lineWidth=u*.055;ctx.lineCap='round';ctx.beginPath();
   ctx.moveTo(0,-1.19*u);ctx.lineTo(0,-.97*u);ctx.moveTo(-.11*u,-1.105*u);ctx.lineTo(.11*u,-1.105*u);ctx.stroke();
  }
 }
 // Fine rim lighting, legible at mobile scale.
 ctx.strokeStyle='#fff7e45c';ctx.lineWidth=Math.max(1,u*.013);
 ctx.beginPath();ctx.moveTo(-.14*u,-.37*u);ctx.lineTo(-.185*u,-.09*u);ctx.stroke();
 ctx.restore();
}
