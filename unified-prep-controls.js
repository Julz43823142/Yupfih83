// Keep the same board-control sidebar as Analysis and Play Bots.
const layout=document.querySelector('.prep-analysis-layout');
const stats=layout?.querySelector('.prep-stats-side');
const controls=layout?.parentElement?.querySelector('.board-controls.elo-board-toolbar');
if(layout&&stats&&controls){
 const side=document.createElement('aside');side.className='prep-control-stack';
 const panel=document.createElement('section');panel.className='board-control-panel prep-controls-panel';
 const heading=document.createElement('h2');heading.textContent='Board Controls';
 panel.append(heading,controls);side.append(panel,stats);layout.prepend(side);
}
