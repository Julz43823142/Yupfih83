const reportStyles=document.createElement('style');reportStyles.textContent="\n.nickname-report-dialog{width:min(420px,calc(100vw - 36px));max-width:420px;max-height:calc(100dvh - 36px);box-sizing:border-box;padding:0;margin:auto;border:1px solid #36546b;border-radius:16px;background:#091d30;color:#eaf7ff;box-shadow:0 22px 70px rgba(0,0,0,.55)}\n.nickname-report-dialog::backdrop{background:rgba(1,8,17,.78)}\n.nickname-report-panel{padding:24px;display:grid;gap:16px}\n.nickname-report-panel h2{font-size:22px;line-height:1.2;margin:0;color:#f2f8ff}\n.nickname-report-question{font-size:16px;line-height:1.5;margin:0;overflow-wrap:anywhere}\n.nickname-report-explanation{margin:0;padding:13px 15px;border:1px solid #2b5269;border-radius:10px;background:#102b41;color:#b7d0df;font-size:13px;line-height:1.55}\n.nickname-report-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px}\n.nickname-report-actions button{font-family:inherit;font-size:13px;font-weight:750;border-radius:8px;padding:10px 14px;cursor:pointer}\n.nickname-report-cancel{border:1px solid #58768a;background:#16334b;color:#eaf7ff}\n.nickname-report-submit{border:1px solid #ff5757;background:#d83544;color:#fff}\nbutton.rank-report{appearance:none;background:rgba(255,87,87,.12);color:#ff6565;border:1px solid #ff5757;border-radius:6px;padding:5px 9px;font-size:12px;font-weight:700;cursor:pointer}\nbutton.rank-report:disabled{opacity:.6;cursor:default}\n";document.head.append(reportStyles);
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
const successDialog=document.createElement("dialog");
successDialog.className="nickname-report-dialog";
successDialog.setAttribute("aria-labelledby","nickname-report-success-title");
successDialog.innerHTML=`
 <form method="dialog" class="nickname-report-panel">
  <h2 id="nickname-report-success-title">Successfully reported</h2>
  <p>Your report has been received. Thank you.</p>
  <div class="nickname-report-actions">
   <button type="submit" class="nickname-report-submit">OK</button>
  </div>
 </form>`;
document.body.append(successDialog);
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
  successDialog.showModal();
 }catch(error){
  button.textContent="Report";button.disabled=false;
  alert(error.message||"Could not send report.");
 }
});
document.addEventListener("click",event=>{
 const button=event.target.closest("button.rank-report");
 if(!button||button.disabled||reportDialog.open)return;
 const nickname=button.dataset.nickname,mode=button.dataset.mode,score=Number(button.dataset.score);
 if(!nickname||!["sprint","survival","knight-maze","endgame-survivor","guess-the-elo","chess-memory","missing-piece","safe-square-rush","falling-board","queen-chase","chess-block-party","pawn-dash"].includes(mode)||!Number.isInteger(score))return;
 pendingReport={button,nickname,mode,score};
 reportDialog.querySelector(".nickname-report-question").textContent='Are you sure you want to report "'+nickname+'"?';
 reportDialog.returnValue="cancel";
 reportDialog.showModal();
});
