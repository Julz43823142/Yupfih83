// One-click leaderboard reporting. Delivery and duplicate checks run server-side.
document.addEventListener("click",async event=>{
 const button=event.target.closest("button.rank-report");
 if(!button||button.disabled)return;
 const nickname=button.dataset.nickname,mode=button.dataset.mode,score=Number(button.dataset.score);
 if(!nickname||!["sprint","survival"].includes(mode))return;
 button.disabled=true;button.textContent="Sending...";
 try{
  const response=await fetch("/api/puzzle-report",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nickname,mode,score})});
  const result=await response.json();
  if(!response.ok)throw Error(result.error||"Could not send report.");
  button.textContent="Reported";button.title="Report submitted";
 }catch(error){
  button.textContent="Report";button.disabled=false;
  alert(error.message||"Could not send report.");
 }
});
