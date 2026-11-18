// Music, sound effects and voice lines. Nothing plays until the first tap or key press unlocks audio.
//
// Everything goes through the Web Audio API:
//  - sound effects are decoded once into buffers and played instantly (no media-player restarts, which
//    made iPhones stutter on every shot)
//  - music and voices are streamed <audio> elements routed through gain nodes, because iOS ignores the
//    .volume property of <audio> elements (which used to leave old music tracks playing forever)
// If Web Audio is not available the old <audio>-only path is used.
const BASE = "../assets/audio/";
const SFX = ["wing_flap", "fire_shot", "ice_shot", "lightning_shot", "leaf_shot", "impact", "ultimate_charge", "ultimate_blast",
  "dragon_roar", "enemy_death", "coin_pickup", "gem_pickup", "level_up", "ui_tap", "boost", "hit_taken", "village_fire", "village_morning"];
const VOL = { music: 0.32, sfx: 0.6, voice: 1.0 };       // loudest each channel can go
const MAX_SFX = 14;                                       // at most this many effects at once (protects slow phones)

export class AudioMgr {
  constructor() {
    this.unlocked = false;
    this.muted = false;
    this.level = { music: 0.4, sfx: 1, voice: 1 };           // player settings, 0..1 per channel
    this.music = null;        // current music <audio> element
    this.musicName = "";
    this.voice = null;        // currently playing voice line
    this.voiceWho = "";       // "announcer" or a dragon id
    this.lastVoice = {};
    this.buffers = {};        // decoded sound effects
    this.live = [];           // effect sources still playing
    this.pools = null;        // <audio> fallback for effects
    this.ctx = null;
    const AC = window.AudioContext || window.webkitAudioContext;
    try { if (AC) this.ctx = new AC({ latencyHint: "interactive" }); } catch { this.ctx = null; }
    if (this.ctx) {
      // iOS: play like a game (ignores the silent switch the same way music apps do)
      try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch { /* older iOS */ }
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.gain = {};
      for (const ch of ["music", "sfx", "voice"]) { this.gain[ch] = this.ctx.createGain(); this.gain[ch].connect(this.master); }
      this._applyGains(true);
      this._loadEffects();
      // phones suspend audio when the app is switched or an ad plays; wake it on the next touch
      const wake = () => { if (this.unlocked && this.ctx.state !== "running") this.ctx.resume().catch(() => {}); };
      for (const ev of ["pointerdown", "touchend", "keydown"]) window.addEventListener(ev, wake, { capture: true, passive: true });
      document.addEventListener("visibilitychange", () => { if (!document.hidden) wake(); });
    } else {
      this.pools = {};
      for (const n of SFX) this.pools[n] = this._pool(`${BASE}sfx/${n}.mp3`, n.endsWith("_shot") || n === "impact" ? 5 : 2);
    }
  }

  async _loadEffects() {
    await Promise.all(SFX.map(async (n) => {
      try {
        const res = await fetch(`${BASE}sfx/${n}.mp3`);
        const data = await res.arrayBuffer();
        this.buffers[n] = await new Promise((ok, bad) => this.ctx.decodeAudioData(data, ok, bad));
      } catch { /* this one effect stays silent */ }
    }));
  }

  _pool(src, n) {
    const list = [];
    for (let i = 0; i < n; i++) { const a = new Audio(src); a.preload = "auto"; list.push(a); }
    return { list, i: 0 };
  }

  _applyGains(instant) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (g, v) => { g.gain.cancelScheduledValues(t); if (instant) g.gain.value = v; else g.gain.setTargetAtTime(v, t, 0.03); };
    set(this.master, this.muted ? 0 : 1);
    set(this.gain.music, this._musicVol());
    set(this.gain.sfx, VOL.sfx * this.level.sfx);
    set(this.gain.voice, VOL.voice * this.level.voice);
  }

  // connect a streamed <audio> element to a channel; returns its own fade gain (or null without Web Audio)
  _route(el, channel) {
    if (!this.ctx) return null;
    try {
      const src = this.ctx.createMediaElementSource(el);
      const g = this.ctx.createGain();
      src.connect(g); g.connect(this.gain[channel]);
      el._src = src; el._gain = g;
      return g;
    } catch { return null; }
  }

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.ctx) {
      this.ctx.resume().catch(() => {});
      // iOS needs a sound started inside the tap itself
      try { const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0); } catch { /* ignore */ }
    }
    if (this.musicName) { const n = this.musicName; this.musicName = ""; this.playMusic(n); }
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) { this._applyGains(false); return; }
    if (this.music) this.music.muted = m;
    if (this.voice) this.voice.muted = m;
  }

  // channel: "music" | "sfx" | "voice", v: 0..1. Each channel is independent.
  setLevel(channel, v) {
    this.level[channel] = Math.max(0, Math.min(1, v));
    if (this.ctx) this._applyGains(false);
    else {
      if (channel === "music" && this.music) this.music.volume = this._musicVol();
      if (channel === "voice" && this.voice) this.voice.volume = VOL.voice * this.level.voice;
    }
    if (channel === "music" && this.music && this.level.music > 0 && this.music.paused && this.unlocked) this.music.play().catch(() => {});
  }
  _musicVol() { return VOL.music * this.level.music; }

  playMusic(name) {
    if (name === this.musicName) return;
    this.musicName = name;
    if (!this.unlocked) return;
    const old = this.music;
    this.music = null;
    if (old) this._stopMusic(old);
    const a = new Audio(`${BASE}music/${name}.mp3`);
    a.loop = true; a.preload = "auto";
    const g = this._route(a, "music");
    if (g) {
      const t = this.ctx.currentTime;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 1.2);   // fade in
    } else { a.volume = this._musicVol(); a.muted = this.muted; }
    a.play().catch(() => {});
    this.music = a;
  }

  // fade out and always stop an old music track (never leave two tracks playing)
  _stopMusic(el) {
    const kill = () => { try { el.pause(); el.removeAttribute("src"); el.load(); } catch { /* ignore */ } if (el._src) { try { el._src.disconnect(); } catch { /* ignore */ } } };
    if (el._gain) {
      const t = this.ctx.currentTime;
      el._gain.gain.cancelScheduledValues(t); el._gain.gain.setValueAtTime(el._gain.gain.value, t); el._gain.gain.linearRampToValueAtTime(0, t + 0.6);
      setTimeout(kill, 700);
    } else kill();
  }

  play(name, vol = 1, rate = 1) {
    if (!this.unlocked || this.muted || this.level.sfx <= 0) return;
    if (this.ctx) {
      const buf = this.buffers[name];
      if (!buf || this.ctx.state !== "running") return;
      // drop finished sources; if too many are still playing, skip this one rather than overload the phone
      const now = this.ctx.currentTime;
      this.live = this.live.filter((x) => x.end > now);
      if (this.live.length >= MAX_SFX) return;
      const s = this.ctx.createBufferSource();
      s.buffer = buf; s.playbackRate.value = rate;
      let out = this.gain.sfx;
      if (vol !== 1) { const g = this.ctx.createGain(); g.gain.value = Math.min(1 / VOL.sfx, vol); g.connect(this.gain.sfx); out = g; }
      s.connect(out); s.start();
      this.live.push({ end: now + buf.duration / rate });
      return;
    }
    const p = this.pools[name];
    if (!p) return;
    const a = p.list[p.i = (p.i + 1) % p.list.length];
    try { a.currentTime = 0; a.volume = Math.min(1, VOL.sfx * vol * this.level.sfx); a.playbackRate = rate; a.play().catch(() => {}); } catch { /* not loaded yet */ }
  }

  // who: "announcer" or dragon id; line: file suffix. gap = minimum seconds before the same speaker talks again.
  say(who, line, gap = 0, force = false) {
    if (!this.unlocked) return false;
    const now = performance.now() / 1000;
    if (!force) {
      if (this.voice && !this.voice.ended && !this.voice.paused) return false;
      if (now - (this.lastVoice[who] || -99) < gap) return false;
    } else if (this.voice) { this.voice.pause(); }
    const prev = this.voice;
    if (prev && prev._src) { try { prev._src.disconnect(); } catch { /* ignore */ } }
    const a = new Audio(`${BASE}voice/${who}_${line}.mp3`);
    if (!this._route(a, "voice")) { a.volume = VOL.voice * this.level.voice; a.muted = this.muted; }
    a.play().catch(() => {});
    this.voice = a; this.voiceWho = who; this.lastVoice[who] = now;
    return true;
  }

  speaking(who) {
    return this.voice && this.voiceWho === who && !this.voice.paused && !this.voice.ended && this.voice.currentTime > 0;
  }
}
