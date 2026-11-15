// Tiny synthesized sound effects (no files). Every hit gets a sound; that's half the juice.
let ac = null, master = null, noiseBuf = null, sirenNode = null;
export let muted = false;

export function initAudio() {
  if (ac) { if (ac.state === "suspended") ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ac = null; }
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; }

function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function tone(type, f0, f1, dur, vol = 0.3, at = 0) {
  if (!ac) return; const t = ac.currentTime + at;
  const o = ac.createOscillator(), g = ac.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  env(g, t, 0.005, vol, dur); o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, type, f0, f1, q = 1, at = 0) {
  if (!ac) return; const t = ac.currentTime + at;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ac.createGain(); env(g, t, 0.003, vol, dur);
  s.connect(f).connect(g).connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

export const sfx = {
  stab() { noise(0.12, 0.5, "highpass", 6000, 2500, 0.7); tone("square", 1400, 300, 0.08, 0.12); tone("sine", 160, 50, 0.16, 0.5, 0.01); noise(0.08, 0.35, "bandpass", 1800, 600, 2, 0.01); },
  pop() { noise(0.45, 0.55, "lowpass", 2400, 120, 0.8); tone("sine", 120, 35, 0.35, 0.6); tone("square", 300, 60, 0.12, 0.08, 0.02); },
  sputter() { noise(0.05, 0.12, "bandpass", 3000 + Math.random() * 2000, 1500, 4); },
  tear() { noise(0.06, 0.08, "bandpass", 4000 + Math.random() * 1500, 3000, 6); },
  equip() { [0, 0.06, 0.12].forEach((t, i) => tone("square", [520, 780, 1040][i], [520, 780, 1040][i], 0.07, 0.08, t)); noise(0.08, 0.2, "highpass", 5000, 3000, 1); },
  rankUp() { [0, 0.08, 0.16, 0.24, 0.36].forEach((t, i) => tone("square", [392, 523, 659, 784, 1046][i], [392, 523, 659, 784, 1046][i], 0.12, 0.09, t)); tone("sine", 80, 160, 0.5, 0.3); },
  sus() { tone("triangle", 660, 880, 0.1, 0.12); },
  alert() { tone("square", 880, 880, 0.08, 0.15); tone("square", 1320, 1320, 0.14, 0.15, 0.08); },
  laser() { tone("sawtooth", 1600, 220, 0.14, 0.1); },
  hit() { noise(0.2, 0.5, "lowpass", 3000, 200, 1); tone("square", 200, 60, 0.18, 0.2); },
  dash() { noise(0.18, 0.25, "bandpass", 600, 3000, 1.5); },
  hide() { noise(0.12, 0.2, "lowpass", 1200, 300, 1); tone("square", 220, 180, 0.05, 0.08, 0.08); },
  click() { tone("square", 900, 900, 0.03, 0.06); },
  deny() { tone("square", 220, 160, 0.12, 0.1); },
  extract() { tone("sine", 200, 1200, 0.6, 0.25); noise(0.8, 0.3, "bandpass", 400, 4000, 1, 0.5); tone("square", 1046, 1046, 0.2, 0.08, 0.6); },
  hack() { [0, 0.05, 0.1, 0.15].forEach((t) => tone("square", 1200 + Math.random() * 800, 900, 0.04, 0.05, t)); },
  coin() { tone("square", 1200, 1200, 0.05, 0.06); tone("square", 1800, 1800, 0.08, 0.06, 0.05); },
};

export function siren(on) {
  if (!ac) return;
  if (on && !sirenNode) {
    const o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain();
    o.type = "square"; o.frequency.value = 620; lfo.frequency.value = 1.6; lg.gain.value = 180;
    lfo.connect(lg).connect(o.frequency); g.gain.value = 0.035;
    const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1800;
    o.connect(f).connect(g).connect(master); o.start(); lfo.start();
    sirenNode = { o, lfo, g };
  } else if (!on && sirenNode) {
    const s = sirenNode; sirenNode = null;
    s.g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.1);
    setTimeout(() => { try { s.o.stop(); s.lfo.stop(); } catch {} }, 400);
  }
}
