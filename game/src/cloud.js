// Cloud save through Google Play Games, in the Android app only (window.SkyrathAndroid is added by the app).
// Every save carries an ID (save.sid, made once per save "line") and a revision number (save.rev, +1 per save).
// When the game starts and the player is signed in, the copy in their Google account is compared with this phone's:
//   - no cloud copy yet                    -> upload this phone's progress
//   - same save line                       -> the newer revision wins (normal case: same player, same or new phone)
//   - different lines, one has no progress -> keep the one with progress (reinstall / new phone restores the cloud)
//   - different lines, both have progress  -> the player chooses which one to keep
// Saves go to the cloud at most every 20 seconds, and right away when the app goes to the background.
let bridge = null;                    // window.SkyrathAndroid, looked up in initCloud
const PUSH_DELAY = 20000;

export const cloud = { supported: false, available: false, signedIn: false, name: "", status: "" };

let hooks = null, loaded = false, timer = null, dirty = false, pending = null, loadTries = 0;

const summary = (s) => `Best stage ${s.best || 0}  ·  ${s.coins || 0} coins  ·  ${s.gems || 0} gems`;
// "no real progress": a brand-new save, or one from a quick try before signing in
const fresh = (s) => (s.best || 0) <= 2 && !(s.upg && Object.values(s.upg).some((v) => v > 0)) && ((s.stats && s.stats.kill) || 0) < 15;

function push() {
  clearTimeout(timer); timer = null;
  if (!cloud.signedIn || !loaded) return;
  dirty = false;
  cloud.status = "saving";
  try { bridge.save(hooks.text()); } catch { cloud.status = "error"; }
  hooks.changed();
}

function decide(text) {
  let remote = null;
  try { remote = text ? JSON.parse(text) : null; } catch { remote = null; }
  const local = hooks.current();
  if (!remote || typeof remote !== "object") { push(); return; }
  const lr = local.rev || 0, rr = remote.rev || 0;
  if (remote.sid && remote.sid === local.sid) {
    if (rr > lr) hooks.restore(remote);
    else if (rr < lr) push();
    else { cloud.status = "saved"; hooks.changed(); }
    return;
  }
  const lf = fresh(local), rf = fresh(remote);
  if (lf && !rf) { hooks.restore(remote); return; }
  if (rf || (lf && rf)) { push(); return; }
  pending = remote;
  hooks.ask(summary(remote), summary(local));
}

export function initCloud(h) {
  hooks = h;
  bridge = window.SkyrathAndroid || null;
  if (!bridge) return;
  loaded = false; loadTries = 0; pending = null;
  cloud.supported = true;
  try { cloud.available = !!bridge.available(); } catch { cloud.available = false; }
  window.skyrathCloud = {
    onState(enabled, signedIn, name) {
      cloud.available = !!enabled; cloud.signedIn = !!signedIn; cloud.name = name || "";
      hooks.changed();
      if (cloud.signedIn && !loaded) { cloud.status = "loading"; bridge.load(); }
    },
    onLoad(text, error) {
      if (error) {
        cloud.status = "error"; hooks.changed();
        if (++loadTries <= 3) setTimeout(() => { if (!loaded && cloud.signedIn) bridge.load(); }, 20000 * loadTries);
        return;
      }
      loaded = true;
      decide(text);
    },
    onSaved(ok) { cloud.status = ok ? "saved" : "error"; if (!ok) dirty = true; hooks.changed(); },
    flush() { if (dirty) push(); },
  };
  try { bridge.requestState(); } catch { /* the app answers when it starts */ }
}

// called after every local save
export function cloudDirty() {
  if (!cloud.signedIn || !loaded) return;
  dirty = true;
  if (!timer) timer = setTimeout(push, PUSH_DELAY);
}

export function cloudSignIn() { if (bridge && cloud.available) { cloud.status = "signing in"; hooks.changed(); bridge.signIn(); } }

// the player's answer when both copies have progress
export function cloudChoose(keepCloud) {
  const remote = pending; pending = null;
  if (keepCloud && remote) hooks.restore(remote); else push();
}

export function cloudStatusText() {
  if (!cloud.available) return "Not available in this version";
  if (!cloud.signedIn) return cloud.status === "signing in" ? "Signing in..." : "Not signed in";
  const who = cloud.name ? `${cloud.name}: ` : "";
  const st = { loading: "checking...", saving: "saving...", saved: "saved to your Google account", error: "couldn't reach Google, will retry" }[cloud.status] || "on";
  return who + st;
}
