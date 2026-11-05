// Unused legacy CDN proxy. Active engines are bundled in vendor/stockfish.
export const onRequestGet=()=>new Response('Retired',{status:410,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
