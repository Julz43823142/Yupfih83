// Centralized requested bot ratings. They are strength targets, not verified
// ratings on a human online platform; true calibration needs rated match data.
export const BOT_RATINGS=Object.freeze({
 bot200:200,bot300:300,bot400:400,bot500:500,bot600:600,bot700:700,
 bot800:800,bot900:900,bot1000:1000,bot1100:1100,bot1200:1200,
 bot1300:1300,bot1400:1400,bot1550:1550,bot1600:1600,bot1650:1650,
 bot1700:1700,bot1800:1800,bot1900:1900,bot1950:1950,bot2000:2000,
 bot2100:2100,bot2200:2200,bot2250:2250,bot2300:2300,bot2400:2400,
 bot2450:2450,bot2500:2500,bot2600:2600,bot2700:2700,bot2800:2800,
 bot2850:2850,bot2900:2900,bot3000:3000,
 cashojf3r:800,rocket:1500,chessmass:1600,peanut:2200,
 ominous:2090,pls90a:2300,mikhail:2350,lars:3500
});
// Stockfish's UCI_LimitStrength UCI_Elo range starts at about 1320.
// Skill Level 0 is NOT a calibrated 200-1200 Elo setting. Keep those
// opponents on the intentionally fallible lightweight engine instead.
export function usesLocalBot(id){return id!=='lars'&&(BOT_RATINGS[id]??1000)<1320}
export function engineElo(id){return Math.min(3190,Math.max(1320,BOT_RATINGS[id]??1500))}
