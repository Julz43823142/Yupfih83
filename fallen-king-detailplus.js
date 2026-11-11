/* DetailPlus: reusable CC0 glTF mesh importer into the original 2.5D vertex-color renderer.
   Kenney assets are embedded in fallen-king-detailplus-assets.js (CC0 1.0).
   UV colors from the bundled color-map PNG are baked once into mesh triangles.
   The original WebGL shaders, camera, character meshes, input and admin gate remain untouched. */
(()=>{
'use strict';
const packed=window.FallenKingDetailPlusAssetData||{},models=Object.create(null);
const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
const bytesFor={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const hex=x=>Math.max(0,Math.min(255,Math.round(x*255))).toString(16).padStart(2,'0');
const rgb=(r,g,b)=>'#'+hex(r)+hex(g)+hex(b);
function decode64(str){
 const t=atob(str);const bytes=new Uint8Array(t.length);
 for(let i=0;i<t.length;i++)bytes[i]=t.charCodeAt(i);
 return bytes;
}
function parseGLB(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(v.getUint32(0,true)!==0x46546c67||v.getUint32(4,true)!==2)throw Error('Invalid GLB');
 const jsonSize=v.getUint32(12,true),json=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+jsonSize)));
 const next=20+jsonSize;
 if(v.getUint32(next+4,true)!==0x004e4942)throw Error('GLB binary chunk missing');
 const bin=bytes.subarray(next+8,next+8+v.getUint32(next,true));
 return {json,bin};
}
function readAccessor(data,idx){
 const a=data.json.accessors[idx],bv=data.json.bufferViews[a.bufferView],n=components[a.type];
 if(!a||!bv||!n||!bytesFor[a.componentType])throw Error('Unsupported glTF accessor');
 const off=(bv.byteOffset||0)+(a.byteOffset||0),stride=bv.byteStride||bytesFor[a.componentType]*n,view=new DataView(data.bin.buffer,data.bin.byteOffset,data.bin.byteLength);
 const out=new Float32Array(a.count*n);
 function read(at){switch(a.componentType){case 5121:return view.getUint8(at);case 5120:return view.getInt8(at);case 5122:return view.getInt16(at,true);case 5123:return view.getUint16(at,true);case 5125:return view.getUint32(at,true);case 5126:return view.getFloat32(at,true);default:return 0;}}
 for(let i=0;i<a.count;i++)for(let c=0;c<n;c++)out[i*n+c]=read(off+i*stride+c*bytesFor[a.componentType]);
 return out;
}
function transform(v,node){
 let p=[v[0],v[1],v[2]];
 if(node.matrix){const m=node.matrix;return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];}
 if(node.scale){p[0]*=node.scale[0];p[1]*=node.scale[1];p[2]*=node.scale[2];}
 if(node.rotation){const q=node.rotation,x=p[0],y=p[1],z=p[2],a=q[0],b=q[1],c=q[2],d=q[3];p=[(1-2*b*b-2*c*c)*x+2*(a*b-c*d)*y+2*(a*c+b*d)*z,2*(a*b+c*d)*x+(1-2*a*a-2*c*c)*y+2*(b*c-a*d)*z,2*(a*c-b*d)*x+2*(b*c+a*d)*y+(1-2*a*a-2*b*b)*z];}
 if(node.translation){p[0]+=node.translation[0];p[1]+=node.translation[1];p[2]+=node.translation[2];}
 return p;
}
function parseModel(id,data){
 const {json,bin}=data,access=new Map(),tris=[],bound={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
 const acc=i=>{if(!access.has(i))access.set(i,readAccessor(data,i));return access.get(i)};
 const nodes=json.nodes||[];
 const scene=json.scenes?.[json.scene||0]||json.scenes?.[0]||{nodes:nodes.map((_,i)=>i)};
 function putNode(index,chain=[]){
  const node=nodes[index];if(!node)return;
  const path=[...chain,node];
  if(node.mesh!==undefined){
   for(const primitive of json.meshes[node.mesh].primitives||[]){
    if(primitive.mode!==undefined&&primitive.mode!==4)continue;
    const pos=acc(primitive.attributes.POSITION),uv=primitive.attributes.TEXCOORD_0===undefined?null:acc(primitive.attributes.TEXCOORD_0);
    const idx=primitive.indices===undefined?Array.from({length:pos.length/3},(_,i)=>i):acc(primitive.indices);
    const mat=json.materials?.[primitive.material||0]||{},pbr=mat.pbrMetallicRoughness||{},factor=pbr.baseColorFactor||[.65,.61,.56,1];
    const image=pbr.baseColorTexture?json.textures?.[pbr.baseColorTexture.index]?.source:null;
    for(let i=0;i+2<idx.length;i+=3){
     const pts=[],uvs=[];
     for(let j=0;j<3;j++){
      const k=idx[i+j],p=[pos[k*3],pos[k*3+1],pos[k*3+2]];
      for(let n=path.length-1;n>=0;n--)p.splice(0,3,...transform(p,path[n]));
      pts.push(p);
      for(let n=0;n<3;n++){bound.min[n]=Math.min(bound.min[n],p[n]);bound.max[n]=Math.max(bound.max[n],p[n]);}
      if(uv)uvs.push([uv[k*2],uv[k*2+1]]);
     }
     tris.push({p:pts,uv:uvs.length?[(uvs[0][0]+uvs[1][0]+uvs[2][0])/3,(uvs[0][1]+uvs[1][1]+uvs[2][1])/3]:null,image:typeof image==='number'?image:null,factor,base:rgb(...factor),color:rgb(...factor)});
    }
   }
  }
  for(const child of node.children||[])putNode(child,path);
 }
 for(const n of scene.nodes||[])putNode(n);
 const model={id,tris,bound,images:[],ready:true};
 const imageDefs=json.images||[];
 for(let n=0;n<imageDefs.length;n++){
  const im=imageDefs[n];if(im.bufferView===undefined)continue;
  const bv=json.bufferViews[im.bufferView],file=bin.slice(bv.byteOffset||0,(bv.byteOffset||0)+bv.byteLength);
  const blob=new Blob([file],{type:im.mimeType||'image/png'});
  const url=URL.createObjectURL(blob),image=new Image();
  image.onload=()=>{
   try{
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    const rgba=ctx.getImageData(0,0,image.width,image.height).data;
    model.images[n]={rgba,w:image.width,h:image.height};
    for(const tri of model.tris){
     if(tri.image!==n||!tri.uv)continue;
     const u=((tri.uv[0]%1)+1)%1,v=((tri.uv[1]%1)+1)%1;
     const x=Math.min(image.width-1,Math.floor(u*image.width)),y=Math.min(image.height-1,Math.floor(v*image.height));
     const at=(y*image.width+x)*4;
     tri.color=rgb((rgba[at]/255)*tri.factor[0],(rgba[at+1]/255)*tri.factor[1],(rgba[at+2]/255)*tri.factor[2]);
    }
   }catch(error){console.warn('DetailPlus texture sampling',id,error);}
   URL.revokeObjectURL(url);window.FallenKingEngine?.invalidate?.();
  };
  image.onerror=()=>{URL.revokeObjectURL(url);};
  image.src=url;
 }
 return model;
}
for(const [id,base64] of Object.entries(packed)){
 try{models[id]=parseModel(id,parseGLB(decode64(base64)));}
 catch(error){console.warn('DetailPlus asset skipped',id,error);}
}
function draw(g,id,x,y,z,w=1,h=1,d=1,rotation=0){
 if(!g?.tri)return false;
 const model=models[id];if(!model?.ready||!model.tris.length)return false;
 const {min,max}=model.bound,span=[Math.max(.001,max[0]-min[0]),Math.max(.001,max[1]-min[1]),Math.max(.001,max[2]-min[2])],sc=[w/span[0],h/span[1],d/span[2]];
 const cx=(min[0]+max[0])/2,cz=(min[2]+max[2])/2,co=Math.cos(rotation),si=Math.sin(rotation);
 function point(p){const xx=(p[0]-cx)*sc[0],zz=(p[2]-cz)*sc[2];return [x+xx*co-zz*si,y+(p[1]-min[1])*sc[1],z+xx*si+zz*co];}
 for(const t of model.tris)g.tri(point(t.p[0]),point(t.p[1]),point(t.p[2]),t.color);
 return true;
}
// A single immutable asset recipe for Aldemar's gold and red-velvet crown.
// Every cutscene uses this EXACT mesh, with only position and scale changing.
function crown(g,x,y,z,s=1){
 if(!g?.tri)return;
 const tri=g.tri,TAU=Math.PI*2,N=24,point=(angle,r,height)=>[x+Math.cos(angle)*r*s,y+height*s,z+Math.sin(angle)*r*s];
 const gold='#d7ad52',bright='#f5d17b',dark='#986732',velvet='#8c263f',ruby='#be354b',gem='#ed5361';
 for(let i=0;i<N;i++){const a=i*TAU/N,b=(i+1)*TAU/N;tri(point(a,.40,0),point(b,.40,0),point(b,.40,.23),gold);tri(point(a,.40,0),point(b,.40,.23),point(a,.40,.23),gold);tri(point(a,.33,.03),point(b,.33,.20),point(b,.33,.03),dark);tri(point(a,.33,.03),point(a,.33,.20),point(b,.33,.20),dark);}
 for(let j=0;j<8;j++){const a=j*TAU/8;tri(point(a-.22,.40,.23),point(a+.22,.40,.23),point(a,.42,.54),bright);tri(point(a-.12,.41,.25),point(a,.44,.49),point(a+.12,.41,.25),gold);}
 for(let k=0;k<10;k++){const a=k*TAU/10,b=(k+1)*TAU/10;tri(point(a,.31,.19),point(b,.31,.19),point(a,.22,.42),velvet);tri(point(b,.31,.19),point(b,.22,.42),point(a,.22,.42),velvet);tri(point(a,.22,.42),point(b,.22,.42),point(a,.06,.49),'#a4314c');}
 for(let j=0;j<8;j++){const a=j*TAU/8;tri(point(a-.07,.42,.14),point(a,.45,.21),point(a+.07,.42,.14),ruby);tri(point(a-.07,.42,.14),point(a+.07,.42,.14),point(a,.45,.08),gem);}
}
window.FallenKingDetailPlus={draw,crown,has:id=>!!models[id]?.ready,stats:()=>Object.fromEntries(Object.entries(models).map(([id,m])=>[id,m.tris.length])),license:'Kenney CC0 1.0',version:1};
})();