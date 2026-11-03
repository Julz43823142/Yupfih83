import {json} from "../../../lib/v87-github.js";

// Legacy GitHub Actions polling was retired when v87 moved to the visitor's
// browser. This endpoint performs no GitHub API requests or D1 writes.
export async function onRequestGet(){
  return json({
    state:"failed",
    error:"Legacy runner polling is no longer available. Reload EloScanner to analyze locally."
  },410);
}
