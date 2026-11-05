/* Stockfish 19 Lite worker. Both paths use bundled same-origin assets. */
// Stockfish also derives its WASM path from this worker's URL; _redirects
// maps /stockfish-worker.wasm to the same bundled binary for legacy callers.
self.Module={locateFile:(path)=>path.endsWith('.wasm')?'/engine/stockfish-19-lite-single.wasm':path};
try{
 importScripts('/engine/stockfish-19-lite-single.js');
}catch(primaryError){
 try{
  self.Module={locateFile:(path)=>path.endsWith('.wasm')?'/vendor/stockfish/stockfish-19-lite-single.wasm':path};
  importScripts('/vendor/stockfish/stockfish-19-lite-single.js');
 }catch(fallbackError){
  throw Error('Stockfish worker could not load: '+primaryError.message+' / '+fallbackError.message);
 }
}
