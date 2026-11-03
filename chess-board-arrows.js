// Shared chessboard arrow geometry for Analysis and Repertoire Explorer.
export function appendChessArrow(svg,from,to,color,opacity=.78){
 const ns='http://www.w3.org/2000/svg',el=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));svg.append(n);return n};
 const pt=s=>[(s.charCodeAt(0)-97)*100+50,(8-Number(s[1]))*100+50];
 const [x1,y1]=pt(from),[x2,y2]=pt(to),dx=x2-x1,dy=y2-y1,d=Math.hypot(dx,dy);if(!d)return;
 const rainbow=color==='rainbow';
 if(rainbow){
  const defs=svg.querySelector('defs')||el('defs',{});
  const id='chess-rainbow-'+Math.random().toString(36).slice(2);
  const grad=document.createElementNS(ns,'linearGradient');
  for(const [k,v] of Object.entries({id,gradientUnits:'userSpaceOnUse',x1,y1,x2,y2}))grad.setAttribute(k,String(v));
  ['#ff1744','#ff9100','#ffee00','#21d65b','#00bfff','#5144ff','#bf38ff'].forEach((c,i)=>{
   const stop=document.createElementNS(ns,'stop');
   stop.setAttribute('offset',(i/6*100)+'%');
   stop.setAttribute('stop-color',c);
   grad.append(stop);
  });
  defs.append(grad);
  color='url(#'+id+')';
 }
 const fd=Math.abs(from.charCodeAt(0)-to.charCodeAt(0)),rd=Math.abs(Number(from[1])-Number(to[1]));
 if((fd===1&&rd===2)||(fd===2&&rd===1)){
  const bend=fd===2?[x2,y1]:[x1,y2],vx=x2-bend[0],vy=y2-bend[1],vd=Math.hypot(vx,vy),ux=vx/vd,uy=vy/vd;
  const tip=[x2-ux*10,y2-uy*10],base=[x2-ux*42,y2-uy*42],shaftEnd=base;
  el('polyline',{points:[[x1,y1],bend,shaftEnd].map(p=>p.join(',')).join(' '),fill:'none',stroke:color,'stroke-opacity':opacity,'stroke-width':13,'stroke-linejoin':'round','stroke-linecap':'butt'});
  el('polygon',{points:[tip,[base[0]-uy*20,base[1]+ux*20],[base[0]+uy*20,base[1]-ux*20]].map(p=>p.join(',')).join(' '),fill:color,'fill-opacity':opacity});return;
 }
 const ux=dx/d,uy=dy/d,px=-uy,py=ux,tip=[x2-ux*15,y2-uy*15],base=[x2-ux*54,y2-uy*54],tail=[x1+ux*15,y1+uy*15];
 const pts=[[tail[0]+px*6,tail[1]+py*6],[base[0]+px*6,base[1]+py*6],[base[0]+px*18,base[1]+py*18],tip,[base[0]-px*18,base[1]-py*18],[base[0]-px*6,base[1]-py*6],[tail[0]-px*6,tail[1]-py*6]];
 el('polygon',{points:pts.map(p=>p.join(',')).join(' '),fill:color,'fill-opacity':opacity,stroke:color,'stroke-opacity':opacity*.65,'stroke-width':1,'stroke-linejoin':'round'});
}
