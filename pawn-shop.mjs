// Chess club cosmetic catalog. Local-only virtual coins, no payment or gameplay advantage.
export const PIECE_ORDER=Object.freeze(['pawn','bishop','knight','rook','queen','king']);
export const PIECE_LABELS=Object.freeze({pawn:'Pawn',bishop:'Bishop',knight:'Knight',rook:'Rook',queen:'Queen',king:'King'});
const styles=[
 {id:'ivory',label:'Ivory',color:'#e8d6b4',accent:'#fff9e8',trim:'#b6986b'},
 {id:'emerald',label:'Emerald',color:'#3fae8a',accent:'#a6f3d1',trim:'#e9ce7a'},
 {id:'midnight',label:'Midnight',color:'#475d8a',accent:'#a5bde8',trim:'#e0b873'},
 {id:'royal',label:'Royal Gold',color:'#c99a42',accent:'#ffebaa',trim:'#fff6d5'},
 {id:'obsidian',label:'Obsidian',color:'#343444',accent:'#9895b4',trim:'#f1bc7b'}
];
const prices={pawn:[0,150,400,900,1500],bishop:[3500,4100,4700,5400,6200],knight:[2200,2800,3400,4100,4900],rook:[5000,5700,6500,7400,8400],queen:[9000,10000,11200,12500,14000],king:[14000,15500,17200,19000,21000]};
export const PAWN_SHOP=Object.freeze(PIECE_ORDER.flatMap(kind=>styles.map((style,index)=>Object.freeze({
 id:kind==='pawn'&&index<4?style.id:kind!=='pawn'&&index===0?kind:kind+'-'+style.id,
 name:style.label+' '+PIECE_LABELS[kind],kind,cost:prices[kind][index],
 color:style.color,accent:style.accent,trim:style.trim
}))));
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
 if(row<3||row%4!==2||model.lane(row)==='river')return false;
 return x===Math.floor(model.random(row*167+41)*9);
};
