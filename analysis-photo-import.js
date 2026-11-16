/* EloScanner image-to-position import. Recognition runs in the user's browser.
   fenshot MIT: https://github.com/scoriiu/fenshot
   ONNX Runtime Web MIT: https://github.com/microsoft/onnxruntime */
const fileInput=document.getElementById("position-photo");
const scanButton=document.getElementById("position-scan");
const scanStatus=document.getElementById("position-scan-status");
const preview=document.getElementById("position-photo-preview");
const side=document.getElementById("position-side");
const photoPanel=document.getElementById("position-photo-panel");
let imageFile=null;
const report=(message)=>{scanStatus.textContent=message};
fileInput.addEventListener("change",()=>{
  imageFile=fileInput.files?.[0]||null;
  scanButton.disabled=!imageFile;
  preview.hidden=!imageFile;
  if(imageFile){preview.src=URL.createObjectURL(imageFile);preview.onload=()=>URL.revokeObjectURL(preview.src)}
  report(imageFile?"Ready to scan. Clear, straight-on screenshots work best.":"Choose a screenshot or board image.");
});
scanButton.addEventListener("click",async()=>{
  if(!imageFile)return;
  scanButton.disabled=true;
  report("Trying experimental image recognition…");
  try{
    // Version-pinned package, model and runtime. Images are processed locally.
    const {createRecognizer,resolveOrientation,placementToFen}=await import("https://esm.sh/@scoriiu/fenshot@0.1.5?bundle");
    const recognizer=createRecognizer({
      modelUrl:"https://cdn.jsdelivr.net/npm/@scoriiu/fenshot@0.1.5/model/chess-tiles-v2.onnx",
      wasmPaths:"https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/"
    });
    const result=await recognizer.recognize(imageFile);
    if(!result){report("No chessboard found. Try a sharper, straight-on image.");return}
    const {placement}=resolveOrientation(result.placement);
    window.dispatchEvent(new CustomEvent("elo-scanner-placement",{detail:{placement}}));
    if(!result.reliable){
      report("Recognition is uncertain. A draft position is open in the editor below. Check every piece before analyzing; nothing was imported automatically.");
      return;
    }
    const fen=placementToFen(placement,side.value);
    const fenTab=document.querySelector('[data-mode="fen"]');
    const value=document.getElementById("import-value");
    if(!fenTab||!value)throw Error("Position import controls unavailable.");
    fenTab.click();
    value.value=fen;
    value.dispatchEvent(new Event("input",{bubbles:true}));
    report("Position recognized and opened in analysis. The editable board below also contains the result for corrections. Verify pieces, side to move and castling rights.");
    document.getElementById("load")?.click();
  }catch(error){
    console.error("Photo recognition failed",error);
    report("Automatic image recognition could not run. Your selected photo remains visible above; enter the pieces in the editable board below.");
    document.getElementById("physical-board-editor").open=true;
  }finally{scanButton.disabled=!imageFile}
});
