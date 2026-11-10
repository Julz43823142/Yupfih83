// Procedural, original chess-club game sounds. Starts only after a user gesture.
export function createPawnSound(){
 let ctx=null,muted=false;
 const ensure=()=>{
  if(muted)return null;
  try{
   const C=globalThis.AudioContext||globalThis.webkitAudioContext;
   if(!C)return null;
   if(!ctx)ctx=new C();
   if(ctx.state==='suspended')ctx.resume().catch(()=>{});
   return ctx;
  }catch{return null}
 };
 function note(freq,duration,shape='sine',gain=.035,offset=0,slide=1){
  const a=ensure();if(!a)return;
  try{
   const start=a.currentTime+offset,o=a.createOscillator(),v=a.createGain();
   o.type=shape;o.frequency.setValueAtTime(freq,start);
   o.frequency.exponentialRampToValueAtTime(Math.max(30,freq*slide),start+duration);
   v.gain.setValueAtTime(.0001,start);v.gain.exponentialRampToValueAtTime(gain,start+.012);
   v.gain.exponentialRampToValueAtTime(.0001,start+duration);
   o.connect(v);v.connect(a.destination);o.start(start);o.stop(start+duration+.01);
  }catch{}
 }
 const play=kind=>{
  if(kind==='step')note(230,.095,'triangle',.022,0,.83);
  if(kind==='coin'){note(660,.11,'sine',.052);note(990,.18,'sine',.042,.09)}
  if(kind==='water'){note(220,.32,'sawtooth',.035,0,.28);note(85,.4,'triangle',.027,.09,.55)}
  if(kind==='hit'){note(340,.12,'square',.032,0,.65);note(140,.28,'sawtooth',.03,.08,.5)}
  if(kind==='menu'){note(420,.08,'triangle',.026);note(620,.1,'triangle',.021,.065)}
  if(kind==='buy'){note(440,.1,'sine',.036);note(554,.1,'sine',.035,.08);note(740,.19,'sine',.04,.17)}
  if(kind==='equip')note(570,.13,'triangle',.025);
 };
 return {play,get muted(){return muted},setMuted(v){muted=!!v;if(muted&&ctx){try{ctx.suspend()}catch{}}},destroy(){if(ctx){ctx.close().catch(()=>{});ctx=null}}};
}
