export interface EmsspressobotController {
  remove: () => void;
  say: (message: string) => void;
  dodge: (seconds?: number) => void;
  home: () => void;
}

interface WindowWithBot extends Window {
  emsspressobot?: EmsspressobotController;
}

interface AudioContextWindow extends WindowWithBot {
  webkitAudioContext?: typeof AudioContext;
}

const OVERLAY_ID = "emsspressobot-overlay";
const BOT_SIZE = 148;
const BOT_LINES = [
  "EMSSpressoBot online. More caffeine = more productivity.",
  "Mission clock synced. Espresso trajectory nominal.",
  'Talky-Bot detected: "need coffee." Dispatching support.',
  "Severity router: INFO decaf, WARN half-caf, ERROR double shot.",
  "CRITICAL event. Requesting triple-shot stabilization protocol.",
  "Predictive brewing enabled for upcoming logstorm windows.",
  "CODA alignment complete: break scheduled in T-minus 90 seconds.",
  "Maestro export succeeded after ceremonial latte offering.",
  "AEGIS route avoids craters and empty coffee pots.",
  "EMSS Logs alert: breakroom pot below minimum threshold.",
  "Hydration reminder: water first, espresso second, heroics third.",
  "If latency rises, increase snacks by 12 percent.",
  "Operator focus boosted. Queue anxiety reduced.",
  "Coffee diplomacy initiated between day and night shift.",
  "Telemetry says morale improves with one warm mug nearby.",
  "Reminder: caffeine is a feature, not a bug.",
  "EspressoBot standing by with mission-safe encouragement.",
  "I run on optimism, tiny beeps, and dark roast.",
  "No flip mode active. Forward-facing confidence restored.",
  'Use window.emsspressobot.say("your line") for custom dialog.',
];

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const removeExistingOverlay = (): void => {
  const prior = document.getElementById(OVERLAY_ID);
  prior?.remove();
};

export const installEmsspressobot = (): EmsspressobotController => {
  removeExistingOverlay();

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.cssText =
    "position:fixed;left:24px;top:24px;width:148px;z-index:2147483647;pointer-events:none;user-select:none;filter:drop-shadow(0 10px 12px rgba(0,0,0,.35));";

  const speechBubble = document.createElement("div");
  speechBubble.style.cssText =
    "position:absolute;bottom:134px;left:-8px;max-width:290px;background:rgba(9,10,26,.93);color:#fff;padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.22);font:600 12px/1.35 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.2px;opacity:0;transform:translateY(6px);transition:opacity .22s,transform .22s";

  const speechTail = document.createElement("div");
  speechTail.style.cssText =
    "position:absolute;left:18px;bottom:-8px;width:14px;height:14px;background:rgba(9,10,26,.93);transform:rotate(45deg);border-right:1px solid rgba(255,255,255,.22);border-bottom:1px solid rgba(255,255,255,.22)";
  speechBubble.appendChild(speechTail);

  overlay.innerHTML =
    '<svg viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg" aria-label="EMSSpressoBot"><defs><linearGradient id="c" x1="70" y1="80" x2="208" y2="225" gradientUnits="userSpaceOnUse"><stop stop-color="#FFF8EC"/><stop offset="1" stop-color="#E8DCC8"/></linearGradient><linearGradient id="m" x1="40" y1="245" x2="280" y2="245" gradientUnits="userSpaceOnUse"><stop stop-color="#AAB3C3"/><stop offset=".5" stop-color="#E6EBF5"/><stop offset="1" stop-color="#95A0B3"/></linearGradient><radialGradient id="k" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(148 105) rotate(90) scale(30 90)"><stop stop-color="#6A3D2B"/><stop offset="1" stop-color="#3D2118"/></radialGradient></defs><ellipse cx="160" cy="242" rx="108" ry="34" fill="#0E0D1C" opacity=".55"/><ellipse cx="160" cy="232" rx="118" ry="28" fill="url(#m)"/><ellipse cx="160" cy="229" rx="86" ry="18" fill="#BDC7D8" opacity=".8"/><g transform="translate(0 8)"><rect x="52" y="106" width="22" height="52" rx="10" fill="#CBD3E2"/><rect x="246" y="106" width="22" height="52" rx="10" fill="#CBD3E2"/><path d="M74 84C74 73 82 64 93 64H203C214 64 222 73 222 84V177C222 192 209 204 194 204H102C87 204 74 192 74 177V84Z" fill="url(#c)"/><path d="M222 103H241C254 103 265 114 265 127C265 140 254 151 241 151H222" stroke="#ECE7DE" stroke-width="14" stroke-linecap="round"/><path d="M222 112H239C247 112 253 118 253 126C253 134 247 140 239 140H222" stroke="#CFC8BB" stroke-width="4" stroke-linecap="round"/><ellipse cx="148" cy="85" rx="70" ry="21" fill="url(#k)"/><ellipse cx="148" cy="81" rx="69" ry="17" fill="#3D1F16" opacity=".75"/><ellipse cx="122" cy="136" rx="10" ry="12" fill="#151729"/><ellipse cx="170" cy="136" rx="10" ry="12" fill="#151729"/><ellipse cx="118" cy="131" rx="2.5" ry="3" fill="#F8F8FF"/><ellipse cx="166" cy="131" rx="2.5" ry="3" fill="#F8F8FF"/><path d="M116 166C124 177 137 182 146 182C156 182 169 177 177 166" fill="#F3655A"/><path d="M116 166C124 177 137 182 146 182C156 182 169 177 177 166" stroke="#181A2F" stroke-width="4" stroke-linecap="round"/><ellipse cx="96" cy="155" rx="11" ry="7" fill="#F3A7A2" opacity=".9"/><ellipse cx="196" cy="155" rx="11" ry="7" fill="#F3A7A2" opacity=".9"/></g></svg>';

  overlay.appendChild(speechBubble);
  document.body.appendChild(overlay);

  const botWindow = window as AudioContextWindow;
  const AudioContextCtor = globalThis.AudioContext || botWindow.webkitAudioContext;
  let audioContext: AudioContext | null = null;

  const beep = (frequency = 720, duration = 0.12): void => {
    try {
      audioContext = audioContext || (AudioContextCtor ? new AudioContextCtor() : null);
      if (!audioContext) {
        return;
      }

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const now = audioContext.currentTime;
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.035, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    } catch {
      // best effort only
    }
  };

  let speechTimeout: number | undefined;
  const say = (message: string): void => {
    if (speechBubble.firstChild && speechBubble.firstChild.nodeType === Node.TEXT_NODE) {
      speechBubble.firstChild.textContent = message;
    } else {
      speechBubble.prepend(document.createTextNode(message));
    }

    speechBubble.style.opacity = "1";
    speechBubble.style.transform = "translateY(0)";
    window.clearTimeout(speechTimeout);
    speechTimeout = window.setTimeout(() => {
      speechBubble.style.opacity = "0";
      speechBubble.style.transform = "translateY(6px)";
    }, 3200);

    beep(620 + Math.random() * 220, 0.11);
  };

  let homeX = 24;
  let homeY = Math.max(12, window.innerHeight - BOT_SIZE - 26);
  let x = homeX;
  let y = homeY;
  let targetX = x;
  let targetY = y;
  let dodgeUntil = 0;
  let animationFrame = 0;
  let lastSpeechAt = 0;

  const clampToViewport = (): void => {
    homeY = Math.max(12, window.innerHeight - BOT_SIZE - 26);
    x = clamp(x, 8, window.innerWidth - BOT_SIZE - 8);
    y = clamp(y, 8, window.innerHeight - BOT_SIZE - 8);
    targetX = clamp(targetX, 8, window.innerWidth - BOT_SIZE - 8);
    targetY = clamp(targetY, 8, window.innerHeight - BOT_SIZE - 8);
  };

  const pickDodgePoint = (): void => {
    targetX = 20 + Math.random() * Math.max(40, window.innerWidth - BOT_SIZE - 40);
    targetY = 12 + Math.random() * Math.max(40, window.innerHeight - BOT_SIZE - 60);
  };

  const onPointerMove = (event: MouseEvent): void => {
    const centerX = x + BOT_SIZE * 0.5;
    const centerY = y + BOT_SIZE * 0.5;
    const deltaX = event.clientX - centerX;
    const deltaY = event.clientY - centerY;
    if (Math.hypot(deltaX, deltaY) < 170) {
      dodgeUntil = performance.now() + 8000;
      pickDodgePoint();
      beep(840, 0.08);
    }
  };

  const onResize = (): void => {
    clampToViewport();
  };

  const step = (timestamp: number): void => {
    if (timestamp > dodgeUntil) {
      targetX = homeX;
      targetY = homeY;
    } else if (Math.hypot(targetX - x, targetY - y) < 22) {
      pickDodgePoint();
    }

    x += (targetX - x) * 0.08;
    y += (targetY - y) * 0.08;
    overlay.style.left = `${x}px`;
    overlay.style.top = `${y}px`;

    if (timestamp - lastSpeechAt > 6000) {
      say(BOT_LINES[Math.floor(Math.random() * BOT_LINES.length)]);
      lastSpeechAt = timestamp;
    }

    animationFrame = window.requestAnimationFrame(step);
  };

  window.addEventListener("mousemove", onPointerMove, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });

  say(BOT_LINES[0]);
  animationFrame = window.requestAnimationFrame(step);

  const remove = (): void => {
    window.cancelAnimationFrame(animationFrame);
    window.removeEventListener("mousemove", onPointerMove);
    window.removeEventListener("resize", onResize);
    window.clearTimeout(speechTimeout);
    overlay.remove();
    delete botWindow.emsspressobot;
  };

  const controller: EmsspressobotController = {
    remove,
    say,
    dodge: (seconds = 8) => {
      dodgeUntil = performance.now() + Math.max(1, Number(seconds) || 8) * 1000;
      pickDodgePoint();
    },
    home: () => {
      dodgeUntil = 0;
      targetX = homeX;
      targetY = homeY;
    },
  };

  botWindow.emsspressobot = controller;
  return controller;
};
