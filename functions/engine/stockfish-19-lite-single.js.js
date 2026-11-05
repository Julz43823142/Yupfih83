import {serveEngineAsset} from '../../lib/engine-assets.js';
export const onRequestGet=context=>serveEngineAsset(context,'stockfish-19-lite-single.js');
