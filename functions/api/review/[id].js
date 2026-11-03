import {json} from "../../../lib/v87-github.js";

// Retired: homepage reviews now execute in each visitor's own Web Worker.
// Do not query GitHub Actions from a publicly accessible legacy polling URL.
export async function onRequestGet(){
  return json({error:"GitHub runner polling is retired. Start a new on-device review on EloScanner."},410);
}
