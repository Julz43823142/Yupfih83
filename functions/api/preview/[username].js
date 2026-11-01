import { json, github, parseStoredZip } from "../../../lib/v87-github.js";

const ALLOWED = {magnuscarlsen:"MagnusCarlsen",hikaru:"Hikaru"};
export async function onRequestGet({params,env}) {
  if(!env.GITHUB_TOKEN)return json({error:"Example reports are not configured."},503);
  const key=String(params.username||"").toLowerCase();
  const username=ALLOWED[key];
  if(!username)return json({error:"Unknown example account."},404);
  try {
    const response=await github(env.GITHUB_TOKEN,
      "/actions/workflows/preview-samples.yml/runs?per_page=15&status=completed");
    if(!response.ok)return json({state:"unavailable",message:"Example reports are temporarily unavailable."},503);
    const runs=(await response.json()).workflow_runs||[];
    for(const run of runs) {
      if(run.conclusion!=="success")continue;
      const res=await github(env.GITHUB_TOKEN,"/actions/runs/"+run.id+"/artifacts?per_page=30");
      if(!res.ok)continue;
      const artifacts=(await res.json()).artifacts||[];
      const artifact=artifacts.find(item=>item.name==="preview-"+username&&!item.expired);
      if(!artifact)continue;
      const zip=await github(env.GITHUB_TOKEN,"/actions/artifacts/"+artifact.id+"/zip");
      if(!zip.ok)continue;
      try {
        const result=parseStoredZip(await zip.arrayBuffer());
        if(String(result.username||"").toLowerCase()!==key)continue;
        return new Response(JSON.stringify({state:"ready",username,result,generated_at:run.updated_at}),{headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"public, max-age=300, s-maxage=3600"}});
      }catch {}
    }
    const active=await github(env.GITHUB_TOKEN,
      "/actions/workflows/preview-samples.yml/runs?per_page=5");
    const pending=active.ok?
      ((await active.json()).workflow_runs||[]).some(run=>run.status!=="completed"):false;
    return json({state:pending?"preparing":"unavailable",
      message:pending?"The example is still being prepared. You can start a live analysis now.":
        "No verified saved report is available yet. You can run a fresh public analysis instead."});
  }catch {
    return json({state:"unavailable",message:"Could not load the saved example report."},503);
  }
}
