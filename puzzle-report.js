// Confirm reports before sending. The server validates the entry and prevents duplicates.
const reportDialog=document.createElement("dialog");
reportDialog.className="nickname-report-dialog";
reportDialog.setAttribute("aria-labelledby","nickname-report-title");
reportDialog.innerHTML=`
 <form method="dialog" class="nickname-report-panel">
  <h2 id="nickname-report-title">Report nickname</h2>
  <p class="nickname-report-question"></p>
  <p class="nickname-report-explanation">Only report inappropriate nicknames. This is not for reporting scores or other issues. Reports are reviewed manually.</p>
  <div class="nickname-report-actions">
   <button type="submit" value="cancel" class="nickname-report-cancel">Cancel</button>
   <button type="submit" value="report" class="nickname-report-submit">Report nickname</button>
  </div>
 </form>`;
document.body.append(reportDialog);
let pendingReport=null;
reportDialog.addEventListener("close",async()=>{
 const report=pendingReport;pendingReport=null;
 if(reportDialog.returnValue!=="report"||!report)return;
 const {button,nickname,mode,score}=report;
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
document.addEventListener("click",event=>{
 const button=event.target.closest("button.rank-report");
 if(!button||button.disabled||reportDialog.open)return;
 const nickname=button.dataset.nickname,mode=button.dataset.mode,score=Number(button.dataset.score);
 if(!nickname||!["sprint","survival"].includes(mode)||!Number.isInteger(score))return;
 pendingReport={button,nickname,mode,score};
 reportDialog.querySelector(".nickname-report-question").textContent='Are you sure you want to report "'+nickname+'"?';
 reportDialog.showModal();
});
