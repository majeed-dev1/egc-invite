"use strict";

/* ============================================================
   تفاصيل الفعالية — عدّل هذه القيم فقط.
   day/date/time هي النصوص المعروضة، و start/end للتقويم:
   إذا غيّرت الموعد فغيّر الاثنين معاً.
   ============================================================ */
const EVENT = {
  title: "ورشة «من لاعب إلى صانع ألعاب»",
  host: "نادي الألعاب الإلكترونية",
  day: "الأحد",
  date: "٢٩ نوفمبر",
  time: "١١ ص – ٤ م",
  place: "مسرح وادي مكة",
  start: "2026-11-29T11:00:00+03:00",
  end: "2026-11-29T16:00:00+03:00",
  mapUrl: "",       // رابط الموقع على الخريطة (اختياري)، يُظهر رابط «الموقع على الخريطة»
  // رابط نموذج التسجيل: يظهر زر «سجّل في الورشة» في صفحة التأكيد. {name} إن وُجد يُستبدل باسم المدعو.
  registerUrl: "https://docs.google.com/forms/d/e/1FAIpQLSdyVBMw_6b5Y3sOmR5hqfQ-wY3HZMc89zcibjzOiZB4ygaNHw/viewform?usp=publish-editor",
};

const TEXT = {
  jump: "اقفز",
  mute: "كتم الصوت",
  unmute: "تشغيل الصوت",
  enterFullscreen: "ملء الشاشة",
  exitFullscreen: "الخروج من ملء الشاشة",
  confirmed: "تم تأكيد حضورك.",
};

/* ---------- عناصر الصفحة ---------- */
const el = id => document.getElementById(id);
const sky = el("sky"), canvas = el("space"), ctx = canvas.getContext("2d");
const header = el("header"), dock = el("dock");
const action = el("action"), actionLabel = el("actionLabel"), hint = el("hint"), pipsBox = el("pips");
const transmission = el("transmission"), confirmed = el("confirmed");
const accept = el("accept"), replayButton = el("replay"), announce = el("announce");
const confirmTitle = el("confirmTitle"), calendarButton = el("calendar");
const googleLink = el("gcal"), mapLink = el("map"), backButton = el("back");
const muteButton = el("mute"), fullscreenButton = el("fullscreen");
const startLabel = actionLabel.textContent;
const CONFIRMED_HASH = "#confirmed";

/* ---------- المدعو: index.html?to=الاسم ---------- */
const guestParam = (new URLSearchParams(location.search).get("to") || "").trim();
const guest = Array.from(guestParam).slice(0, 80).join("") || null;

// data-guest="نص فيه {name}" يُملأ باسم المدعو، و data-guest-only يُخفى إذا لم يوجد اسم.
document.querySelectorAll("[data-guest]").forEach(node => {
  node.textContent = guest ? node.dataset.guest.replace("{name}", guest) : "";
});
document.querySelectorAll("[data-guest-only]").forEach(node => { node.hidden = !guest; });

// data-event="المفتاح" يُملأ من EVENT.
const eventText = { ...EVENT, fullDate: (EVENT.day + " " + EVENT.date).trim() };
document.querySelectorAll("[data-event]").forEach(node => {
  node.textContent = eventText[node.dataset.event] || "";
});

/* ---------- الصوت ---------- */
const SOUND = {
  start: [392, 523, 659],
  jump: [440, 660],
  lift: [392, 523, 659],
  reveal: [523, 659, 784],
  confirm: [523, 659, 784, 1047, 1319],
};
let audio = null, muted = false;

function chime(notes, gap = .09) {
  if (muted) return;
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    notes.forEach((hz, i) => {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      const start = audio.currentTime + i * gap;
      oscillator.type = "triangle";
      oscillator.frequency.value = hz;
      gain.gain.setValueAtTime(.06, start);
      gain.gain.exponentialRampToValueAtTime(.001, start + .18);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + .18);
    });
  } catch (error) {
    // الصوت اختياري: الدعوة تعمل بدونه.
  }
}

muteButton.onclick = () => {
  muted = !muted;
  muteButton.setAttribute("aria-pressed", muted);
  muteButton.setAttribute("aria-label", muted ? TEXT.unmute : TEXT.mute);
};

/* ---------- ملء الشاشة ---------- */
let fullscreenOffered = false;

function enterFullscreen() {
  if (document.fullscreenElement || !document.fullscreenEnabled) return;
  document.documentElement.requestFullscreen().catch(() => {});
}

fullscreenButton.hidden = !document.fullscreenEnabled;
fullscreenButton.onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else enterFullscreen();
};
document.addEventListener("fullscreenchange", () => {
  const on = Boolean(document.fullscreenElement);
  fullscreenButton.setAttribute("aria-pressed", on);
  fullscreenButton.setAttribute("aria-label", on ? TEXT.exitFullscreen : TEXT.enterFullscreen);
});

/* ---------- ثوابت المشهد ---------- */
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const TIMING = reduce
  ? { jump: 170, lift: 170, iris: 0, reveal: 200, swap: 0 }
  : { jump: 560, lift: 1600, iris: 950, reveal: 1350, swap: 520 };

const ART_SCALE = 2.3;                        // حجم بكسل الرسم التقريبي ببكسلات CSS
const ELEVATIONS = [0, .07, .04, .14, .20];   // ارتفاع كل منصة كنسبة من ارتفاع اللوحة
const LAST = ELEVATIONS.length - 1;           // المنصة الأخيرة تحت المركبة
const FIRST_X = .12;                          // موقع المنصة الأولى كنسبة من العرض
const PLATFORM_DEPTH = 7;
const SHIP_HALF_WIDTH = 40, SHIP_TOP = 21, SHIP_BOTTOM = 15;
const CROWN_HEIGHT = 11;
const SPOTLIGHT_RADIUS = 26;
const CROWN_RELEASE = .24;                    // لحظة سقوط التاج أثناء السحب
const ZONE_PADDING = 10;                      // هامش حول النص تُمنع فيه النجوم (بكسل CSS)

const SHIP_PARTS = [
  [-11, -21, 22, 4, "#08313f"], [-17, -17, 34, 5, "#082d37"], [-19, -12, 38, 8, "#092d38"],
  [-15, -15, 30, 12, "#16949f"], [-11, -17, 16, 2, "#93ddd9"], [-12, -13, 4, 6, "#b9ece2"],
  [-29, -5, 58, 3, "#062a36"], [-36, -2, 72, 4, "#0a303e"], [-40, 2, 80, 5, "#092735"],
  [-34, 1, 68, 5, "#76b9bd"], [-30, 6, 60, 4, "#205566"], [-22, 10, 44, 3, "#092d39"],
  [-12, 13, 24, 2, "#93fff0"],
];
const MOON_CRATERS = [[-10, -5, 6, 4], [0, 2, 7, 5], [-3, -10, 3, 3], [-6, 9, 4, 2]];
const HILL_COLORS = ["#296571", "#154c5a", "#073744"];
const STARS = Array.from({ length: 100 }, (_, i) => ({
  x: Math.sin(i * 23.1) * .5 + .5,
  y: (Math.sin(i * 9.73 + 2) * .5 + .5) * .77,
}));
const noise = (i, seed) => { const v = Math.sin(i * seed) * 43758.5453; return v - Math.floor(v); };
const CONFETTI_COLORS = ["#ffcf52", "#bdf6e8", "#edfff9", "#16949f", "#ffe9a8"];
const CONFETTI = Array.from({ length: 90 }, (_, i) => ({
  x: noise(i + 1, 12.9898),
  delay: noise(i + 1, 78.233) * .7,
  speed: 24 + noise(i + 1, 39.425) * 36,
  drift: (noise(i + 1, 4.1414) - .5) * 26,
  turn: noise(i + 1, 7.77) * Math.PI * 2,
  size: i % 3 === 0 ? 3 : 2,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
}));
const hairStyle = Math.floor(Math.random() * 3);

/* ---------- الحالة ----------
   start → ready ⇄ jumping → lifting → iris → done ⇄ confirmed
   قيمة phase تُكتب أيضاً في data-phase على ‎.sky ليتبعها style.css. */
let phase = "start";
let landed = 0, jumpTime = 0, liftTime = 0, irisTime = 0, confirmTime = 0;
let mix = { from: 0, to: 0, time: 0 };   // 0 = شاشة الدعوة، 1 = شاشة التأكيد
let layout = "desktop";                  // يُقرأ من ‎--layout في style.css
let scale = ART_SCALE;                   // بكسلات CSS لكل بكسل رسم
let frameId = 0;
const scene = { floor: 0, shipY: 0 };    // مواقع تُحسب من مقاس الصفحة (بكسل رسم)
const targets = { invite: { x: 0, y: 0 }, confirm: { x: 0, y: 0 } };   // مركز الدائرة في كل شاشة
const zones = { invite: null, confirm: null };                         // مكان النص في كل شاشة

const clamp01 = value => Math.min(1, Math.max(0, value));
const lerp = (from, to, t) => from + (to - from) * t;
const smooth = t => t * t * (3 - 2 * t);
const arabic = number => number.toLocaleString("ar-SA");

function setPhase(next) {
  phase = next;
  sky.dataset.phase = next;
}

function showProgress(text) {
  hint.textContent = text;
  Array.from(pipsBox.children).forEach((pip, i) => pip.classList.toggle("on", i < landed));
}

pipsBox.replaceChildren(...Array.from({ length: LAST }, () => document.createElement("i")));

/* ---------- تحديث الحالة ---------- */
function update(now) {
  if (phase === "jumping" && now - jumpTime >= TIMING.jump) {
    landed += 1;
    if (landed === LAST) {
      setPhase("lifting");
      liftTime = now;
      chime(SOUND.lift);
    } else {
      setPhase("ready");
      action.removeAttribute("aria-disabled");
    }
    showProgress("القفزة " + arabic(landed) + " من " + arabic(LAST));
  }
  if (phase === "lifting" && now - liftTime >= TIMING.lift) {
    setPhase("iris");
    irisTime = now;
  }
  if (phase === "iris" && now - irisTime >= TIMING.reveal) {
    chime(SOUND.reveal);
    showInvitation(now);
  }
}

function act() {
  if (phase === "start") {
    if (!fullscreenOffered) {
      fullscreenOffered = true;
      enterFullscreen();
    }
    setPhase("ready");
    chime(SOUND.start);
    actionLabel.textContent = TEXT.jump;
    showProgress("اقفز " + arabic(LAST) + " مرات لتصل إلى التاج");
    refresh();
  } else if (phase === "ready") {
    setPhase("jumping");
    jumpTime = performance.now();
    chime(SOUND.jump, .05);
    // aria-disabled بدل disabled حتى لا يضيع تركيز لوحة المفاتيح.
    action.setAttribute("aria-disabled", "true");
    refresh();
  }
}

function setMix(to, now) {
  mix = { from: confirmMix(now), to, time: now };
}

function confirmMix(now) {
  const t = TIMING.swap ? clamp01((now - mix.time) / TIMING.swap) : 1;
  return lerp(mix.from, mix.to, smooth(t));
}

// يضع المشهد في حالته الأخيرة مباشرة (عند فتح رابط التأكيد بدون لعب).
function seal(now) {
  if (phase === "iris" || phase === "done" || phase === "confirmed") return;
  landed = LAST;
  irisTime = now - 60000;
}

// showInvitation و showConfirmation تغيّران الحالة فقط؛ من يستدعيهما خارج حلقة الرسم يستدعي refresh بعدهما.
function showInvitation(now) {
  seal(now);
  setPhase("done");
  setMix(0, now);
  confirmed.classList.add("pending");
  transmission.classList.remove("pending");
  announce.textContent = el("message").textContent.replace(/\s+/g, " ").trim();
  accept.focus({ preventScroll: true });
}

function showConfirmation(now) {
  seal(now);
  setPhase("confirmed");
  confirmTime = now;
  setMix(1, now);
  transmission.classList.add("pending");
  confirmed.classList.remove("pending");
  confirmed.scrollTop = 0;
  announce.textContent = [TEXT.confirmed, EVENT.title, eventText.fullDate, EVENT.time, EVENT.place].join(" ");
  confirmTitle.focus({ preventScroll: true });
}

function replay() {
  setPhase("start");
  landed = 0;
  mix = { from: 0, to: 0, time: 0 };
  transmission.classList.add("pending");
  confirmed.classList.add("pending");
  announce.textContent = "";
  actionLabel.textContent = startLabel;
  action.removeAttribute("aria-disabled");
  showProgress("");
  action.focus({ preventScroll: true });
  refresh();
}

/* ---------- حساب المواقع ---------- */
function geometry(now) {
  const w = canvas.width, h = canvas.height;
  const sealed = phase === "iris" || phase === "done" || phase === "confirmed";
  const irisT = !sealed ? 0 : TIMING.iris ? clamp01((now - irisTime) / TIMING.iris) : 1;
  const ease = smooth(irisT);

  const firstX = w * FIRST_X;
  const shipX = Math.min(w * (layout === "portrait" ? .76 : .72), w - SHIP_HALF_WIDTH - 2);
  const floor = scene.floor;
  const step = (shipX - firstX) / LAST;
  const ground = floor - h * ELEVATIONS[LAST];
  const hover = reduce ? 0 : Math.sin((sealed ? irisTime : now) / 650) * 1.6;
  const shipY = scene.shipY + hover;
  const focusY = shipY + 18;

  const jump = phase === "jumping" ? clamp01((now - jumpTime) / TIMING.jump) : 0;
  const next = Math.min(LAST, landed + 1);
  const hop = 4 * jump * (1 - jump) * Math.min(h * .13, step * .72);
  const footX = firstX + step * (landed + jump);
  const footY = floor - h * lerp(ELEVATIONS[landed], ELEVATIONS[next], jump) - hop;
  const lift = phase === "lifting" ? clamp01((now - liftTime) / TIMING.lift) : sealed ? 1 : 0;

  // الكاميرا تنقل المركبة إلى مكان الدائرة في الصفحة؛ التقريب يبقي البكسلات حادة.
  const swap = confirmMix(now);
  const targetX = lerp(targets.invite.x, targets.confirm.x, swap);
  const targetY = lerp(targets.invite.y, targets.confirm.y, swap);
  const cameraX = Math.round((targetX - shipX) * ease);
  const cameraY = Math.round((targetY - focusY) * ease);

  return { w, h, sealed, ease, swap, firstX, shipX, shipY, focusY, floor, step, ground, footX, footY, lift, cameraX, cameraY };
}

/* ---------- الرسم ---------- */
function box(x, y, width, height, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

// نصف عرض الدائرة عند صف معيّن؛ الدوائر تُرسم صفاً صفاً لتبقى حوافها بكسلات حادة.
function chord(radius, dy) {
  return Math.abs(dy) < radius ? Math.round(Math.sqrt(radius * radius - dy * dy)) : 0;
}

function disc(centerX, centerY, radius, color) {
  for (let y = -radius; y < radius; y++) {
    const half = chord(radius, y + .5);
    box(centerX - half, centerY + y, half * 2, 1, color);
  }
}

function drawSky({ w, h }) {
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  ["#03252f", "#08424d", "#0c6c78", "#00676e"].forEach((color, i) => gradient.addColorStop(i / 3, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  STARS.forEach((star, i) => {
    const x = star.x * w, y = star.y * h;
    box(x, y, 1, 1, i % 3 ? "#7bafb4" : "#d0f5e9");
    if (i % 17 === 0) {
      box(x - 2, y, 5, 1, "#8ebfc0");
      box(x, y - 2, 1, 5, "#caeade");
    }
  });

  // في الوضع العرضي يُنقل القمر لليمين حتى لا يقع خلف العنوان والزر.
  const moonX = w * (layout === "wide" ? .92 : .17), moonY = h * (layout === "wide" ? .48 : .55);
  for (let y = -15; y < 16; y++) {
    const radius = Math.floor(Math.sqrt(225 - y * y));
    box(moonX - radius, moonY + y, radius * 2, 1, "#8db7bd");
  }
  MOON_CRATERS.forEach(([x, y, width, height]) => box(moonX + x, moonY + y, width, height, "#64949f"));
}

function drawLand({ w, h }) {
  HILL_COLORS.forEach((color, layer) => {
    for (let x = 0; x < w; x += 2) {
      const y = Math.round(h * (.70 + layer * .10) + Math.sin(x * .032 + layer) * 9 + Math.cos(x * .073 + layer) * 4 + Math.sin(x * .81) * 1.6);
      box(x, y, 2, h - y, color);
    }
  });
  for (let x = 3; x < w; x += 9) {
    const y = h - 5 - (x * 13 % 20);
    box(x, y, 1, 3, "#427780");
    if (x % 3 === 0) box(x - 1, y + 1, 3, 1, "#427780");
  }
}

function drawPlatforms({ h, firstX, step, floor }) {
  const width = Math.round(Math.max(16, step * .65));
  ELEVATIONS.forEach((elevation, i) => {
    const left = Math.round(firstX + step * i - width / 2), top = Math.round(floor - h * elevation);
    box(left, top, width, 5, "#082b34");
    box(left + 1, top, width - 2, 1, "#81c9c9");
    box(left + 3, top + 5, width - 6, 2, "#0a515d");
  });
}

// الشعاع يظهر أثناء السحب ويتلاشى مع إغلاق الدائرة.
function drawBeam({ shipX, shipY, ground, ease }, now) {
  if (phase !== "lifting" && phase !== "iris") return;
  ctx.globalAlpha = 1 - ease;
  const beam = ctx.createLinearGradient(shipX, shipY, shipX, ground);
  beam.addColorStop(0, "#8cfff5a8");
  beam.addColorStop(1, "#59f5d71a");
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(shipX - 10, shipY + 8);
  ctx.lineTo(shipX + 10, shipY + 8);
  ctx.lineTo(shipX + 31, ground + 2);
  ctx.lineTo(shipX - 31, ground + 2);
  ctx.fill();
  const span = Math.max(1, ground - shipY - 16);
  for (let i = 0; i < 11; i++) {
    const rise = (reduce ? i * 17 : now * .024 + i * 17) % span;
    box(shipX + (i * 17 % 31) - 15, ground - rise, 1, 2, "#98e7da");
  }
  ctx.globalAlpha = 1;
}

function drawShip({ shipX, shipY, focusY, sealed, ease }) {
  SHIP_PARTS.forEach(([x, y, width, height, color]) => box(shipX + x, shipY + y, width, height, color));
  for (let x = -27; x < 32; x += 9) box(shipX + x, shipY + 3, 4, 2, "#d5fff1");
  if (sealed) {
    // نافذة دائرية تغطي المركبة وتظهر فيها الشخصية.
    ctx.globalAlpha = ease;
    disc(Math.round(shipX), Math.round(focusY), SPOTLIGHT_RADIUS + 1, "#538f98");
    ctx.globalAlpha = 1;
  }
}

function drawCrown(x, base) {
  const gold = "#ffcf52";
  box(x + 1, base - 9, 3, 4, gold);
  box(x + 7, base - 11, 3, 6, gold);
  box(x + 13, base - 9, 3, 4, gold);
  box(x + 2, base - 6, 13, 4, gold);
  box(x + 2, base - 2, 13, 2, "#ae701e");
  box(x + 7, base - 5, 3, 2, "#087788");
}

function drawCharacterAndCrown({ shipX, shipY, ground, footX, footY, lift, sealed }) {
  const black = "#081219", eye = "#edfffa";
  const restY = footY - 23, cabinY = shipY + 9;
  const py = lerp(restY, cabinY, lift);
  const px = footX - 8 + (reduce ? 0 : Math.sin(lift * 10) * 3 * (1 - lift));

  box(px, py, 16, 15, black);
  box(px + 2, py - 3, 12, 4, black);
  if (hairStyle === 0) box(px + 4, py - 6, 3, 4, black);
  else if (hairStyle === 1) box(px + 9, py - 6, 5, 3, black);
  else box(px - 2, py + 3, 3, 4, black);
  box(px + 3, py + 14, 10, 6, black);
  box(px + 1, py + 19, 5, 4, black);
  box(px + 11, py + 19, 4, 4, black);
  box(px + 7, py + 4, 2, 4, eye);
  box(px + 12, py + 4, 2, 4, eye);
  box(px - 3, py + 11, 5, 4, black);

  // التاج ينتظر على المنصة الأخيرة، يرتفع قليلاً مع الشخصية ثم يسقط.
  if (sealed && phase !== "iris") return;
  let crownX = shipX - 8, crownBase = ground;
  if (phase === "lifting" && lift <= CROWN_RELEASE) {
    crownX = px;
    crownBase = py - 3;
  } else if (phase === "lifting") {
    const fall = Math.min(1, (lift - CROWN_RELEASE) / .35);
    const releaseBase = lerp(ground - 23, cabinY, CROWN_RELEASE) - 3;
    crownBase = lerp(releaseBase, ground, fall * fall);
  }
  drawCrown(crownX, crownBase);
}

function inZone(zone, x, y) {
  return zone && x > zone.left && x < zone.right && y > zone.top && y < zone.bottom;
}

// ستارة سوداء تُغلق على المركبة، وحولها نجوم تتلألأ خارج مكان النص.
function drawIris({ w, h, shipX, focusY, cameraX, cameraY, ease }, now) {
  const centerX = Math.round(shipX) + cameraX, centerY = Math.round(focusY) + cameraY;
  const radius = lerp(Math.hypot(w, h), SPOTLIGHT_RADIUS, ease);
  ctx.fillStyle = "#000";
  for (let y = 0; y < h; y++) {
    const half = chord(radius, y + .5 - centerY);
    if (!half) ctx.fillRect(0, y, w, 1);
    else {
      if (centerX - half > 0) ctx.fillRect(0, y, centerX - half, 1);
      if (centerX + half < w) ctx.fillRect(centerX + half, y, w - centerX - half, 1);
    }
  }

  const zone = phase === "confirmed" ? zones.confirm : zones.invite;
  ctx.save();
  STARS.forEach((star, i) => {
    const x = star.x * w, y = star.y * h / .77;
    if (inZone(zone, x, y) || Math.hypot(x - centerX, y - centerY) < radius + 3) return;
    const light = reduce ? .7 : .56 + .36 * Math.sin(now / (750 + i * 9) + i * 2);
    ctx.globalAlpha = light * ease;
    box(x, y, 1, 1, "#eafffa");
    if (i % 8 === 0) {
      ctx.globalAlpha = light * light * ease;
      box(x - 2, y, 5, 1, "#b9e1df");
      box(x, y - 2, 1, 5, "#b9e1df");
    }
  });
  ctx.restore();
}

// احتفال التأكيد: حلقة ذهبية، بريق يدور، التاج يهبط على رأس الشخصية، وقصاصات تتساقط.
function drawCelebration({ w, h, shipX, shipY, focusY, cameraX, cameraY, swap }, now) {
  if (swap <= 0) return;
  const centerX = Math.round(shipX) + cameraX, centerY = Math.round(focusY) + cameraY;
  const since = now - confirmTime;

  ctx.globalAlpha = swap;
  for (let i = 0; i < 190; i++) {
    const angle = i / 190 * Math.PI * 2;
    box(centerX + Math.cos(angle) * 28.5 - .5, centerY + Math.sin(angle) * 28.5 - .5, 2, 2, "#ffcf52");
  }
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3 + (reduce ? .4 : now / 2600);
    const x = centerX + Math.cos(angle) * (36 + i % 2 * 4), y = centerY + Math.sin(angle) * (36 + i % 2 * 4);
    const twinkle = reduce ? 1 : .5 + .5 * Math.sin(now / 280 + i * 2.1);
    ctx.globalAlpha = swap * (.35 + .65 * twinkle);
    box(x, y, 1, 1, "#fff3c4");
    if (twinkle > .55) {
      box(x - 1, y, 3, 1, "#ffcf52");
      box(x, y - 1, 1, 3, "#ffcf52");
    }
  }
  ctx.globalAlpha = 1;
  if (phase !== "confirmed") return;

  // التاج يسقط من فوق الدائرة ثم يرتد قليلاً على الرأس.
  const fall = reduce ? 1 : clamp01((since - 260) / 620);
  const drop = fall < .7 ? -64 * (1 - (fall / .7) ** 2) : -4 * Math.sin((fall - .7) / .3 * Math.PI);
  if (reduce || since > 260) drawCrown(Math.round(shipX) + cameraX - 8, Math.round(shipY) + cameraY + 6 + drop);

  if (reduce) return;
  const seconds = since / 1000;
  CONFETTI.forEach(piece => {
    const t = seconds - piece.delay;
    if (t < 0) return;
    const y = -6 + piece.speed * t + 38 * t * t;
    if (y > h) return;
    const x = piece.x * w + piece.drift * t + Math.sin(t * 5 + piece.turn) * 3;
    box(x, y, piece.size, Math.sin(t * 9 + piece.turn) > 0 ? piece.size : 1, piece.color);
  });
}

function draw(now) {
  const g = geometry(now);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, g.w, g.h);
  ctx.save();
  ctx.translate(g.cameraX, g.cameraY);
  drawSky(g);
  drawLand(g);
  drawPlatforms(g);
  drawBeam(g, now);
  drawShip(g);
  drawCharacterAndCrown(g);
  ctx.restore();
  if (g.sealed) {
    drawIris(g, now);
    drawCelebration(g, now);
  }
}

/* ---------- حلقة الرسم والمقاسات ---------- */
function frame(now) {
  update(now);
  draw(now);
  const animating = phase === "jumping" || phase === "lifting" || phase === "iris";
  if (!reduce || animating) frameId = requestAnimationFrame(frame);
}

function refresh() {
  cancelAnimationFrame(frameId);
  frame(performance.now());
}

// المشهد يتبع الصفحة: الأرض فوق منصة التحكم، والعنوان في الشريط الفارغ بين المركبة والتاج.
function layoutScene() {
  const h = canvas.height;
  const headerBottom = header.offsetHeight / scale;
  scene.shipY = Math.max(h * (layout === "portrait" ? .19 : .21), headerBottom + SHIP_TOP + 3);
  const dockDepth = dock.offsetHeight / scale + PLATFORM_DEPTH + 2;
  scene.floor = layout === "wide" ? h * .90 : Math.min(h * .90, Math.max(h * .60, h - dockDepth));

  const ground = scene.floor - h * ELEVATIONS[LAST];
  const bandTop = (scene.shipY + SHIP_BOTTOM + 5) * scale;
  const bandBottom = (ground - CROWN_HEIGHT - 5) * scale;
  sky.style.setProperty("--band-top", bandTop + "px");
  sky.style.setProperty("--band-h", Math.max(0, bandBottom - bandTop) + "px");
}

// مركز الدائرة ومكان النص في كل شاشة، بإحداثيات اللوحة.
function measureScreens() {
  const origin = canvas.getBoundingClientRect();
  [["invite", transmission], ["confirm", confirmed]].forEach(([key, screen]) => {
    const hole = screen.querySelector(".porthole").getBoundingClientRect();
    const copy = screen.querySelector(".copy").getBoundingClientRect();
    targets[key] = {
      x: Math.round((hole.left + hole.width / 2 - origin.left) / scale),
      y: Math.round((hole.top + hole.height / 2 - origin.top) / scale),
    };
    zones[key] = {
      left: (copy.left - origin.left - ZONE_PADDING) / scale,
      top: (copy.top - origin.top - ZONE_PADDING) / scale,
      right: (copy.right - origin.left + ZONE_PADDING) / scale,
      bottom: (copy.bottom - origin.top + ZONE_PADDING) / scale,
    };
  });
}

function resize() {
  // كل بكسل رسم = عدد صحيح من بكسلات الشاشة، فتكون البكسلات متساوية الحجم.
  // وعلى الشاشات الكبيرة يكبر الرسم حتى لا يبدو المشهد صغيراً.
  const ratio = window.devicePixelRatio || 1;
  const roomy = Math.min(2.2, Math.max(1, Math.min(sky.clientWidth / 1280, sky.clientHeight / 720)));
  scale = Math.max(1, Math.round(ART_SCALE * roomy * ratio)) / ratio;
  canvas.width = Math.max(1, Math.ceil(sky.clientWidth / scale));
  canvas.height = Math.max(1, Math.ceil(sky.clientHeight / scale));
  canvas.style.width = canvas.width * scale + "px";
  canvas.style.height = canvas.height * scale + "px";
  sky.style.setProperty("--art", scale + "px");
  layout = getComputedStyle(sky).getPropertyValue("--layout").trim() || "desktop";
  layoutScene();
  measureScreens();
  refresh();
}

/* ---------- التحكم ---------- */
action.onclick = act;
canvas.onclick = act;

document.addEventListener("keydown", event => {
  const playing = phase === "start" || phase === "ready" || phase === "jumping";
  if (event.repeat || !playing || !["Space", "ArrowUp"].includes(event.code)) return;
  // المسافة على زر تضغطه تلقائياً؛ السهم ↑ يقفز دائماً أينما كان التركيز.
  if (event.code === "Space" && event.target.closest("button, a")) return;
  event.preventDefault();
  act();
});

// الدائرة تتبع مكانها في الصفحة عند التمرير.
[transmission, confirmed].forEach(screen => {
  screen.addEventListener("scroll", () => {
    measureScreens();
    if (reduce) refresh();
  }, { passive: true });
});

/* ---------- قبول الدعوة وصفحة التأكيد ---------- */
function openLink(href, download) {
  const link = document.createElement("a");
  link.href = href;
  if (download) link.download = download;
  else {
    link.target = "_blank";
    link.rel = "noopener";
  }
  link.click();
}

accept.onclick = () => {
  chime(SOUND.confirm, .1);
  // عنوان خاص بالتأكيد: زر الرجوع في المتصفح يعيد إلى الدعوة، وفتح الرابط يعرض البطاقة مباشرة.
  history.pushState({ fromInvite: true }, "", CONFIRMED_HASH);
  showConfirmation(performance.now());
  refresh();
};

const registerLink = el("register");
registerLink.hidden = el("registerNote").hidden = !EVENT.registerUrl;
if (EVENT.registerUrl) registerLink.href = EVENT.registerUrl.replace("{name}", encodeURIComponent(guest || ""));

backButton.onclick = () => {
  if (history.state && history.state.fromInvite) history.back();
  else {
    history.replaceState(null, "", location.pathname + location.search);
    showInvitation(performance.now());
    refresh();
  }
};

window.addEventListener("popstate", () => {
  const wantsConfirmed = location.hash === CONFIRMED_HASH;
  if (wantsConfirmed && phase !== "confirmed") showConfirmation(performance.now());
  else if (!wantsConfirmed && phase === "confirmed") showInvitation(performance.now());
  else return;
  refresh();
});

replayButton.onclick = replay;

/* ---------- التقويم ---------- */
const eventStart = new Date(EVENT.start), eventEnd = new Date(EVENT.end);
const hasSchedule = !Number.isNaN(eventStart.getTime()) && !Number.isNaN(eventEnd.getTime());
const calendarStamp = date => date.toISOString().replace(/[-:]|\.\d{3}/g, "");
const calendarTitle = EVENT.title + " — " + EVENT.host;
const calendarNote = "دعوة من " + EVENT.host + ".";

calendarButton.hidden = googleLink.hidden = !hasSchedule;
if (hasSchedule) {
  googleLink.href = "https://calendar.google.com/calendar/render?" + new URLSearchParams({
    action: "TEMPLATE",
    text: calendarTitle,
    dates: calendarStamp(eventStart) + "/" + calendarStamp(eventEnd),
    location: EVENT.place,
    details: calendarNote,
  });
}

// ملف ‎.ics يفتحه تقويم Apple و Outlook وأغلب تطبيقات التقويم.
calendarButton.onclick = () => {
  const escape = text => text.replace(/[\\;,]/g, "\\$&");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Gaming Club//Workshop Invite//AR",
    "BEGIN:VEVENT",
    "UID:" + calendarStamp(eventStart) + "@gaming-club-workshop",
    "DTSTAMP:" + calendarStamp(new Date()),
    "DTSTART:" + calendarStamp(eventStart),
    "DTEND:" + calendarStamp(eventEnd),
    "SUMMARY:" + escape(calendarTitle),
    "LOCATION:" + escape(EVENT.place),
    "DESCRIPTION:" + escape(calendarNote),
    "END:VEVENT", "END:VCALENDAR",
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" }));
  openLink(url, "workshop.ics");
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

mapLink.hidden = !EVENT.mapUrl;
if (EVENT.mapUrl) mapLink.href = EVENT.mapUrl;

/* ---------- البدء ---------- */
window.addEventListener("resize", resize);
// ارتفاع المشهد يتغيّر على الجوال مع ظهور شريط العنوان واختفائه، وقد لا يصل حدث resize.
if (window.ResizeObserver) new ResizeObserver(resize).observe(sky);
resize();
// الخطوط تغيّر مقاسات النص، فيُعاد القياس بعد تحميلها.
if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
// فتح رابط التأكيد مباشرة يعرض البطاقة بدون إعادة اللعب.
if (location.hash === CONFIRMED_HASH) {
  showConfirmation(performance.now());
  refresh();
}
