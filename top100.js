document.getElementById("year").textContent=new Date().getFullYear();
const tbody=document.getElementById("top100-rows");
const validUser=name=>/^[a-z0-9_-]{3,25}$/i.test(name);
function cell(row,value,className){
  const td=document.createElement("td");
  if(className)td.className=className;
  td.textContent=String(value);
  row.appendChild(td);return td;
}
async function load(){
  try{
    const response=await fetch("/api/sus/top?limit=100",{cache:"no-store"});
    if(!response.ok)throw Error("The ranking is not available yet.");
    const data=await response.json();
    tbody.replaceChildren();
    if(!data.players?.length){
      const row=document.createElement("tr");cell(row,"No SUS votes yet.").colSpan=5;tbody.appendChild(row);return;
    }
    for(const [index,item] of data.players.entries()){
      if(!validUser(item.username))continue;
      const row=document.createElement("tr");
      cell(row,index+1,"top100-position");
      const player=cell(row,"");const profile=document.createElement("a");
      profile.href="https://www.chess.com/member/"+encodeURIComponent(item.username);
      profile.textContent=item.username;profile.target="_blank";profile.rel="noopener noreferrer";player.appendChild(profile);
      cell(row,Number(item.votes||0).toLocaleString("en-US"),"top100-votes");
      const raw=String(item.priority||"").toUpperCase().replace(/[-_]/g," ");
      const priority=["LOW","MODERATE","HIGH","VERY HIGH"].includes(raw)?raw:"Not available";
      const score=cell(row,priority,"top100-priority");
      if(priority!=="Not available")score.classList.add("priority-"+priority.toLowerCase().replaceAll(" ","-"));
      const action=cell(row,"");const link=document.createElement("a");
      link.className="top100-analyze";link.href="/?analyze="+encodeURIComponent(item.username);
      link.textContent="Analyze →";action.appendChild(link);
      tbody.appendChild(row);
    }
  }catch{
    tbody.replaceChildren();const row=document.createElement("tr");
    cell(row,"Ranking temporarily unavailable.").colSpan=5;tbody.appendChild(row);
  }
}
load();