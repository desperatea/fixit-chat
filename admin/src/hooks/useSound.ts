let audioCtx: AudioContext | null = null;
// AudioContext unlocked state tracked implicitly via ctx.state

function ensureContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

// Unlock audio on ANY user interaction (click, keydown)
function unlock() {
  const ctx = ensureContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume();
  } else {
    // already running
  }
}

document.addEventListener('click', unlock, { capture: true });
document.addEventListener('keydown', unlock, { once: true });

function play(frequencies: [number, number][], duration: number): void {
  const ctx = ensureContext();
  if (!ctx) return;

  // If still suspended, try resume and play after
  if (ctx.state === 'suspended') {
    ctx.resume().then(() => playTones(ctx, frequencies, duration));
    return;
  }
  playTones(ctx, frequencies, duration);
}

function playTones(ctx: AudioContext, frequencies: [number, number][], duration: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  frequencies.forEach(([freq, time]) => {
    osc.frequency.setValueAtTime(freq, ctx.currentTime + time);
  });

  gain.gain.setValueAtTime(0.4, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

export function playMessageSound(): void {
  play([[880, 0], [660, 0.12]], 0.35);
}

export function playSessionSound(): void {
  play([[523, 0], [659, 0.15], [784, 0.3]], 0.5);
}
