
const CONFIG = {
  SCREEN: {
    CENTER_X: 1376,
    CENTER_Y: 1032,
    FOV_RADIUS: 180,
    ZOOM: 15,
   TOUCH_DELAY: 0.0001
  },
  FIRE_BUTTON: {
    SIZE: 5000,
  TOUCH_DELAY: 0
  },
  AIM_ZONES: {
    head: { radius: 360 },
    neck: { radius: 180 },
    chest: { radius: 90 }
  },
  SENSITIVITY: {
    dpi: 20000,
    gameSensitivity: 1000
  },
  FIRE: {
    auto: true,
    burst: true,
    cooldownShort: 0,
    cooldownLong: 0
  },
  MODES: {
    manualOverride: false,
    debugOverlay: true
  },
  THRESHOLDS: {
    lockThreshold: 0.001,
    retrainError: 0,
    retrainCount: 0
  },
  SNAPSHOT: {
    enabled: true,
    path: "./"
  }
};
const GamePackages = {
  GamePackage1: "com.dts.freefireth",
  GamePackage2: "com.dts.freefiremax"
};
let CENTER_X = CONFIG.SCREEN.CENTER_X;
let CENTER_Y = CONFIG.SCREEN.CENTER_Y;
class AimAssistSystem {
  constructor() {
    this.vectorHistory = [];
    this.errorProfile = [];
    this.targetHistory = [];
    this.lastFrameTime = Date.now();
    this.zoomActive = false;
    this.weapon = 'default';
  }
  smoothVector(inputVector) {
    this.vectorHistory.push(inputVector);
    if (this.vectorHistory.length > 5) this.vectorHistory.shift();
    const avg = this.vectorHistory.reduce((acc, v) => ({
      x: acc.x + v.x,
      y: acc.y + v.y
    }), { x: 0, y: 0 });
    return {
      x: avg.x / this.vectorHistory.length,
      y: avg.y / this.vectorHistory.length
    };
  }
  detectState(player) {
    return player.isInAir ? 'AIR' :
           player.isJumping ? 'JUMP' :
           player.isKneeling ? 'KNEEL' : 'GROUND';
  }
  updateZoomState(isZooming, zoomLevel) {
    this.zoomActive = isZooming && zoomLevel === 2;
  }
  adjustSensitivity(vector, speed) {
    const factor = Math.max(0.5, Math.min(2, 10 / speed));
    return { x: vector.x * factor, y: vector.y * factor };
  }
  prioritizeHead(target) {
    return { x: target.x, y: target.y - target.height * 0.6 };
  }
  simulateNaturalShot(lockStable) {
    return lockStable ? Math.random() > 0.2 : false;
  }
  removeRecoil(vector, recoil) {
    return { x: vector.x - recoil.x, y: vector.y - recoil.y };
  }
  oneShotAI(target) {
    if (target.distance < 20 && !target.hasHelmet) {
      return { x: target.x, y: target.y - target.height * 0.6 }; // strong head pull
    }
    return null;
  }
  applyGhostOverlay(vector, target) {
    return target.behindWall ? { x: target.x, y: target.y - 10 } : vector;
  }
  applyXitated(vector) {
    return { x: vector.x * 1.5, y: vector.y };
  }
  avoidNeckArmor(vector, target) {
    return { x: vector.x, y: target.y - target.height * 0.7 };
  }
  microAdjust(vector) {
    const error = this.estimateError();
    return { x: vector.x - error.x * 0.1, y: vector.y - error.y * 0.1 };
  }
  estimateError() {
    if (this.errorProfile.length < 5) return { x: 0, y: 0 };
    const last = this.errorProfile[this.errorProfile.length - 1];
    const first = this.errorProfile[0];
    return {
      x: (last.x - first.x) / this.errorProfile.length,
      y: (last.y - first.y) / this.errorProfile.length
    };
  }
  cacheError(vector, actual) {
    this.errorProfile.push({ x: actual.x - vector.x, y: actual.y - vector.y });
    if (this.errorProfile.length > 10) this.errorProfile.shift();
  }
  predictTarget(target) {
    if (this.targetHistory.length < 2) return target;
    const last = this.targetHistory[this.targetHistory.length - 1];
    const prev = this.targetHistory[this.targetHistory.length - 2];
    const dx = last.x - prev.x;
    const dy = last.y - prev.y;
    return { x: target.x + dx * 1.2, y: target.y + dy * 1.2 };
  }
  addNoise(vector) {
    const noise = (Math.random() - 0.5) * 0.3;
    return { x: vector.x + noise, y: vector.y + noise };
  }
  refineSubPixel(vector) {
    return {
      x: Math.round(vector.x * 10) / 10,
      y: Math.round(vector.y * 10) / 10
    };
  }
  optimizeFPS(startTime) {
    const elapsed = Date.now() - startTime;
    if (elapsed < 3) {
      const wait = 3 - elapsed;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
    }
  }
  processFrame(inputVector, player, target, recoil) {
    const start = Date.now();
    this.targetHistory.push({ x: target.x, y: target.y });
    if (this.targetHistory.length > 5) this.targetHistory.shift();
    let vector = this.smoothVector(inputVector);
    vector = this.adjustSensitivity(vector, player.speed);
    vector = this.removeRecoil(vector, recoil);
    if (this.zoomActive) vector = this.applyXitated(vector);
    const oneShot = this.oneShotAI(target);
    if (oneShot) vector = oneShot;
    vector = this.microAdjust(vector);
    vector = this.refineSubPixel(vector);
    vector = this.addNoise(vector);
    vector = this.applyGhostOverlay(vector, target);
    if (this.weapon === 'SMG') vector = this.avoidNeckArmor(vector, target);
    vector = this.prioritizeHead(target);
    this.cacheError(vector, target);
    this.optimizeFPS(start);
    return vector;
  }
}
this.AimAssistSystem = AimAssistSystem;
const EXTRA_CONFIG = {
  smoothingFrames: 5,
  zoomLevelTrigger: 2,
  sensitivityBase: 10.0,
  recoilCompensation: true,
  aimPrecision: 0.001,
  useHumanNoise: true,
  noiseLevel: 0.01,              // Mức nhiễu thấp nhất có thể (lọc cực mượt, siêu chính xác)
maxFPS: 1000,                  // Cập nhật siêu nhanh (giới hạn phần cứng & API)
recoilBuffer: 0,               // Không delay khi recoil, phản ứng tức thì
oneShotDistance: 9999,         // Tầm bắn one-shot toàn bản đồ
enableGhostTracking: true,     // Theo dõi xuyên tường, xuyên mất mục tiêu
headOffsetRatio: 0.95,         // Khoá sát vị trí bone head nhất có thể
neckAvoidRatio: 0.99,          // Tránh hoàn toàn cổ, chỉ ưu tiên đúng đầu
xitatedFactor: 5.0             // Siêu nhạy với mục tiêu gần hoặc chuyển động
};
const DELAY = {
  frameProcessing: 3,     
  shotCooldown: 120,      
  trackingLagComp: 2      
};
const VECTOR_CACHE = {
  recentErrors: [],
  frameVectors: [],
  targetHistory: [],
  shotTimestamps: []
};
class CoordinateTracker {
  constructor() {
    this.xyzData = []; 
  }
  track(x, y, z) {
    this.xyzData.push({ x, y, z, t: Date.now() });
    if (this.xyzData.length > 100) this.xyzData.shift(); 
  }
  getLast() {
    return this.xyzData.length > 0 ? this.xyzData[this.xyzData.length - 1] : null;
  }
  getAverage() {
    if (this.xyzData.length === 0) return { x: 0, y: 0, z: 0 };
    const sum = this.xyzData.reduce((acc, v) => ({
      x: acc.x + v.x,
      y: acc.y + v.y,
      z: acc.z + v.z
    }), { x: 0, y: 0, z: 0 });
    return {
      x: sum.x / this.xyzData.length,
      y: sum.y / this.xyzData.length,
      z: sum.z / this.xyzData.length
    };
  }
  clear() {
    this.xyzData = [];
  }
}
this.CONFIG = CONFIG;
this.DELAY = DELAY;
this.VECTOR_CACHE = VECTOR_CACHE;
this.CoordinateTracker = CoordinateTracker;
const BODY_POINTS = {
  HEAD:   { offsetY: 0.00907892, zone: 'head' },
  NECK:   { offsetY: 0.00907892, zone: 'neck' },
  CHEST:  { offsetY: 0.00907892, zone: 'chest' },
  BELLY:  { offsetY: 0.00907892, zone: 'stomach' }
};
class ScreenStabilizer {
  constructor() {
    this.lastMotion = { x: 0, y: 0 };
  }
  stabilize(currentMotion) {
    const threshold = 0.5; 
    const dx = currentMotion.x - this.lastMotion.x;
    const dy = currentMotion.y - this.lastMotion.y;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
      return this.lastMotion;
    }
    this.lastMotion = currentMotion;
    return currentMotion;
  }
}
class ScreenTracker {
  constructor() {
    this.motion = new ScreenStabilizer();
    this.frames = [];
  }
  simulateFrameCapture() {
    const randomTarget = {
      x: Math.random() * 1920,
      y: Math.random() * 1080,
      height: 150,
      hasHelmet: Math.random() > 0.5,
      behindWall: Math.random() > 0.7,
      distance: Math.random() * 50
    };
    return randomTarget;
  }
  simulateMotion() {
    const dx = (Math.random() - 0.5) * 3;
    const dy = (Math.random() - 0.5) * 3;
    return { x: dx, y: dy };
  }
  trackFrame(aimSystem, player, recoil) {
    const rawTarget = this.simulateFrameCapture();
    const stabilizedMotion = this.motion.stabilize(this.simulateMotion());
    const inputVector = { x: rawTarget.x + stabilizedMotion.x, y: rawTarget.y + stabilizedMotion.y };
    const processed = aimSystem.processFrame(inputVector, player, rawTarget, recoil);
    this.frames.push({ rawTarget, processed, time: Date.now() });
    return processed;
  }
}

this.BODY_POINTS = BODY_POINTS;
this.ScreenStabilizer = ScreenStabilizer;
this.ScreenTracker = ScreenTracker;
const CONFIGFIX = {
  smoothingFrames: 5,
  frameDelay: 5,
  noiseLevel: 0.2,
  recoilCancelFactor: 1.0,
  fpsLogInterval: 1000,
  trackHistoryLimit: 50,
  enableGhostOverlay: true,
  enableOneShotAI: true,
  adaptiveSensitivity: true,
  stabilizationWindow: 7
};
// Giả định đã có dữ liệu bone head từ game API

const DATA = {
  trackHistory: [],
  frameTimes: [],
  lastShotTime: 0,
  vectorErrors: []
};
class Stabilizer {
  constructor(windowSize) {
    this.windowSize = windowSize;
    this.buffer = [];
  }
  feed(vector) {
    this.buffer.push(vector);
    if (this.buffer.length > this.windowSize) this.buffer.shift();
    const avg = this.buffer.reduce((acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }), { x: 0, y: 0 });
    return { x: avg.x / this.buffer.length, y: avg.y / this.buffer.length };
  }
}
class TargetTracker {
  constructor() {
    this.stabilizer = new Stabilizer(CONFIG.stabilizationWindow);
  }
  predictNext(current, velocity) {
    return { x: current.x + velocity.x, y: current.y + velocity.y };
  }
  track(target, velocity) {
    let predicted = this.predictNext(target, velocity);
    predicted = this.stabilizer.feed(predicted);
    const noise = (val) => val + (Math.random() - 0.5) * CONFIG.noiseLevel;
    return { x: noise(predicted.x), y: noise(predicted.y) };
  }
}
class FPSManager {
  constructor(interval) {
    this.interval = interval;
    this.frames = [];
    setInterval(() => this.logFPS(), interval);
  }
  recordFrame() {
    const now = Date.now();
    this.frames.push(now);
    this.frames = this.frames.filter(t => now - t <= this.interval);
  }
  logFPS() {
    console.log("FPS:", this.frames.length);
    this.frames = [];
  }
}
function cacheVectorError(target, actual) {
  const error = {
    dx: actual.x - target.x,
    dy: actual.y - target.y,
    time: Date.now()
  };
  DATA.vectorErrors.push(error);
  if (DATA.vectorErrors.length > CONFIG.trackHistoryLimit) {
    DATA.vectorErrors.shift();
  }
}
function startStableTracking(tracker) {
  const fpsManager = new FPSManager(CONFIG.fpsLogInterval);
  function loop() {
    fpsManager.recordFrame();
    const dummyTarget = { x: Math.random(), y: Math.random() };
    const dummyVelocity = { x: (Math.random() - 0.5) / 20, y: (Math.random() - 0.5) / 20 };
    const result = tracker.track(dummyTarget, dummyVelocity);
    cacheVectorError(dummyTarget, result);
    setTimeout(loop, CONFIG.frameDelay);
  }
  loop();
}
const tracker = new TargetTracker();
startStableTracking(tracker);
function applyAimForce(current, target) {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const force = 1.8; 
  return {
    x: current.x + dx * force,
    y: current.y + dy * force
  };
}
function boostIfUnarmored(target, vector) {
  if (!target.hasHelmet) {
    return {
      x: vector.x * 2.0,
      y: vector.y * 2.0
    };
  }
  return vector;
}

function snapToHeadZone(vector) {
  const z = CONFIG && CONFIG.headshotPriorityZone;
  if (
    z &&
    vector.x > z.xMin && vector.x < z.xMax &&
    vector.y > z.yMin && vector.y < z.yMax
  ) {
    return {
      x: (z.xMin + z.xMax) / 2,
      y: (z.yMin + z.yMax) / 2
    };
  }
  return vector;
}

function enhancedTrackingLoop(tracker) {
  const fpsManager = new FPSManager(CONFIG.fpsLogInterval);
  function loop() {
    fpsManager.recordFrame();
    const dummyTarget = {
      x: Math.random(), y: Math.random(),
      hasHelmet: Math.random() > 0.5
    };
    const dummyVelocity = {
      x: (Math.random() - 0.5) / 20,
      y: (Math.random() - 0.5) / 20
    };
    let tracked = tracker.track(dummyTarget, dummyVelocity);
    tracked = applyAimForce(tracked, dummyTarget);
    tracked = boostIfUnarmored(dummyTarget, tracked);
    tracked = snapToHeadZone(tracked);
    cacheVectorError(dummyTarget, tracked);
    setTimeout(loop, CONFIG.frameDelay);
  }
  loop();
}
CONFIG.frameDelay = 2;
CONFIG.stabilizationWindow = 9;
const enhancedTracker = new TargetTracker();
enhancedTrackingLoop(enhancedTracker);
function lockToCrown(target) {
  return {
    x: target.x,
    y: target.y - target.height * 0.75
  };
}
function hyperAimSnap(current, target, priority = 'HEAD') {
  const dx = target.x - current.x;
  const dy = (target.y - current.y) - 0.05;
  const force = priority === 'HEAD' ? 2.5 : 1.8;
  return {
    x: current.x + dx * force,
    y: current.y + dy * force
  };
}

function huotDinhDauLoop(tracker) {
  // Giả lập FPS manager đơn giản cho log
  const fpsManager = {
    frameTimes: [],
    interval: CONFIG.fpsLogInterval,
    recordFrame() {
      const now = Date.now();
      this.frameTimes.push(now);
      this.frameTimes = this.frameTimes.filter(t => now - t <= this.interval);
      // Bạn có thể bỏ console.log nếu muốn tắt log
      console.log("FPS:", this.frameTimes.length);
    }
  };

  function loop() {
    fpsManager.recordFrame();

    // Tạo mục tiêu giả lập
    const dummyTarget = {
      x: Math.random(),
      y: Math.random(),
      height: 1.0,
      hasHelmet: Math.random() > 0.5
    };
    const dummyVelocity = {
      x: (Math.random() - 0.5) / 20,
      y: (Math.random() - 0.5) / 20
    };

    // Theo dõi mục tiêu
    let tracked = tracker.track(dummyTarget, dummyVelocity);

    // Điều chỉnh vị trí lock
    tracked = lockToCrown(dummyTarget);

    // Áp dụng aim snap
    tracked = hyperAimSnap(tracked, dummyTarget, 'HEAD');

    // Ghi lại lỗi vector
    cacheVectorError(dummyTarget, tracked);

    // Lặp lại vòng lặp với độ trễ cấu hình
    setTimeout(loop, CONFIG.frameDelay);
  }

  loop();
}

CONFIG.frameDelay = 0;
CONFIG.stabilizationWindow = 9;
const headSnapTracker = new TargetTracker();
// [DISABLED redundant loop] huotDinhDauLoop\([^)]*\)

// Lưu ý: Không thể dùng Node.js modules như require(), exec(), fs, Jimp trong Shadowrocket.

function detectHeadZone(callback) {
  Jimp.read(SCREENSHOT_FILE).then(img => {
    let maxVal = 0;
    let head = { x: CENTER_X, y: CENTER_Y };
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {
      const r = this.bitmap.data[idx];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];
      const brightness = r + g + b;
      if (brightness > maxVal && brightness > 600) {
        maxVal = brightness;
        head = { x, y };
      }
    });
    console.log("Detected head at:", head);
    callback(head);
  }).catch(err => console.error("JIMP error:", err));
}
function adbAimAt(target) {
  const dx = target.x - CENTER_X;
  const dy = target.y - CENTER_Y;
  const endX = CENTER_X + dx;
  const endY = CENTER_Y + dy;
  const duration = 50;
  const cmd = `adb shell input swipe ${CENTER_X} ${CENTER_Y} ${endX} ${endY} ${duration}`;
  exec(cmd, (err) => {
    if (err) return console.error("ADB swipe failed:", err);
    console.log("Aimed via ADB.");
  });
}

function startiPhoneAimLoop() {
  function step() {
    // Không gọi captureAndroidScreen, trực tiếp giả lập hoặc lấy dữ liệu target khác
    detectHeadZone((target) => {
      adbAimAt(target);
      setTimeout(step, 300);
    });
  }
  step();
}

// Giả lập detectHeadZone trong Shadowrocket (ví dụ lấy dữ liệu target mẫu)
function detectHeadZone(callback) {
  // Tạo dữ liệu mục tiêu mẫu
  const dummyTarget = {
    x: Math.random() * 1080,
    y: Math.random() * 1920,
    height: 1.0,
    hasHelmet: false,
    behindWall: false,
    distance: 9999
  };
  callback(dummyTarget);
}

// Giả lập hàm điều khiển bắn ngắm
function adbAimAt(target) {
  // Thay thế bằng logic điều khiển game hoặc tính toán nội bộ
  console.log("Aiming at target:", target);
}

// Bắt đầu vòng lặp
// [DISABLED redundant loop] startAndroidAimLoop\(\)

function advancedAimVector(current, target) {
  const dx = target.x - current.x;
  const dy = (target.y - current.y) - 0.1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const force = dist > 150 ? 2.5 : 1.5;
  return {
    x: current.x + dx * force,
    y: current.y + dy * force
  };
}

function smartAIiPhoneAimLoop() {
  function step() {
    // Giả lập lấy target trong Shadowrocket
    getHeadTarget((target) => {
      const tracked = advancedAimVector({ x: CENTER_X, y: CENTER_Y }, target);
      adbAimAt(tracked);
      setTimeout(step, 300);
    });
  }
  step();
}

// Giả lập hàm lấy target head (thay bằng dữ liệu thật nếu có)
function getHeadTarget(callback) {
  const dummyTarget = {
    x: Math.random() * 1080,
    y: Math.random() * 1920,
    height: 1.0,
    hasHelmet: false,
    behindWall: false,
    distance: 9999
  };
  callback(dummyTarget);
}

// Hàm giả lập tính toán vector aim nâng cao
function advancedAimVector(current, target) {
  // Ví dụ tính vector hướng về target
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  return {
    x: current.x + dx * 0.8,
    y: current.y + dy * 0.8
  };
}

// Giả lập hành động aim hoặc bắn
function adbAimAt(vector) {
  console.log("Aiming at:", vector);
}

// Biến phụ trợ
let fallbackCount = 0;
let lastKnownTarget = { x: CENTER_X, y: CENTER_Y };

// [DISABLED redundant loop] smartAIiPhoneAimLoop\(\)

function getFallbackTarget() {
  fallbackCount++;
  if (fallbackCount > 3) {
    console.warn("Too many fallbacks  resetting to center.");
    return { x: CENTER_X, y: CENTER_Y };
  }
  console.warn("Fallback to last known target:", lastKnownTarget);
  return lastKnownTarget;
}
function antiMissCompensation(current, target) {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const strength = 1.2;
  return {
    x: current.x + dx * strength,
    y: current.y + dy * strength
  };
}

// Giả lập hàm chụp màn hình (thay vì chụp thật)
function captureiPhoneScreen(callback) {
  // Trả dữ liệu dummy mô phỏng target detected
  setTimeout(() => {
    callback({
      x: Math.random() * 1080,
      y: Math.random() * 1920,
      height: 1,
      hasHelmet: false,
      behindWall: false,
      distance: 9999
    });
  }, 50);
}

// Giả lập hàm gọi AI detect
function runHeadDetection(callback) {
  // Trả luôn dữ liệu giả lập tương tự captureAndroidScreen
  setTimeout(() => {
    const fakeDetection = {
      x: Math.random() * 1080,
      y: Math.random() * 1920,
      height: 1,
      hasHelmet: false,
      behindWall: false,
      distance: 9999
    };
    callback(fakeDetection);
  }, 100);
}

// Các hàm bạn phải tự định nghĩa hoặc làm giả
function getFallbackTarget() {
  return lastKnownTarget;
}

function advancedAimVector(origin, target) {
  return {
    x: (origin.x + target.x) / 2,
    y: (origin.y + target.y) / 2
  };
}

function antiMissCompensation(origin, vector) {
  // Giả lập hiệu chỉnh nhỏ
  return {
    x: vector.x + 1,
    y: vector.y + 1
  };
}

function smoothVector(vector) {
  return vector; // Đơn giản không làm gì
}

function adjustForLatency(vector) {
  return vector; // Đơn giản không làm gì
}

function randomizedSwipe(origin, vector) {
  // Ở Shadowrocket không thao tác thực tế, chỉ log
  console.log(`Swipe from (${origin.x},${origin.y}) to (${vector.x},${vector.y})`);
}

function drawOverlay(target, vector) {
  // Không làm gì
}

function logTracking(target, vector) {
  console.log("Tracking target:", target, "aim vector:", vector);
}

function autoFireIfAligned(vector, target) {
  // Không làm gì
}

function smartAutoFire(vector, target) {
  // Không làm gì
}

function recordError(target, vector) {
  // Không làm gì
}

function learnErrorDeviation(target, vector) {
  // Không làm gì
}

function logVectorTraining(vector, target) {
  // Không làm gì
}

function confirmHit(vector, target) {
  // Không làm gì
}

function checkRetrainTrigger(vector, target) {
  // Không làm gì
}

function getAimConfidence(vector, target) {
  return 1.0; // Luôn tự tin 100%
}

function saveTargetSnapshot(target) {
  // Không làm gì
}

function classifyHeadRegion(target) {
  return "head"; // Luôn trả về head
}

// Vòng lặp chính
function smartResilientAimLoop() {
  function step() {
    captureAndroidScreen(() => {
      runHeadDetection((target) => {
        if (!target || typeof target.x !== "number") {
          console.warn("AI failed using fallback.");
          target = getFallbackTarget();
          fallbackCount++;
        } else {
          fallbackCount = 0;
          lastKnownTarget = target;
        }

        let vector = advancedAimVector({ x: CENTER_X, y: CENTER_Y }, target);
        vector = antiMissCompensation({ x: CENTER_X, y: CENTER_Y }, vector);
        vector = smoothVector(vector);
        vector = adjustForLatency(vector);
        randomizedSwipe({ x: CENTER_X, y: CENTER_Y }, vector);
        drawOverlay(target, vector);
        logTracking(target, vector);
        autoFireIfAligned(vector, target);
        smartAutoFire(vector, target);
        recordError(target, vector);
        learnErrorDeviation(target, vector);
        logVectorTraining(vector, target);
        confirmHit(vector, target);
        checkRetrainTrigger(vector, target);

        const confidence = getAimConfidence(vector, target);
        saveTargetSnapshot(target);
        const region = classifyHeadRegion(target);

        if (confidence < 0.5 || manualOverride) return;

        setTimeout(step, 300);
      });
    });
  }
  step();
}
// [DISABLED redundant loop] smartResilientAimLoop\(\)

function continuousHeadCorrection(current, target) {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const force = distance > 50 ? 2.2 : 1.0;
  return {
    x: current.x + dx * force,
    y: current.y + dy * force
  };
}
function continuousHeadAimLoop() {
  function step() {
    captureAndroidScreen(() => {
      runHeadDetection((target) => {
        if (!target || typeof target.x !== "number") {
          console.warn("AI failed  using fallback.");
          target = getFallbackTarget();
        } else {
          fallbackCount = 0;
          lastKnownTarget = target;
        }
        let vector = continuousHeadCorrection({ x: CENTER_X, y: CENTER_Y }, target);
        vector = antiMissCompensation({ x: CENTER_X, y: CENTER_Y }, vector);
        vector = smoothVector(vector);
        vector = adjustForLatency(vector);
        randomizedSwipe({ x: CENTER_X, y: CENTER_Y }, vector);
        drawOverlay(target, vector);
        logTracking(target, vector);
        autoFireIfAligned(vector, target);
        smartAutoFire(vector, target);
        recordError(target, vector);
        learnErrorDeviation(target, vector);
        logVectorTraining(vector, target);
        confirmHit(vector, target);
        checkRetrainTrigger(vector, target);
        const confidence = getAimConfidence(vector, target);
        saveTargetSnapshot(target);
        const region = classifyHeadRegion(target);
        if (confidence < 0.5 || manualOverride) return;
        setTimeout(step, 150); 
      });
    });
  }
  step();
}
// [DISABLED redundant loop] continuousHeadAimLoop\(\)
const logFile = "aim_log.txt";
function logTracking(target, vector) {
  const entry = {
    time: new Date().toISOString(),
    target,
    aimed: vector
  };
  $persistentStore.write(JSON.stringify(data), "trackingData");
  console.clear();
  console.log("=== AIM DASHBOARD ===");
  console.log("Target X:", target.x, " Y:", target.y);
  console.log("Aimed X:", vector.x.toFixed(1), " Y:", vector.y.toFixed(1));
  console.log("Log written.");
}
let lastVector = { x: CENTER_X, y: CENTER_Y };
function smoothVector(newVector, alpha = 0.25) {
  lastVector = {
    x: lastVector.x * (1 - alpha) + newVector.x * alpha,
    y: lastVector.y * (1 - alpha) + newVector.y * alpha
  };
  return lastVector;
}
function drawOverlay(target, aimVec) {
  Jimp.read(SCREENSHOT_FILE).then(img => {
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function (x, y, idx) {
      if (Math.abs(x - Math.round(target.x)) <= 2 && Math.abs(y - Math.round(target.y)) <= 2) {
        this.bitmap.data[idx] = 255;
        this.bitmap.data[idx + 1] = 0;
        this.bitmap.data[idx + 2] = 0;
      }
      if (Math.abs(x - Math.round(aimVec.x)) <= 2 && Math.abs(y - Math.round(aimVec.y)) <= 2) {
        this.bitmap.data[idx] = 0;
        this.bitmap.data[idx + 1] = 255;
        this.bitmap.data[idx + 2] = 0;
      }
    });
    drawLockFeedback(img, target, aimVec);
    img.write("frame_overlay.png", () => {
      console.log("Overlay saved to frame_overlay.png");
    });
  });
}
let aimLockStableCount = 0;
let aimErrorLog = [];
let latencyAverage = 90;
let zoomLevel = 2; 
let trackedTargets = [];
function autoFireIfAligned(vector, target) {
  const dx = Math.abs(vector.x - target.x);
  const dy = Math.abs(vector.y - target.y);
  if (dx < 15 && dy < 15) {
    aimLockStableCount++;
    if (aimLockStableCount > 2) {
      exec("adb shell input tap 1000 1800"); 
      console.log(" Auto Fire Triggered");
      aimLockStableCount = 0;
    }
  } else {
    aimLockStableCount = 0;
  }
}
function learnErrorDeviation(target, vector) {
  const dx = vector.x - target.x;
  const dy = vector.y - target.y;
  aimErrorLog.push({ dx, dy, time: Date.now() });
  if (aimErrorLog.length > 100) aimErrorLog.shift();
}
function getZoomSensitivity() {
  const base = 1.5;
  return zoomLevel === 4 ? base * 1.2 : zoomLevel === 2 ? base : base * 0.9;
}
function selectClosestTarget(candidates) {
  return candidates.reduce((best, t) => {
    const dist = Math.sqrt(t.x * t.x + t.y * t.y);
    return dist < best.dist ? { ...t, dist } : best;
  }, { dist: Infinity });
}
function compensateLatency(vector) {
  const now = Date.now();
  const delay = now - (vector.timestamp || now);
  const drift = delay - latencyAverage;
  if (drift > 50) {
    vector.x += 4;
    vector.y += 4;
  }
  return vector;
}
function swipeRandomized(center, vector) {
  const offsetX = (Math.random() - 0.5) * 4;
  const offsetY = (Math.random() - 0.5) * 4;
  const sx = Math.round(center.x + offsetX);
  const sy = Math.round(center.y + offsetY);
  const ex = Math.round(vector.x + offsetX);
  const ey = Math.round(vector.y + offsetY);
  const dur = 50 + Math.floor(Math.random() * 30);
  const cmd = `adb shell input swipe ${sx} ${sy} ${ex} ${ey} ${dur}`;
  exec(cmd);
  console.log(" Swipe:", cmd);
}
let fireCooldown = 0;
let burstMode = false;
let lastFireTime = 0;
let confirmedHits = [];
let vectorLogs = [];
const FOV_RADIUS = 180;
function predictTarget(target, velocity) {
  return {
    x: target.x + velocity.x * 5,
    y: target.y + velocity.y * 5
  };
}
function triggerBurstFire() {
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      exec("adb shell input tap 1000 1800");
      console.log(" Burst Fire Shot", i + 1);
    }, i * 80);
  }
}
function isWeakHead(target) {
  return target.hasHelmet === false || target.hasHelmet === undefined;
}
function getFireCooldown(vector, target) {
  const dx = Math.abs(vector.x - target.x);
  const dy = Math.abs(vector.y - target.y);
  const error = Math.sqrt(dx * dx + dy * dy);
  return error < 10 ? 200 : 500;
}
function isWithinFOV(target) {
  const dx = target.x - CENTER_X;
  const dy = target.y - CENTER_Y;
  return Math.sqrt(dx * dx + dy * dy) <= FOV_RADIUS;
}
function smartAutoFire(vector, target) {
  const now = Date.now();
  if (!isWithinFOV(target)) return;
  const dx = Math.abs(vector.x - target.x);
  const dy = Math.abs(vector.y - target.y);
  if (dx < 15 && dy < 15) {
    if (now - lastFireTime > fireCooldown) {
      if (burstMode) {
        triggerBurstFire();
      } else {
        exec("adb shell input tap 1000 1800");
        console.log(" Smart Auto Fire");
      }
      lastFireTime = now;
      fireCooldown = getFireCooldown(vector, target);
    }
  }
}
function confirmHit(vector, target) {
  const dx = Math.abs(vector.x - target.x);
  const dy = Math.abs(vector.y - target.y);
  if (dx < 8 && dy < 8) {
    confirmedHits.push({ time: Date.now(), vector });
    console.log(" Hit Confirmed");
  }
}
function calibrateSensitivity(inputDpi, inGameSense) {
  const baseFactor = 1.5;
  const adjusted = baseFactor * (inGameSense / 50) * (inputDpi / 400);
  console.log(" Calibrated Sensitivity:", adjusted.toFixed(2));
  return adjusted;
}
function logVectorTraining(vector, target) {
  const entry = {
    ts: Date.now(),
    vector,
    target
  };
  vectorLogs.push(entry);
  if (vectorLogs.length > 100) vectorLogs.shift();
}
function drawLockFeedback(img, target, vector) {
  const r = 255, g = 255, b = 0;
  for (let t = 0; t <= 1; t += 0.01) {
    const x = Math.round(vector.x + (target.x - vector.x) * t);
    const y = Math.round(vector.y + (target.y - vector.y) * t);
    if (x >= 0 && x < img.bitmap.width && y >= 0 && y < img.bitmap.height) {
      const idx = img.getPixelIndex(x, y);
      img.bitmap.data[idx] = r;
      img.bitmap.data[idx + 1] = g;
      img.bitmap.data[idx + 2] = b;
    }
  }
}
function classifyHeadRegion(target) {
  const regions = ["forehead", "temple", "crown", "neck"];
  const idx = Math.floor(Math.random() * regions.length);
  return regions[idx];
}
function recoverAimToCenter() {
  exec(`adb shell input swipe ${CENTER_X} ${CENTER_Y} ${CENTER_X} ${CENTER_Y} 100`);
  console.log(" Aim Recovered to Center");
}
const controlPositions = {
  fire: { x: 1000, y: 1800 },
  scope: { x: 1200, y: 1600 },
  jump: { x: 900, y: 1900 }
};
let recentTargets = [];
function saveTargetSnapshot(target) {
  recentTargets.push({ ...target, t: Date.now() });
  if (recentTargets.length > 3) recentTargets.shift();
}
function fallbackToRecentTarget() {
  return recentTargets.length > 0 ? recentTargets[recentTargets.length - 1] : { x: CENTER_X, y: CENTER_Y };
}
function queueTargets(candidates) {
  return candidates.sort((a, b) => {
    const scoreA = (a.hasHelmet ? 1 : 0.5) + Math.sqrt(a.x * a.x + a.y * a.y);
    const scoreB = (b.hasHelmet ? 1 : 0.5) + Math.sqrt(b.x * b.x + b.y * b.y);
    return scoreA - scoreB;
  });
}
function logTargetFrame() {
  const timestamp = Date.now();
  const newName = `snapshot_${timestamp}.png`;
  fs.copyFile(SCREENSHOT_FILE, newName, err => {
    if (!err) console.log(" Snapshot Saved:", newName);
  });
}
const AIM_ZONES = {
  head: { radius: 360 },
  neck: { radius: 180 },
  chest: { radius: 90 }
};
let manualOverride = false;
function toggleManualOverride() {
  manualOverride = !manualOverride;
  console.log(" Manual Mode:", manualOverride ? "ON" : "OFF");
}
function getAimConfidence(vector, target) {
  const dx = Math.abs(vector.x - target.x);
  const dy = Math.abs(vector.y - target.y);
  const dist = Math.sqrt(dx * dx + dy * dy);
  const zone = AIM_ZONES.head.radius;
  return dist < zone ? 0.9 : dist < zone * 2 ? 0.7 : 0.4;
}
let errorSeries = 0;
function checkRetrainTrigger(vector, target) {
  const dx = Math.abs(vector.x - target.x);
  const dy = Math.abs(vector.y - target.y);
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > 30) {
    errorSeries++;
    if (errorSeries >= 5) {
      console.warn(" Retrain Triggered: Series error");
      fs.copyFile(SCREENSHOT_FILE, `retrain_frame_${Date.now()}.png`, () => {});
      errorSeries = 0;
    }
  } else {
    errorSeries = 0;
  }
}
const CONFIG_ENHANCED = {
  TRAINING: {
    enabled: true,
    adjustAlpha: 0.15,
    adjustForce: 0.2
  },
  STATS: {
    enabled: true,
    windowSize: 50
  },
  SMOOTH_TRACKING: {
    enabled: true,
    tension: 0.25
  },
  PATTERN_RECOGNITION: {
    enabled: true,
    memoryLimit: 10
  },
  GYRO_SIMULATION: {
    enabled: true,
    driftFactor: 0.4
  },
  HEATMAP: {
    enabled: true,
    resolution: 5
  },
  PIXEL_CORRECTION: {
    enabled: true,
    epsilon: 2.0
  },
  FRAME_RENDER: {
    enabled: true,
    path: "./frames"
  },
  EXECUTION: {
    encrypted: true,
    authKey: "secure-token"
  }
};
let aimStats = [];
function reinforcementAdjust(force, alpha, result) {
  if (!CONFIG_ENHANCED.TRAINING.enabled) return { force, alpha };
  const delta = result.hit ? 0.01 : -0.01;
  return {
    force: force + CONFIG_ENHANCED.TRAINING.adjustForce * delta,
    alpha: alpha + CONFIG_ENHANCED.TRAINING.adjustAlpha * delta
  };
}
function updateStats(hit) {
  if (!CONFIG_ENHANCED.STATS.enabled) return;
  aimStats.push(hit ? 1 : 0);
  if (aimStats.length > CONFIG_ENHANCED.STATS.windowSize) aimStats.shift();
  const avg = aimStats.reduce((a, b) => a + b, 0) / aimStats.length;
  console.log("Accuracy Stats:", (avg * 100).toFixed(1) + "%");
}
function smoothFollow(current, target) {
  if (!CONFIG_ENHANCED.SMOOTH_TRACKING.enabled) return target;
  return {
    x: current.x * (1 - CONFIG_ENHANCED.SMOOTH_TRACKING.tension) + target.x * CONFIG_ENHANCED.SMOOTH_TRACKING.tension,
    y: current.y * (1 - CONFIG_ENHANCED.SMOOTH_TRACKING.tension) + target.y * CONFIG_ENHANCED.SMOOTH_TRACKING.tension
  };
}
let patternMemory = [];
function storeHeadPattern(vector) {
  if (!CONFIG_ENHANCED.PATTERN_RECOGNITION.enabled) return;
  patternMemory.push(vector);
  if (patternMemory.length > CONFIG_ENHANCED.PATTERN_RECOGNITION.memoryLimit) patternMemory.shift();
}
function simulateGyroSwipe(vector) {
  if (!CONFIG_ENHANCED.GYRO_SIMULATION.enabled) return vector;
  return {
    x: vector.x + (Math.random() - 0.5) * CONFIG_ENHANCED.GYRO_SIMULATION.driftFactor,
    y: vector.y + (Math.random() - 0.5) * CONFIG_ENHANCED.GYRO_SIMULATION.driftFactor
  };
}
function addHeatmapLog(vector) {
  if (!CONFIG_ENHANCED.HEATMAP.enabled) return;
  const cellX = Math.floor(vector.x / CONFIG_ENHANCED.HEATMAP.resolution);
  const cellY = Math.floor(vector.y / CONFIG_ENHANCED.HEATMAP.resolution);
  console.log(`Heatmap: (${cellX}, ${cellY})`);
}
function pixelPerfectAdjust(vector, target) {
  if (!CONFIG_ENHANCED.PIXEL_CORRECTION.enabled) return vector;
  const dx = target.x - vector.x;
  const dy = target.y - vector.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < CONFIG_ENHANCED.PIXEL_CORRECTION.epsilon) return vector;
  return {
    x: vector.x + dx * 0.1,
    y: vector.y + dy * 0.1
  };
}
function renderFrameOverlay(img, target, vector) {
  if (!CONFIG_ENHANCED.FRAME_RENDER.enabled) return;
  const ts = Date.now();
  img.write(`${CONFIG_ENHANCED.FRAME_RENDER.path}/overlay_${ts}.png`);
}
function verifyExecutionAuth() {
  if (!CONFIG_ENHANCED.EXECUTION.encrypted) return true;
  const inputKey = "secure-token";
  return inputKey === CONFIG_ENHANCED.EXECUTION.authKey;
}
function classifyMissCause(vector, target) {
  const dx = Math.abs(vector.x - target.x);
  const dy = Math.abs(vector.y - target.y);
  if (dx > 50 || dy > 50) return 'gross_error';
  if (dx > 20) return 'horizontal_drift';
  if (dy > 20) return 'vertical_drift';
  return 'minor';
}
function annotateVectorTrail(logs) {
  logs.forEach((entry, index) => {
    console.log(`Trail ${index}: Aim (${entry.vector.x}, ${entry.vector.y}) vs Target (${entry.target.x}, ${entry.target.y})`);
  });
}
function generateVectorGraph(logs) {
  const data = logs.map(e => ({
    x: e.vector.x,
    y: e.vector.y,
    t: e.ts
  }));
  console.log("Vector Evolution Graph Ready", data.length, "points");
}
function correctVectorLive(vector, target, lastHit) {
  if (!lastHit) {
    const dx = target.x - vector.x;
    const dy = target.y - vector.y;
    return {
      x: vector.x + dx * 0.1,
      y: vector.y + dy * 0.1
    };
  }
  return vector;
}
function tuneAlphaForceByUser(alpha, force, accuracy) {
  if (accuracy < 0.6) {
    alpha += 0.05;
    force += 0.1;
  }
  return { alpha, force };
}
function detectBodyZone(target) {
  const zones = ['eye', 'forehead', 'neck', 'jaw'];
  return zones[Math.floor(Math.random() * zones.length)];
}
function focusShiftToNeck(target) {
  return {
    x: target.x,
    y: target.y + 15
  };
}
let headLockFrames = 0;
function applyStickyLock(vector, target) {
  const dx = Math.abs(vector.x - target.x);
  const dy = Math.abs(vector.y - target.y);
  const isInZone = dx < 10 && dy < 10;
  if (isInZone) headLockFrames++;
  else headLockFrames = 0;
  if (headLockFrames >= 3) {
    vector.x = target.x;
    vector.y = target.y;
  }
  return vector;
}
function applyTimingRandomizer(baseTime) {
  return baseTime + Math.floor(Math.random() * 20 - 10);
}
function randomizeSwipePattern(vector) {
  const offsetX = (Math.random() - 0.5) * 3;
  const offsetY = (Math.random() - 0.5) * 3;
  return {
    x: vector.x + offsetX,
    y: vector.y + offsetY
  };
}
function insertFakeSwipeNoise(center) {
  const fx = center.x + (Math.random() - 0.5) * 40;
  const fy = center.y + (Math.random() - 0.5) * 40;
  const cmd = `adb shell input swipe ${center.x} ${center.y} ${Math.round(fx)} ${Math.round(fy)} 80`;
  exec(cmd);
}




const CHAIN_CONFIG = {
  PRECISION_LEARNING: {
    enable: true,
    correctionStrength: 0.12,
    confidenceDropRate: 0.15
  },
  TARGET_PRIORITY: {
    helmetWeight: 1.2,
    dangerWeight: 2.0,
    zonePenalty: 1.5
  },
  STEALTH_CLOAK: {
    enable: true,
    fakeInputCount: 3,
    jitterRange: 1.0
  },
  VECTOR_STABILIZER: {
    enable: true,
    maxPixelPerFrame: 12,
    inertiaNearTarget: 0.2,
    averageWindow: 3
  },
  SEMI_AUTO_SUPPORT: {
    enable: true,
    hapticOn: true,
    pauseOnObstruction: true
  }
}

let vectorHistory = []
function liveErrorTracker(vector, target) {
  if (!CHAIN_CONFIG.PRECISION_LEARNING.enable) return
  const dx = vector.x - target.x
  const dy = vector.y - target.y
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
    vector.x -= dx * CHAIN_CONFIG.PRECISION_LEARNING.correctionStrength
    vector.y -= dy * CHAIN_CONFIG.PRECISION_LEARNING.correctionStrength
  }
}

function feedbackBasedAdjust(confidence) {
  if (confidence < 0.6) return 1 - CHAIN_CONFIG.PRECISION_LEARNING.confidenceDropRate
  return 1
}

function vectorRateLimiter(vector, lastVector) {
  if (!CHAIN_CONFIG.VECTOR_STABILIZER.enable) return vector
  const dx = vector.x - lastVector.x
  const dy = vector.y - lastVector.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const maxMove = CHAIN_CONFIG.VECTOR_STABILIZER.maxPixelPerFrame
  if (dist > maxMove) {
    const scale = maxMove / dist
    vector.x = lastVector.x + dx * scale
    vector.y = lastVector.y + dy * scale
  }
  return vector
}

function historicalAverageVector(vector) {
  vectorHistory.push(vector)
  if (vectorHistory.length > CHAIN_CONFIG.VECTOR_STABILIZER.averageWindow)
    vectorHistory.shift()
  const sum = vectorHistory.reduce((acc, v) => ({
    x: acc.x + v.x,
    y: acc.y + v.y
  }), { x: 0, y: 0 })
  const n = vectorHistory.length
  return { x: sum.x / n, y: sum.y / n }
}

function adaptiveInertiaHandler(vector, target) {
  const dx = target.x - vector.x
  const dy = target.y - vector.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const threshold = 30
  if (dist < threshold) {
    vector.x += dx * CHAIN_CONFIG.VECTOR_STABILIZER.inertiaNearTarget
    vector.y += dy * CHAIN_CONFIG.VECTOR_STABILIZER.inertiaNearTarget
  }
  return vector
}

function targetDangerScore(t) {
  return (t.hasHelmet ? CHAIN_CONFIG.TARGET_PRIORITY.helmetWeight : 0.5) +
    (t.isAimingAtYou ? CHAIN_CONFIG.TARGET_PRIORITY.dangerWeight : 1) +
    (t.isInCover ? CHAIN_CONFIG.TARGET_PRIORITY.zonePenalty : 0)
}

function decoyInputGenerator(center) {
  for (let i = 0; i < CHAIN_CONFIG.STEALTH_CLOAK.fakeInputCount; i++) {
    const offsetX = (Math.random() - 0.5) * 100
    const offsetY = (Math.random() - 0.5) * 100
    const x = center.x + offsetX
    const y = center.y + offsetY
    const cmd = `adb shell input swipe ${center.x} ${center.y} ${Math.round(x)} ${Math.round(y)} 70`
    exec(cmd)
  }
}

function systemJitterRandomizer(vector) {
  if (!CHAIN_CONFIG.STEALTH_CLOAK.enable) return vector
  const randX = (Math.random() - 0.5) * CHAIN_CONFIG.STEALTH_CLOAK.jitterRange
  const randY = (Math.random() - 0.5) * CHAIN_CONFIG.STEALTH_CLOAK.jitterRange
  return {
    x: vector.x + randX,
    y: vector.y + randY
  }
}

function manualRetargetSwitch() {
  if (!CHAIN_CONFIG.SEMI_AUTO_SUPPORT.enable) return
  console.log("Manual target switch triggered")
}

function hapticFeedbackVibration() {
  if (!CHAIN_CONFIG.SEMI_AUTO_SUPPORT.hapticOn) return
  exec("adb shell input vibrate 150")
}

function pauseIfObstructed(obstructed) {
  if (!CHAIN_CONFIG.SEMI_AUTO_SUPPORT.pauseOnObstruction) return false
  return obstructed
}




function ensurePersistentLoop(coreFunction, interval = 300) {
  function wrapper() {
    try {
      coreFunction();
    } catch (e) {
      if (typeof $notify === "function") {
        $notify("Loop Error", "", String(e)); // ✅ hiển thị lỗi
      }
      // Hoặc có thể chỉ im lặng bỏ qua
    } finally {
      setTimeout(wrapper, interval);
    }
  }
  wrapper();
}

function mainAimingRoutine() {
  if (pauseIfObstructed(false)) return
  captureAndroidScreen(() => {
    runHeadDetection((target) => {
      let vector = { x: CENTER_X, y: CENTER_Y }
      vector = smoothVector(vector)
      vector = adjustForLatency(vector)
      vector = systemJitterRandomizer(vector)
      vector = pixelPerfectAdjust(vector, target)
      vector = adaptiveInertiaHandler(vector, target)
      vector = vectorRateLimiter(vector, vector)
      vector = historicalAverageVector(vector)
      vector = applyStickyLock(vector, target)
      vector = correctVectorLive(vector, target, false)
      vector = refineTrajectory(vector, target)
      vector = adjustIfChinLock(vector, target)
      vector = applyJumpPull(vector, target)
      vector = applyDirectionalJumpPull(vector, target)
      vector = applySelfJumpAimBoost(vector, "jump")
      vector = correctJumpLowHeadAim(vector, target)
      analyzeJumpHeadshot(vector, target)
      updateLockTracking(vector, target)
      liveErrorTracker(vector, target)
      randomizedSwipe({ x: CENTER_X, y: CENTER_Y }, vector)
      logTracking(target, vector)
      autoFireIfAligned(vector, target)
      smartAutoFire(vector, target)
      recordError(target, vector)
      learnErrorDeviation(target, vector)
      logVectorTraining(vector, target)
      confirmHit(vector, target)
      saveTargetSnapshot(target)
      updateStats(true)
      const zone = detectBodyZone(target)
      const confidence = getAimConfidence(vector, target)
      const scaled = feedbackBasedAdjust(confidence)
      hapticFeedbackVibration()
      insertFakeSwipeNoise({ x: CENTER_X, y: CENTER_Y })
    })
  })
}

verifyExecutionAuth() && ensurePersistentLoop(applyFpsDropFix(mainAimingRoutine, 300), 300)




const TRAJECTORY_CONFIG = {
  enabled: true,
  maxDeviation: 0.5,         // Cực thấp → lệch nhẹ là chỉnh ngay
  tightenRadius: 0.15,       // Siêu nhỏ → chỉ bó về đầu
  straightThreshold: 1       // Lệch rất nhẹ sẽ bị kéo thẳng lại
}

function refineTrajectory(vector, target) {
  if (!TRAJECTORY_CONFIG.enabled) return vector
  const dx = target.x - vector.x
  const dy = target.y - vector.y
  const distance = Math.sqrt(dx * dx + dy * dy)

  if (distance < TRAJECTORY_CONFIG.straightThreshold) {
    // Tighten grouping
    const angle = Math.atan2(dy, dx)
    return {
      x: vector.x + Math.cos(angle) * TRAJECTORY_CONFIG.tightenRadius,
      y: vector.y + Math.sin(angle) * TRAJECTORY_CONFIG.tightenRadius
    }
  }

  // Clamp deviation if too wide
  if (Math.abs(dx) > TRAJECTORY_CONFIG.maxDeviation) vector.x += dx * 0.1
  if (Math.abs(dy) > TRAJECTORY_CONFIG.maxDeviation) vector.y += dy * 0.1

  return vector
}




const AIM_ADJUSTMENT_CONFIG = {
  enableChinLift: true,      // Bật tự động nâng tầm ngắm lên để tránh cằm
  chinZoneHeight: 30,        // Vùng tính từ cằm trở lên (px hoặc đơn vị tính trong viewport)
  liftAmount: 8,             // Độ nâng tiêu chuẩn (tính bằng đơn vị Y screen hoặc Vector3)
  mediumRange: {
    enable: true,            // Có bật nâng thêm nếu mục tiêu ở tầm trung
    start: 200,              // Khoảng cách bắt đầu nâng thêm
    end: 450,                // Khoảng cách kết thúc nâng thêm
    liftExtra: 5            // Nâng thêm bao nhiêu đơn vị tại tầm trung
  }
}

function adjustIfChinLock(vector, target) {
  if (!AIM_ADJUSTMENT_CONFIG.enableChinLift) return vector
  const verticalOffset = target.y - vector.y
  const dx = target.x - vector.x
  const dy = verticalOffset

  const distance = Math.sqrt(dx * dx + dy * dy)
  const isChinZone = verticalOffset > 0 && verticalOffset < AIM_ADJUSTMENT_CONFIG.chinZoneHeight
  const isMedium = distance >= AIM_ADJUSTMENT_CONFIG.mediumRange.start && distance <= AIM_ADJUSTMENT_CONFIG.mediumRange.end

  if (isChinZone) {
    vector.y -= AIM_ADJUSTMENT_CONFIG.liftAmount
    if (isMedium && AIM_ADJUSTMENT_CONFIG.mediumRange.enable) {
      vector.y -= AIM_ADJUSTMENT_CONFIG.mediumRange.liftExtra
    }
  }
  return vector
}




const JUMP_PULL_CONFIG = {
  enable: true,
  airStateBoost: 1.4,
  verticalBias: -6
}

function applyJumpPull(vector, target) {
  if (!JUMP_PULL_CONFIG.enable) return vector
  if (target.isJumping || target.isAirborne || target.state === 'air') {
    vector.x += (target.x - vector.x) * (JUMP_PULL_CONFIG.airStateBoost - 1)
    vector.y += (target.y - vector.y) * (JUMP_PULL_CONFIG.airStateBoost - 1)
    vector.y += JUMP_PULL_CONFIG.verticalBias
  }
  return vector
}




const EXTENDED_JUMP_CONFIG = {
  enableDirectionalPull: true,        // Kéo hướng aim theo hướng nhảy của enemy
  directionalBoost: 1.2,              // Hệ số kéo (nhẹ)
  directionalAngleOffset: 10,         // Độ lệch theo hướng nhảy (độ)
  enableSelfJumpAimBoost: true,       // Bật boost khi bản thân nhảy
  selfJumpBoost: 1.3,                 // Tăng tốc độ lock khi nhảy
  selfVerticalLift: -4                // Điều chỉnh tầm ngắm lên khi nhảy (âm = kéo xuống)
}


function applyDirectionalJumpPull(vector, target) {
  if (!EXTENDED_JUMP_CONFIG.enableDirectionalPull) return vector
  if (target.state === 'air' && target.direction) {
    const angle = Math.atan2(target.direction.y, target.direction.x)
    const adjustedX = Math.cos(angle) * EXTENDED_JUMP_CONFIG.directionalBoost
    const adjustedY = Math.sin(angle) * EXTENDED_JUMP_CONFIG.directionalBoost
    vector.x += adjustedX
    vector.y += adjustedY
  }
  return vector
}

function applySelfJumpAimBoost(vector, playerState) {
  if (!EXTENDED_JUMP_CONFIG.enableSelfJumpAimBoost) return vector
  if (playerState === 'jump') {
    vector.y += EXTENDED_JUMP_CONFIG.selfVerticalLift
    vector.x *= EXTENDED_JUMP_CONFIG.selfJumpBoost
    vector.y *= EXTENDED_JUMP_CONFIG.selfJumpBoost
  }
  return vector
}




const JUMP_CORRECTION_CONFIG = {
  enable: true,
  downwardPullWhenJumping: 6,
  headHeightZone: 25
}

function correctJumpLowHeadAim(vector, target) {
  if (!JUMP_CORRECTION_CONFIG.enable) return vector
  const dy = target.y - vector.y
  const isJumping = target.state === 'air'
  const isMissingHead = dy < -JUMP_CORRECTION_CONFIG.headHeightZone

  if (isJumping && isMissingHead) {
    vector.y += JUMP_CORRECTION_CONFIG.downwardPullWhenJumping
  }

  return vector
}




const ADVANCED_ANALYSIS_CONFIG = {
  headshotJumpAnalysis: true,
  lockTrackThreshold: 5,
  lockSustainTime: 200,
  fpsOptimization: true,
  sleepAdjust: 5,
  lagDropThreshold: 25
}

let headshotJumpLog = []
function analyzeJumpHeadshot(vector, target) {
  if (!ADVANCED_ANALYSIS_CONFIG.headshotJumpAnalysis) return
  const isJumping = target.state === 'air'
  const dx = vector.x - target.x
  const dy = vector.y - target.y
  const isCloseToHead = Math.abs(dx) < 10 && Math.abs(dy) < 10
  if (isJumping && isCloseToHead) {
    headshotJumpLog.push({ t: Date.now(), dx, dy })
  }
  if (headshotJumpLog.length > 100) headshotJumpLog.shift()
}

let lockStreak = 0
let lastLockTime = 0
function updateLockTracking(vector, target) {
  const dx = Math.abs(vector.x - target.x)
  const dy = Math.abs(vector.y - target.y)
  if (dx < 12 && dy < 12) {
    lockStreak++
    lastLockTime = Date.now()
  } else {
    if (Date.now() - lastLockTime > ADVANCED_ANALYSIS_CONFIG.lockSustainTime) {
      lockStreak = 0
    }
  }
  if (lockStreak >= ADVANCED_ANALYSIS_CONFIG.lockTrackThreshold) {
    console.log("LOCKHEAD confirmed")
  }
}

function applyFpsDropFix(loopFunc, interval) {
  let lastTime = Date.now()
  return () => {
    const now = Date.now()
    const delta = now - lastTime
    if (delta < interval - ADVANCED_ANALYSIS_CONFIG.lagDropThreshold) {
      setTimeout(() => loopFunc(), interval + ADVANCED_ANALYSIS_CONFIG.sleepAdjust)
    } else {
      loopFunc()
    }
    lastTime = Date.now()
  }
}
const ADV_LOCK_CONFIG = {
  helmetAware: true,
  zoneCurve: true,
  heightAware: true,
  multiPointPrediction: true,
  jitterMatch: true,
  deadzoneComp: true,
  confidenceTaper: true,
  tactileSim: true,
  latentDrag: true,
  fatigueAware: true,
  defaultConfidence: 0.95
}

function helmetPenetrationAdjust(target, hasHelmet) {
  if (!ADV_LOCK_CONFIG.helmetAware || !hasHelmet) return 0
  return 4 
}

function applyZoneLockCurve(dy) {
  if (!ADV_LOCK_CONFIG.zoneCurve) return dy
  if (dy < -30) return dy * 0.9 
  if (dy < 0) return dy * 0.8
  if (dy < 20) return dy * 1.2 
  return dy * 1.4 
}

function heightBasedAdjustment(camHeight, targetHeight) {
  if (!ADV_LOCK_CONFIG.heightAware) return 0
  const delta = camHeight - targetHeight
  return delta > 0 ? -2 : 2
}

function multiPointPrediction(target) {
  if (!ADV_LOCK_CONFIG.multiPointPrediction) return target
  return {
    x: target.x + (target.vx || 0) * 1.2,
    y: target.y + (target.vy || 0) * 1.1
  }
}

function jitterCompensate(history) {
  if (!ADV_LOCK_CONFIG.jitterMatch || history.length < 3) return { x: 0, y: 0 }
  const [p1, p2, p3] = history.slice(-3)
  const dx = (p3.x - p2.x) - (p2.x - p1.x)
  const dy = (p3.y - p2.y) - (p2.y - p1.y)
  return { x: dx * 0.4, y: dy * 0.4 }
}

function correctDeadzone(target, center, radius = 18) {
  if (!ADV_LOCK_CONFIG.deadzoneComp) return { x: 0, y: 0 }
  const dx = target.x - center.x
  const dy = target.y - center.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < radius) {
    return { x: dx * 0.4, y: dy * 0.4 }
  }
  return { x: 0, y: 0 }
}

function taperByConfidence(vector, confidence) {
  if (!ADV_LOCK_CONFIG.confidenceTaper || confidence > ADV_LOCK_CONFIG.defaultConfidence) return vector
  const factor = Math.max(0.4, confidence / ADV_LOCK_CONFIG.defaultConfidence)
  return {
    x: vector.x * factor,
    y: vector.y * factor
  }
}

function simulateTactileCurve(inputVec) {
  if (!ADV_LOCK_CONFIG.tactileSim) return inputVec
  return {
    x: Math.sign(inputVec.x) * Math.pow(Math.abs(inputVec.x), 0.9),
    y: Math.sign(inputVec.y) * Math.pow(Math.abs(inputVec.y), 0.9)
  }
}

function applyLatentDrag(framesHeld) {
  if (!ADV_LOCK_CONFIG.latentDrag) return 1
  return framesHeld < 5 ? 0.75 : framesHeld < 12 ? 1.0 : 1.2
}

function adjustForFatigue(elapsed, baseline = 60000) {
  if (!ADV_LOCK_CONFIG.fatigueAware) return 0
  const fatigueFactor = Math.min(1, elapsed / baseline)
  return -4 * fatigueFactor
}

const HEADSHOT_OPTIMIZER = {
  microHeadBias: true,
  aimReinforce: true,
  dynamicHardLock: true,
  armorAvoid: true,
  foreheadVector: true,
  softPullTrack: true,
  reactiveOffset: true,
  recenterAuto: true,
  decayOverTime: true,
  taperByHold: true,
  eyeLineTarget: true,
  poseAware: true,
  headStreak: true,
  noTouchWindow: true,
  horizontalAssist: true
}

let headStreakCounter = 0

function applyMicroHeadBias(vector, target) {
  if (!HEADSHOT_OPTIMIZER.microHeadBias) return vector
  return { x: vector.x, y: vector.y - 3 }
}

function reinforceAimAfterMiss(lastHit, vector) {
  if (!HEADSHOT_OPTIMIZER.aimReinforce || lastHit) return vector
  return { x: vector.x * 0.95, y: vector.y * 0.95 }
}

function dynamicHardLockZone(speed) {
  if (!HEADSHOT_OPTIMIZER.dynamicHardLock) return 22
  if (speed > 4) return 28
  if (speed > 2) return 24
  return 20
}

function avoidArmorZone(target, armor) {
  if (!HEADSHOT_OPTIMIZER.armorAvoid || !armor) return 0
  return 6 
}

function getForeheadVector(target) {
  if (!HEADSHOT_OPTIMIZER.foreheadVector) return target
  return { x: target.x, y: target.y - 20 }
}

function trackSoftPull(vector, target) {
  if (!HEADSHOT_OPTIMIZER.softPullTrack) return vector
  return {
    x: vector.x + (target.x - vector.x) * 0.6,
    y: vector.y + (target.y - vector.y) * 0.6
  }
}

function adjustReactiveOffset(viewAngle, targetAngle) {
  if (!HEADSHOT_OPTIMIZER.reactiveOffset) return 0
  const diff = viewAngle - targetAngle
  return diff > 0 ? -4 : 4
}

function rebalanceToCenter(vector, target, timeHeld) {
  if (!HEADSHOT_OPTIMIZER.recenterAuto || timeHeld < 300) return vector
  return {
    x: vector.x + (target.x - vector.x) * 0.2,
    y: vector.y + (target.y - vector.y) * 0.2
  }
}

function decayAimLock(force, lockDuration) {
  if (!HEADSHOT_OPTIMIZER.decayOverTime) return force
  const decay = Math.max(0.6, 1 - lockDuration / 1000)
  return force * decay
}

function taperVectorByHold(vector, holdFrames) {
  if (!HEADSHOT_OPTIMIZER.taperByHold) return vector
  const taper = holdFrames < 10 ? 1 : holdFrames < 30 ? 0.9 : 0.75
  return { x: vector.x * taper, y: vector.y * taper }
}

function eyeLineVector(target) {
  if (!HEADSHOT_OPTIMIZER.eyeLineTarget) return target
  return { x: target.x, y: target.y - 14 }
}

function poseAwareAdjustment(pose) {
  if (!HEADSHOT_OPTIMIZER.poseAware) return 0
  if (pose === "crouch") return -6
  if (pose === "jump") return 4
  return 0
}

function applyHeadStreakBoost(vector) {
  if (!HEADSHOT_OPTIMIZER.headStreak || headStreakCounter < 3) return vector
  return { x: vector.x, y: vector.y - 6 }
}

function simulateNoTouchShift(vector, target, deadZone = 16) {
  if (!HEADSHOT_OPTIMIZER.noTouchWindow) return vector
  const dx = Math.abs(vector.x - target.x)
  const dy = Math.abs(vector.y - target.y)
  if (dx < deadZone && dy < deadZone) {
    return { x: target.x, y: target.y - 12 }
  }
  return vector
}

function assistHorizontalMagnetism(vector, target) {
  if (!HEADSHOT_OPTIMIZER.horizontalAssist) return vector
  return {
    x: vector.x + (target.x - vector.x) * 0.2,
    y: vector.y
  }
}
let HEADSHOT_LOG = []

function advancedHeadshotTracking(current, target, options = {}) {
  let vector = { ...current }
  let holdFrames = options.holdFrames || 0
  let lockDuration = options.lockDuration || 0
  let confidence = options.confidence || 0.98
  let viewAngle = options.viewAngle || 0
  let targetAngle = options.targetAngle || 0
  let hasHelmet = options.hasHelmet || false
  let armor = options.armor || false
  let pose = options.pose || "stand"
  let drift = options.drift || { x: 0, y: 0 }
  let currentTime = Date.now()

  if (!cooldownLimiter(currentTime)) return current

  const originalTarget = { ...target }

  target = multiPointPrediction(target)
  const jitter = jitterCompensate(options.history || [])
  const dzComp = correctDeadzone(target, current)
  const angleAdjust = correctAimAngle(current, target, viewAngle)
  const offsetAdjust = adjustReactiveOffset(viewAngle, targetAngle)
  const fatigueAdjust = adjustForFatigue(options.elapsed || 0)

  vector = trackSoftPull(vector, target)
  vector = applyMicroHeadBias(vector, target)
  vector = assistHorizontalMagnetism(vector, target)
  vector = taperVectorByHold(vector, holdFrames)
  vector = reinforceAimAfterMiss(options.lastHit, vector)
  vector = simulateTactileCurve(vector)
  vector = simulateNoTouchShift(vector, target)
  vector = applyHeadStreakBoost(vector, headStreakCounter)
  vector = avoidNeckZone(vector, target)
  vector = xAxisBiasAssist(vector, target)
  vector = applyXPullBoost(vector, target)
  vector = applyStreakMemory(vector, options.lastHeadVector)

  vector.y += helmetPenetrationAdjust(target, hasHelmet)
  vector.y += heightBasedAdjustment(options.cameraHeight || 0, options.targetHeight || 0)
  vector.y += poseAwareAdjustment(pose)
  vector.y += offsetAdjust
  vector.y += fatigueAdjust
  vector.y += angleAdjust

  const forceScaled = scaleByDrift(force, drift)
  const effectiveForce = decayAimLock(forceScaled, lockDuration)

  vector.x = current.x + (vector.x - current.x) * effectiveForce
  vector.y = current.y + (vector.y - current.y) * effectiveForce

  const dx = vector.x - originalTarget.x
  const dy = vector.y - originalTarget.y
  const distance = Math.sqrt(dx * dx + dy * dy)

  HEADSHOT_LOG.push({
    frame: currentTime,
    dx: dx.toFixed(2),
    dy: dy.toFixed(2),
    distance: distance.toFixed(2),
    confidence: confidence,
    streak: headStreakCounter,
    driftMag: Math.sqrt(drift.x ** 2 + drift.y ** 2).toFixed(2),
    xPull: dx.toFixed(2),
    hardBoost: headStreakCounter >= 2,
    xitated: Math.abs(dx) > 6
  })

  lastLockFrame = currentTime
  lastLockVector = vector
  return vector
}

const LOCK_ENHANCE = {
  angleCorrection: true,
  frameCorrection: true,
  lockCooldown: true,
  crossConfirm: true,
  driftScaling: true,
  neckAvoid: true,
  jitterBuffer: true,
  streakBoost: true,
  streakDecay: true,
  streakMemory: true,
  xPullBoost: true,
  xBiasAssist: true
}

let lastLockFrame = 0
let lastLockVector = { x: 0, y: 0 }

function correctAimAngle(current, target, viewAngle) {
  if (!LOCK_ENHANCE.angleCorrection) return 0
  const dx = target.x - current.x
  const angleDiff = Math.abs(Math.atan2(dx, 1) * 180 / Math.PI - viewAngle)
  return angleDiff > 30 ? -3 : 0
}

function frameCorrectionApply(current, previousVector) {
  if (!LOCK_ENHANCE.frameCorrection) return current
  return {
    x: (current.x + previousVector.x) / 2,
    y: (current.y + previousVector.y) / 2
  }
}

function cooldownLimiter(currentTime, cooldown = 80) {
  if (!LOCK_ENHANCE.lockCooldown) return true
  const delta = currentTime - lastLockFrame
  return delta > cooldown
}

function confirmByCrossColor(crossColor) {
  return !LOCK_ENHANCE.crossConfirm || crossColor === "red"
}

function scaleByDrift(force, drift) {
  if (!LOCK_ENHANCE.driftScaling) return force
  const driftMag = Math.sqrt(drift.x * drift.x + drift.y * drift.y)
  const scale = Math.min(1 + driftMag / 24, 1.3)
  return force * scale
}

function avoidNeckZone(vector, target) {
  if (!LOCK_ENHANCE.neckAvoid) return vector
  if (vector.y > target.y) {
    vector.y -= 6
  }
  return vector
}

function jitterDampen(history) {
  if (!LOCK_ENHANCE.jitterBuffer || history.length < 4) return { x: 0, y: 0 }
  const deltas = history.slice(-3).map((p, i, a) => a[i+1] ? { dx: a[i+1].x - p.x, dy: a[i+1].y - p.y } : { dx: 0, dy: 0 })
  const avgDx = deltas.map(d => d.dx).reduce((a, b) => a + b, 0) / deltas.length
  const avgDy = deltas.map(d => d.dy).reduce((a, b) => a + b, 0) / deltas.length
  return { x: -avgDx * 0.3, y: -avgDy * 0.3 }
}

function applyHeadStreakBoost(vector, streak) {
  if (!LOCK_ENHANCE.streakBoost || streak < 2) return vector
  return { x: vector.x, y: vector.y - Math.min(streak * 2, 8) }
}

function decayStreak(streak, hit) {
  if (!LOCK_ENHANCE.streakDecay) return streak
  return hit ? streak + 1 : Math.max(0, streak - 1)
}

function applyStreakMemory(vector, streakVec) {
  if (!LOCK_ENHANCE.streakMemory || !streakVec) return vector
  return {
    x: (vector.x + streakVec.x) / 2,
    y: (vector.y + streakVec.y) / 2
  }
}

function applyXPullBoost(vector, target) {
  if (!LOCK_ENHANCE.xPullBoost) return vector
  const dx = target.x - vector.x
  return { x: vector.x + dx * 0.35, y: vector.y }
}

function xAxisBiasAssist(vector, target) {
  if (!LOCK_ENHANCE.xBiasAssist) return vector
  const diff = target.x - vector.x
  return Math.abs(diff) < 10 ? { x: vector.x + diff * 0.2, y: vector.y } : vector
}

// === Vector3 Class ===
class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x; this.y = y; this.z = z;
  }

  add(v) {
    return new Vector3(this.x + v.x, this.y + v.y, this.z + v.z);
  }

  subtract(v) {
    return new Vector3(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  multiplyScalar(s) {
    return new Vector3(this.x * s, this.y * s, this.z * s);
  }

  clone() {
    return new Vector3(this.x, this.y, this.z);
  }

  normalize() {
    const length = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    return length === 0 ? new Vector3(0, 0, 0) : new Vector3(this.x / length, this.y / length, this.z / length);
  }

  distanceTo(v) {
    const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}

// === Quaternion Class === (chỉ để giữ dữ liệu, không tính toán xoay trong đoạn này)
class Quaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }
}

// === boneHead thực ===
const boneHead = {
  position: new Vector3(-0.0456970781, -0.004478302, -0.0200432576),
  rotation: new Quaternion(0.0258174837, -0.08611039, -0.1402113, 0.9860321),
  scale: new Vector3(0.99999994, 1.00000012, 1.0)
};

// === Tính toán vị trí head offset (cao hơn một chút để trúng chính xác đỉnh đầu) ===
const headOffset = new Vector3(0, boneHead.scale.y * 0.1, 0);
const adjustedHeadPosition = boneHead.position.add(headOffset);

// === Lock đến vị trí đầu đã được điều chỉnh ===
if (typeof aimLockSystem !== 'undefined' && aimLockSystem.lockToTarget) {
  aimLockSystem.lockToTarget(adjustedHeadPosition);
}
