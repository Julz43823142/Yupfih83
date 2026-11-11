// Original synthesized chess-club soundtrack and SFX: no external music or licenses.
// Audio is unlocked only by a player gesture; music and SFX have separate gain controls.
export function createPawnSound(){
 let ctx=null,muted=false,musicOn=true,paused=false,master=.75,effects=.75,music=.32;
 let timer=null,beat=0,nextBeat=0,masterNode=null,sfxNode=null,musicNode=null;
 const clamp=v=>Math.max(0,Math.min(1,Number.isFinite(Number(v))?Number(v):0));
 const ensure=()=>{
  try{
   const C=globalThis.AudioContext||globalThis.webkitAudioContext;
   if(!C)return null;
   if(!ctx){
    ctx=new C();
    masterNode=ctx.createGain();sfxNode=ctx.createGain();musicNode=ctx.createGain();
    sfxNode.connect(masterNode);musicNode.connect(masterNode);masterNode.connect(ctx.destination);
    apply();
   }
   if(ctx.state==='suspended')ctx.resume().catch(()=>{});
   return ctx;
  }catch{return null}
 };
 function apply(){
  if(!ctx)return;
  masterNode.gain.setTargetAtTime(muted?0:master,ctx.currentTime,.025);
  sfxNode.gain.setTargetAtTime(effects,ctx.currentTime,.025);
  musicNode.gain.setTargetAtTime(musicOn&&!paused?music:0,ctx.currentTime,.04);
 }
 function tone(freq,duration,shape='sine',gain=.035,offset=0,slide=1,bus='sfx'){
  const a=ensure();if(!a)return;
  try{
   const start=a.currentTime+offset,o=a.createOscillator(),v=a.createGain();
   o.type=shape;o.frequency.setValueAtTime(Math.max(35,freq),start);
   o.frequency.exponentialRampToValueAtTime(Math.max(35,freq*slide),start+duration);
   v.gain.setValueAtTime(.0001,start);v.gain.exponentialRampToValueAtTime(Math.max(.00011,gain),start+.014);
   v.gain.exponentialRampToValueAtTime(.0001,start+duration);
   o.connect(v);v.connect(bus==='music'?musicNode:sfxNode);
   o.start(start);o.stop(start+duration+.015);
  }catch{}
 }
 function splash(){
  const a=ensure();if(!a)return;
  // Short filtered-noise splash plus a falling bubble, not an electronic impact.
  try{
   const length=Math.floor(a.sampleRate*.48),buffer=a.createBuffer(1,length,a.sampleRate),data=buffer.getChannelData(0);
   for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/(a.sampleRate*.12));
   const source=a.createBufferSource(),filter=a.createBiquadFilter(),gain=a.createGain();
   source.buffer=buffer;filter.type='lowpass';filter.frequency.setValueAtTime(3200,a.currentTime);
   filter.frequency.exponentialRampToValueAtTime(230,a.currentTime+.43);
   gain.gain.value=.12;source.connect(filter);filter.connect(gain);gain.connect(sfxNode);
   source.start();source.stop(a.currentTime+.48);
  }catch{}
  tone(280,.35,'sine',.055,0,.19);
  tone(145,.28,'triangle',.028,.07,.35);
 }
 // Original mechanical waltz: music-box arpeggios, clock ticks and brass-like bass.
 // Industrial mystery mood, with no borrowed melody or recordings.
 const melody=[392,466.16,587.33,698.46,587.33,466.16,349.23,0,
               392,523.25,622.25,783.99,698.46,523.25,466.16,0,
               349.23,440,523.25,659.25,587.33,440,392,0,
               311.13,392,466.16,587.33,523.25,466.16,392,0];
 const bass=[98,116.54,87.31,103.83,98,130.81,77.78,116.54];
 const beatLength=.31;
 function schedule(){
  if(!ctx||muted||paused||!musicOn||music<=0)return;
  const now=ctx.currentTime;
  if(nextBeat<now-.25)nextBeat=now+.06;
  let count=0;
  while(nextBeat<now+.35&&count++<4){
   const n=beat%melody.length,offset=Math.max(0,nextBeat-now);
   if(melody[n]){
    tone(melody[n],.18,'triangle',.026,offset,.998,'music');
    tone(melody[n]*2,.12,'sine',.009,offset+.018,.995,'music');
   }
   if(n%4===0){
    const low=bass[Math.floor(n/4)];
    tone(low,.85,'sawtooth',.016,offset,.985,'music');
    tone(low*2,.34,'triangle',.017,offset,1,'music');
   }
   // An escapement tick on every beat and a tiny metallic counter-tick.
   tone(n%2?1300:1900,.018,'square',.004,offset, .72,'music');
   if(n%2===1)tone(2600,.012,'sine',.002,offset+.15,.78,'music');
   if(n%8===6)tone(233.08,.38,'triangle',.012,offset,.96,'music');
   beat++;nextBeat+=beatLength;
  }
 }
 function startMusic(){
  if(!musicOn||muted||paused||music<=0)return;
  const a=ensure();if(!a)return;
  if(!timer){nextBeat=a.currentTime+.09;timer=setInterval(schedule,110)}
  apply();schedule();
 }
 function stopMusic(){
  if(timer){clearInterval(timer);timer=null}
  if(ctx)nextBeat=ctx.currentTime+.09;
  apply();
 }
 const play=kind=>{
  if(muted||effects<=0)return;
  if(kind==='step')tone(240,.095,'triangle',.028,0,.77);
  if(kind==='coin'){tone(740,.10,'sine',.055);tone(1108,.2,'sine',.044,.085)}
  if(kind==='water')splash();
  if(kind==='hit'){tone(360,.13,'square',.027,0,.65);tone(155,.28,'sawtooth',.025,.08,.46);tone(95,.4,'triangle',.034,.05,.35)}
  if(kind==='menu'){tone(440,.08,'triangle',.022);tone(660,.11,'triangle',.019,.06)}
  if(kind==='buy'){tone(440,.11,'sine',.036);tone(554,.11,'sine',.034,.09);tone(740,.18,'sine',.04,.17)}
  if(kind==='equip')tone(570,.13,'triangle',.03);
 };
 return {
  play,unlock(){ensure();startMusic()},
  get muted(){return muted},get musicOn(){return musicOn},
  get volumes(){return {master,effects,music}},
  setMuted(v){muted=!!v;if(muted)stopMusic();else{apply();startMusic()}},
  setMusicOn(v){musicOn=!!v;if(musicOn)startMusic();else stopMusic();apply()},
  setVolume(kind,value){if(!['master','effects','music'].includes(kind))return;const v=clamp(value);if(kind==='master')master=v;if(kind==='effects')effects=v;if(kind==='music')music=v;apply();if(kind==='music'){if(v===0)stopMusic();else startMusic()}},
  setPaused(v){paused=!!v;if(paused)stopMusic();else startMusic();apply()},
  destroy(){stopMusic();if(ctx){ctx.close().catch(()=>{});ctx=null}}
 };
}
