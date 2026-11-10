// Local-only cosmetic collection: no money, no account charges, no gameplay advantage.
// Values are untrusted browser preferences; never use these for a server leaderboard reward.
export const PAWN_SHOP=Object.freeze([
 {id:'ivory',name:'Ivory Pawn',kind:'pawn',cost:0,color:'#eee1ba',accent:'#fffaf0'},
 {id:'emerald',name:'Emerald Pawn',kind:'pawn',cost:150,color:'#48ba91',accent:'#c7f8d9'},
 {id:'midnight',name:'Midnight Pawn',kind:'pawn',cost:400,color:'#5b7295',accent:'#b7d3f0'},
 {id:'royal',name:'Royal Gold Pawn',kind:'pawn',cost:900,color:'#d7a94b',accent:'#fff0b6'},
 {id:'knight',name:'Ivory Knight',kind:'knight',cost:2200,color:'#f1d7aa',accent:'#fffaf0'},
 {id:'bishop',name:'Ivory Bishop',kind:'bishop',cost:3500,color:'#f1d7aa',accent:'#fffaf0'},
 {id:'rook',name:'Ivory Rook',kind:'rook',cost:5000,color:'#f1d7aa',accent:'#fffaf0'},
 {id:'queen',name:'Ivory Queen',kind:'queen',cost:9000,color:'#f1d7aa',accent:'#fffaf0'},
 {id:'king',name:'Ivory King',kind:'king',cost:14000,color:'#f1d7aa',accent:'#fffaf0'}
]);
const DEFAULT=()=>({coins:0,owned:['ivory'],selected:'ivory'});
const bounded=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000?n:0;
export function readPawnWallet(raw){
 let parsed;
 try{parsed=typeof raw==='string'?JSON.parse(raw):raw}catch{return DEFAULT()}
 if(!parsed||typeof parsed!=='object')return DEFAULT();
 const known=new Set(PAWN_SHOP.map(s=>s.id));
 const owned=[...new Set(['ivory',...(Array.isArray(parsed.owned)?parsed.owned:[]).filter(id=>typeof id==='string'&&known.has(id))])];
 return {coins:bounded(parsed.coins),owned,selected:owned.includes(parsed.selected)?parsed.selected:'ivory'};
}
export function earnPawnCoins(wallet,amount){
 if(!Number.isSafeInteger(amount)||amount<=0)return wallet;
 return {...wallet,coins:Math.min(100000000,wallet.coins+amount)};
}
export function buyPawnSkin(wallet,id){
 const item=PAWN_SHOP.find(x=>x.id===id);
 if(!item)return {wallet,ok:false,reason:'Unknown skin'};
 if(wallet.owned.includes(id))return {wallet:{...wallet,selected:id},ok:true,reason:'Equipped'};
 if(wallet.coins<item.cost)return {wallet,ok:false,reason:'Not enough coins'};
 return {wallet:{coins:wallet.coins-item.cost,owned:[...wallet.owned,id],selected:id},ok:true,reason:'Unlocked'};
}
export const pawnCoinAt=(model,row,x)=>{
 // Only safe meadow and stone-road squares; deterministic by run seed.
 if(row<3||row%4!==2||model.lane(row)==='river')return false;
 return x===Math.floor(model.random(row*167+41)*9);
};
