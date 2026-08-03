/**
 * soundManager.js
 * -----------------------------------------------------------------------
 * Short, synthesized feedback tones via the Web Audio API — no audio
 * files to bundle or fetch, works fully offline. Mute preference is a
 * durable player preference (localStorage), unlike gameplay progress
 * which is session-scoped (see sessionPersistence.js).
 *
 * The AudioContext is created lazily on first use, since browsers block
 * audio until a user gesture has occurred (the landing modal's "Begin
 * Investigation" click satisfies this naturally).
 * -----------------------------------------------------------------------
 */

const MUTE_STORAGE_KEY = "guessThePerson:soundMuted";

export class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = this._loadMutePref();
  }

  _loadMutePref() {
    try {
      return localStorage.getItem(MUTE_STORAGE_KEY) === "true";
    } catch (err) {
      return false;
    }
  }

  _ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  _tone({ freq, duration, type = "sine", volume = 0.12, glideTo = null }) {
    if (this.muted) return;
    const ctx = this._ensureContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (glideTo) {
      osc.frequency.linearRampToValueAtTime(glideTo, ctx.currentTime + duration);
    }
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  playHintAppear() {
    this._tone({ freq: 480, duration: 0.07, type: "square", volume: 0.04 });
  }

  playWrong() {
    this._tone({ freq: 190, duration: 0.18, type: "sawtooth", volume: 0.08 });
  }

  playSolved() {
    this._tone({ freq: 520, duration: 0.35, type: "sine", volume: 0.12, glideTo: 900 });
  }

  playFailed() {
    this._tone({ freq: 300, duration: 0.4, type: "sine", volume: 0.12, glideTo: 110 });
  }

  isMuted() {
    return this.muted;
  }

  setMuted(value) {
    this.muted = value;
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, String(value));
    } catch (err) {
      // no-op — losing the persisted preference isn't fatal
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }
}
