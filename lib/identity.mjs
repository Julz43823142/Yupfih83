// Shared identity policy for staff-like names, applied to accounts, guests
// and anonymous leaderboards. Do not let a nickname imply an official role.
const RESERVED=/^(?:eloscanner(?:support|staff|admin|mod|team)?|admin(?:istrator)?|moderator|mod|staff|support(?:team|desk)?|system)$/i;
export function isReservedIdentity(value){
 return typeof value==='string'&&RESERVED.test(value.trim().replace(/[ _-]+/g,''));
}
