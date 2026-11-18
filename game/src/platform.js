// Platform layer: everything that differs between where the game runs lives here.
// The build sets window.SKYRATH_PLATFORM: "web" (itch.io / PC), "android" (APK) or "crazygames".
// On CrazyGames this talks to the CrazyGames HTML5 SDK v3; everywhere else every call is a safe no-op.
export const PLATFORM = window.SKYRATH_PLATFORM || "web";
export const IS_CRAZY = PLATFORM === "crazygames";

let sdk = null;                 // the CrazyGames SDK once initialised (local or crazygames environment only)
let playing = false;            // last gameplay state we reported
const hooks = { mute: () => {}, pause: () => {} };

export async function initPlatform() {
  if (!IS_CRAZY) return;
  try {
    const S = window.CrazyGames && window.CrazyGames.SDK;
    if (!S) return;
    await S.init();
    if (S.environment === "crazygames" || S.environment === "local") sdk = S;
  } catch (err) { console.warn("CrazyGames SDK unavailable", err); }
}
export const hasSdk = () => !!sdk;

// phone or tablet? CrazyGames asks games to use their system info rather than touch detection
export function isMobile() {
  try {
    const t = sdk && sdk.user && sdk.user.systemInfo && sdk.user.systemInfo.device && sdk.user.systemInfo.device.type;
    if (t) return t === "mobile" || t === "tablet";
  } catch { /* fall through */ }
  return window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
}

// hooks from the game: mute(reason, on) and pause(on), so ads can silence and freeze the game
export function setHooks(h) { Object.assign(hooks, h); }

// --- saving: CrazyGames Data module (linked to the player's CrazyGames account), else localStorage
export function loadSave(key) {
  try { return sdk ? sdk.data.getItem(key) : localStorage.getItem(key); } catch { return null; }
}
export function writeSave(key, value) {
  try { if (sdk) sdk.data.setItem(key, value); else localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

// --- loading and gameplay events
export function loadingStart() { try { sdk && sdk.game.loadingStart(); } catch { /* ignore */ } }
export function loadingStop() { try { sdk && sdk.game.loadingStop(); } catch { /* ignore */ } }
export function gameplayStart() { if (playing) return; playing = true; try { sdk && sdk.game.gameplayStart(); } catch { /* ignore */ } }
export function gameplayStop() { if (!playing) return; playing = false; try { sdk && sdk.game.gameplayStop(); } catch { /* ignore */ } }
export function happytime() { try { sdk && sdk.game.happytime(); } catch { /* ignore */ } }

// --- the portal's own "mute audio" setting always wins over in-game volume
export function watchMuteSetting() {
  if (!sdk) return;
  const apply = () => { try { hooks.mute("platform", !!sdk.game.settings.muteAudio); } catch { /* ignore */ } };
  apply();
  try { sdk.game.addSettingsChangeListener(apply); } catch { /* ignore */ }
}

// --- ads (CrazyGames only). Rewarded ads are always optional; the reward is given only when the ad finishes.
export const rewardedAvailable = () => !!sdk;
let adRunning = false;
function requestAd(type) {
  return new Promise((resolve) => {
    if (!sdk || adRunning) { resolve(false); return; }
    adRunning = true;
    const end = (ok) => { adRunning = false; hooks.mute("ad", false); hooks.pause(false); resolve(ok); };
    try {
      sdk.ad.requestAd(type, {
        adStarted: () => { hooks.mute("ad", true); hooks.pause(true); },
        adFinished: () => end(true),
        adError: (err) => { console.info("ad not shown:", err && err.code); end(false); },
      });
    } catch (err) { end(false); }
  });
}
export const showRewarded = () => requestAd("rewarded");
export const showMidgame = () => requestAd("midgame");   // the SDK itself limits these to one every ~3 minutes
