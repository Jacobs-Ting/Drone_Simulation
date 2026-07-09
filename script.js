const d3 = window.d3;
const DIAGNOSTIC_LOG_ENABLED = false;
const targetAntennaInputs = document.querySelectorAll('input[name="targetAntenna"]');
const slider = document.querySelector("#pitchSlider");
const sliderValue = document.querySelector("#sliderValue");
const distanceInput = document.querySelector("#distanceInput");
const uavHeightInput = document.querySelector("#uavHeightInput");
const gsHeightInput = document.querySelector("#gsHeightInput");
const multipathModelInput = document.querySelector("#multipathModelInput");
const windSpeedInput = document.querySelector("#windSpeedInput");
const windDirectionInput = document.querySelector("#windDirectionInput");
const windSpeedOutput = document.querySelector("#windSpeedOutput");
const windDirectionOutput = document.querySelector("#windDirectionOutput");
const gustInput = document.querySelector("#gustInput");
const interfererEnabledInput = document.querySelector("#interfererEnabledInput");
const interfererDistanceInput = document.querySelector("#interfererDistanceInput");
const interfererPowerInput = document.querySelector("#interfererPowerInput");
const interfererUavDistanceOutput = document.querySelector("#interfererUavDistanceOutput");
const frequencyInput = document.querySelector("#frequencyInput");
const linkDirectionInputs = document.querySelectorAll('input[name="linkDirection"]');
const gcsTxPowerInput = document.querySelector("#gcsTxPowerInput");
const gcsAntennaGainInput = document.querySelector("#gcsAntennaGainInput");
const gcsNoiseFigureInput = document.querySelector("#gcsNoiseFigureInput");
const gcsBandwidthInput = document.querySelector("#gcsBandwidthInput");
const gcsSnrInput = document.querySelector("#gcsSnrInput");
const uavTxPowerInput = document.querySelector("#uavTxPowerInput");
const uavAntennaGainInput = document.querySelector("#uavAntennaGainInput");
const uavNoiseFigureInput = document.querySelector("#uavNoiseFigureInput");
const uavBandwidthInput = document.querySelector("#uavBandwidthInput");
const uavSnrInput = document.querySelector("#uavSnrInput");
const currentPitch = document.querySelector("#currentPitch");
const currentTheta = document.querySelector("#currentTheta");
const currentLoss = document.querySelector("#currentLoss");
const currentFspl = document.querySelector("#currentFspl");
const currentTotalLoss = document.querySelector("#currentTotalLoss");
const currentRxLevel = document.querySelector("#currentRxLevel");
const currentRequiredSignal = document.querySelector("#currentRequiredSignal");
const currentLinkMargin = document.querySelector("#currentLinkMargin");
const currentLinkState = document.querySelector("#currentLinkState");
const linkStateCard = document.querySelector("#linkStateCard");
const debugLog = document.querySelector("#debugLog");
const debugStatus = document.querySelector("#debugStatus");
const chartSubtitle = document.querySelector("#chartSubtitle");
const chartModeButtons = document.querySelectorAll("[data-chart-mode]");
const videoMonitorView = document.querySelector("#video-monitor-view");
const c2TelemetryView = document.querySelector("#c2-telemetry-view");
const videoFeedCanvas = document.querySelector("#videoFeedCanvas");
const videoLinkStatus = document.querySelector("#videoLinkStatus");
const videoSnrValue = document.querySelector("#videoSnrValue");
const videoRxValue = document.querySelector("#videoRxValue");
const c2UplinkStatus = document.querySelector("#c2UplinkStatus");
const c2PdrValue = document.querySelector("#c2PdrValue");
const c2PdrBar = document.querySelector("#c2PdrBar");
const c2PdrProgress = document.querySelector(".c2-progress");
const c2SnrValue = document.querySelector("#c2SnrValue");
const c2MarginValue = document.querySelector("#c2MarginValue");
const c2RxValue = document.querySelector("#c2RxValue");
const exportCsvButton = document.querySelector("#exportCsvButton");
const spreadSpectrumInput = document.querySelector("#spreadSpectrumInput, #spreadSpectrumEnabledInput, #spreadSpectrumToggle");
const dataRateInput = document.querySelector("#dataRateInput, #dataRateSlider, #dataRateKbpsInput");
const dataRateOutput = document.querySelector("#dataRateOutput");
const processingGainOutput = document.querySelector("#processingGainOutput, #spreadGainOutput, #gpOutput");

const SPEED_OF_LIGHT = 3e8;
const TIME_SERIES_WINDOW_MS = 10000;
const VIDEO_RATE_LIMITS_KBPS = {
  excellent: 8000,
  fair: 3000,
  poor: 1000
};
const GUST_JITTER_AMPLITUDES = {
  none: 0,
  light: 2,
  severe: 8
};

const ANTENNA_TARGETS = {
  tail: {
    name: "機尾 433MHz 天線",
    frequencyMHz: 433,
    localDirection: normalizeVector({ x: 0, y: 1, z: 0 })
  },
  leg: {
    name: "腳架 2.4/5GHz 天線",
    frequencyMHz: 2400,
    localDirection: normalizeVector({ x: -0.18, y: 0.92, z: 0.34 })
  }
};

let selectedAntennaTarget = "tail";
let activeChartMode = "pitch";
let videoFeed;

const AMC_OSD_CONFIG = {
  excellent: {
    link: "LINK: EXCELLENT | 1080P | 20MHz",
    phy: "PHY: MCS 7 | 64-QAM | CR: 3/4",
    color: "#00ff00"
  },
  fair: {
    link: "LINK: FAIR | 720P | 10MHz",
    phy: "PHY: MCS 4 | 16-QAM | CR: 1/2",
    color: "#ffff00"
  },
  poor: {
    link: "LINK: POOR | 480P | 5MHz",
    phy: "PHY: MCS 1 | QPSK | CR: 1/3",
    color: "#ff8800"
  },
  telemetry: {
    link: "LINK: SECURED | DATA ONLY | LOW RATE",
    phy: "PHY: DSSS | TELEMETRY | VIDEO DISABLED",
    color: "#35d7ff"
  },
  lost: {
    link: "CRITICAL: NO SIGNAL",
    phy: "SYNC LOST",
    color: "#ff0000"
  }
};

function isSpreadSpectrumEnabled() {
  if (!spreadSpectrumInput) return false;
  if (spreadSpectrumInput.type === "checkbox" || spreadSpectrumInput.type === "radio") {
    return Boolean(spreadSpectrumInput.checked);
  }
  return ["true", "on", "enabled", "1", "yes"].includes(String(spreadSpectrumInput.value).toLowerCase());
}

function getSpreadSpectrumDataRateKbps() {
  if (!dataRateInput) return Infinity;
  const rawValue = Number(dataRateInput.value);
  if (!Number.isFinite(rawValue) || rawValue <= 0) return Infinity;
  const unit = (dataRateInput.dataset.unit || dataRateInput.dataset.rateUnit || "kbps").toLowerCase();
  return unit === "mbps" ? rawValue * 1000 : rawValue;
}

function getProcessingGainDb(dataRateKbps, spreadBandwidthMHz = 0) {
  const spreadBandwidthHz = Math.max(spreadBandwidthMHz, 0) * 1e6;
  const dataRateHz = Math.max(dataRateKbps * 1000, 1);
  return Math.max(0, 10 * Math.log10(spreadBandwidthHz / dataRateHz));
}

function getVideoTransportState(spreadBandwidthMHz = 0) {
  const spreadEnabled = isSpreadSpectrumEnabled();
  const dataRateKbps = getSpreadSpectrumDataRateKbps();
  const processingGainDb = spreadEnabled && Number.isFinite(dataRateKbps)
    ? getProcessingGainDb(dataRateKbps, spreadBandwidthMHz)
    : 0;
  if (dataRateOutput && Number.isFinite(dataRateKbps)) {
    dataRateOutput.textContent = `${dataRateKbps.toFixed(0)} kbps`;
  }
  if (processingGainOutput && Number.isFinite(processingGainDb)) {
    processingGainOutput.textContent = `${processingGainDb.toFixed(1)} dB`;
  }
  return {
    spreadEnabled,
    dataRateKbps,
    spreadBandwidthMHz,
    processingGainDb
  };
}

function chooseVideoModeBySnrAndRate(marginDb, transport) {
  if (marginDb < 0) return "lost";
  if (!transport.spreadEnabled) {
    return marginDb < 4 ? "poor" : marginDb < 12 ? "fair" : "excellent";
  }
  const rate = transport.dataRateKbps;
  if (rate < VIDEO_RATE_LIMITS_KBPS.poor) return "telemetry";
  if (marginDb >= 12 && rate >= VIDEO_RATE_LIMITS_KBPS.excellent) return "excellent";
  if (marginDb >= 4 && rate >= VIDEO_RATE_LIMITS_KBPS.fair) return "fair";
  return "poor";
}

function createVideoFeedMonitor() {
  if (!videoFeedCanvas || !videoMonitorView) return null;
  const ctx = videoFeedCanvas.getContext("2d", { alpha: false });
  const osdLayer = videoMonitorView.querySelector(".video-osd");
  const videoPhyStatus = document.createElement("span");
  const source = new Image();
  const pixelCanvas = document.createElement("canvas");
  const pixelCtx = pixelCanvas.getContext("2d", { alpha: false });
  const noiseCanvas = document.createElement("canvas");
  const noiseCtx = noiseCanvas.getContext("2d", { alpha: false });
  let mode = "excellent";
  let imageReady = false;
  let lastNoiseFrame = 0;
  let currentTransport = getVideoTransportState();

  videoPhyStatus.id = "videoPhyStatus";
  videoPhyStatus.textContent = AMC_OSD_CONFIG.excellent.phy;
  videoPhyStatus.style.cssText = [
    "position:absolute",
    "top:clamp(34px,7vw,62px)",
    "left:clamp(10px,2vw,20px)",
    "padding:5px 8px",
    "border-left:2px solid currentColor",
    "background:rgba(0,0,0,.48)",
    "box-shadow:0 1px 6px rgba(0,0,0,.5)",
    "text-shadow:1px 1px 4px #000"
  ].join(";");
  osdLayer?.appendChild(videoPhyStatus);

  videoLinkStatus.style.padding = "5px 8px";
  videoLinkStatus.style.borderLeft = "2px solid currentColor";
  videoLinkStatus.style.background = "rgba(0,0,0,.48)";
  videoLinkStatus.style.boxShadow = "0 1px 6px rgba(0,0,0,.5)";
  videoLinkStatus.style.textShadow = "1px 1px 4px #000";

  source.onload = () => { imageReady = true; };
  source.onerror = () => reportLog("圖傳底圖載入失敗", "warn", source.src);
  source.src = "assets/drone-aerial-feed.png";

  function drawCover(targetCtx, image, width, height) {
    const scale = Math.max(width / image.width, height / image.height);
    const sw = width / scale;
    const sh = height / scale;
    targetCtx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, 0, 0, width, height);
  }

  function drawStatic(width, height) {
    const nw = 320;
    const nh = Math.round(nw * height / width);
    if (noiseCanvas.width !== nw || noiseCanvas.height !== nh) {
      noiseCanvas.width = nw;
      noiseCanvas.height = nh;
    }
    const imageData = noiseCtx.createImageData(nw, nh);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const value = Math.random() * 255;
      imageData.data[i] = value;
      imageData.data[i + 1] = value;
      imageData.data[i + 2] = value;
      imageData.data[i + 3] = 255;
    }
    noiseCtx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(noiseCanvas, 0, 0, width, height);
    if (Math.random() > 0.55) {
      ctx.fillStyle = "rgba(255,255,255,.35)";
      ctx.fillRect(0, Math.random() * height, width, 2 + Math.random() * 5);
    }
  }

  function drawTelemetry(width, height, timestamp) {
    const t = timestamp / 1000;
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = "#020a10";
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.strokeStyle = "rgba(53, 215, 255, 0.18)";
    ctx.lineWidth = 1;
    const grid = 64;
    for (let x = 0; x <= width; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const cx = width * 0.5;
    const cy = height * 0.48;
    const radius = Math.min(width, height) * 0.26;
    ctx.strokeStyle = "rgba(53, 215, 255, 0.62)";
    ctx.lineWidth = 2;
    for (let i = 1; i <= 4; i += 1) {
      ctx.beginPath();
      ctx.arc(cx, cy, (radius * i) / 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    const sweep = t * 1.8;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, "rgba(53, 215, 255, 0.44)");
    gradient.addColorStop(1, "rgba(53, 215, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, sweep - 0.32, sweep);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(53, 215, 255, 0.95)";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweep) * radius, cy + Math.sin(sweep) * radius);
    ctx.stroke();

    const horizonY = cy + Math.sin(t * 0.9) * 12;
    ctx.strokeStyle = "rgba(71, 240, 166, 0.72)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(width * 0.18, horizonY);
    ctx.lineTo(width * 0.32, horizonY);
    ctx.moveTo(width * 0.68, horizonY);
    ctx.lineTo(width * 0.82, horizonY);
    ctx.stroke();

    ctx.fillStyle = "rgba(0, 0, 0, 0.46)";
    ctx.fillRect(width * 0.08, height * 0.68, width * 0.84, height * 0.2);
    ctx.fillStyle = "#35d7ff";
    ctx.font = `700 ${Math.max(20, width * 0.025)}px ui-monospace, Menlo, Consolas, monospace`;
    const transport = currentTransport;
    const rateText = Number.isFinite(transport.dataRateKbps) ? `${transport.dataRateKbps.toFixed(0)} kbps` : "N/A";
    const gpText = Number.isFinite(transport.processingGainDb) ? `${transport.processingGainDb.toFixed(1)} dB` : "N/A";
    const lat = (25.033 + Math.sin(t * 0.13) * 0.002).toFixed(5);
    const lon = (121.565 + Math.cos(t * 0.11) * 0.002).toFixed(5);
    ctx.fillText("VIDEO PAYLOAD: DISABLED BY SHANNON/RATE LIMIT", width * 0.1, height * 0.73);
    ctx.fillText(`GPS ${lat}N ${lon}E  ALT ${(118 + Math.sin(t) * 4).toFixed(1)}m`, width * 0.1, height * 0.79);
    ctx.fillText(`DSSS DATA RATE ${rateText}  PROCESSING GAIN ${gpText}`, width * 0.1, height * 0.85);
    ctx.restore();
  }

  function render(timestamp = performance.now()) {
    const width = videoFeedCanvas.width;
    const height = videoFeedCanvas.height;
    if (mode === "lost") {
      if (timestamp - lastNoiseFrame > 42) {
        drawStatic(width, height);
        lastNoiseFrame = timestamp;
      }
      return;
    }
    if (mode === "telemetry") {
      drawTelemetry(width, height, timestamp);
      return;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = "#071217";
    ctx.fillRect(0, 0, width, height);
    if (!imageReady) return;
    if (mode === "poor") {
      const pixelWidth = Math.round(width * 0.15);
      const pixelHeight = Math.round(height * 0.15);
      if (pixelCanvas.width !== pixelWidth || pixelCanvas.height !== pixelHeight) {
        pixelCanvas.width = pixelWidth;
        pixelCanvas.height = pixelHeight;
      }
      pixelCtx.imageSmoothingEnabled = true;
      drawCover(pixelCtx, source, pixelCanvas.width, pixelCanvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(pixelCanvas, 0, 0, width, height);
      ctx.globalAlpha = 0.15;
      for (let i = 0; i < 360; i += 1) {
        const shade = Math.random() > 0.5 ? 255 : 0;
        ctx.fillStyle = `rgb(${shade} ${shade} ${shade})`;
        ctx.fillRect(Math.random() * width, Math.random() * height, 2 + Math.random() * 7, 2 + Math.random() * 7);
      }
      ctx.globalAlpha = 1;
    } else {
      drawCover(ctx, source, width, height);
    }
  }

  function update(budget, requiredSnrDb, transportState = getVideoTransportState()) {
    const receivedSnrDb = budget.rxLevelDbm - budget.totalNoiseDbm;
    const marginDb = receivedSnrDb - requiredSnrDb;
    const transport = transportState;
    currentTransport = transport;
    mode = chooseVideoModeBySnrAndRate(marginDb, transport);
    const osd = AMC_OSD_CONFIG[mode];
    videoMonitorView.className = `video-monitor mode-${mode}`;
    videoMonitorView.style.setProperty("--osd-color", osd.color);
    videoLinkStatus.textContent = osd.link;
    videoPhyStatus.textContent = osd.phy;
    videoSnrValue.textContent = `SNR ${receivedSnrDb >= 0 ? "+" : ""}${receivedSnrDb.toFixed(1)} dB`;
    videoRxValue.textContent = transport.spreadEnabled && Number.isFinite(transport.dataRateKbps)
      ? `RX ${budget.rxLevelDbm.toFixed(1)} dBm | DR ${transport.dataRateKbps.toFixed(0)} kbps | Gp ${transport.processingGainDb.toFixed(1)} dB`
      : `RX ${budget.rxLevelDbm.toFixed(1)} dBm`;
    render();
    return {
      mode,
      receivedSnrDb,
      marginDb,
      ...transport
    };
  }

  return { update, render };
}

function normalizeVector(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length
  };
}

function getSelectedAntennaTarget() {
  const checked = document.querySelector('input[name="targetAntenna"]:checked');
  return ANTENNA_TARGETS[checked?.value] ? checked.value : "tail";
}

function getLinkDirection() {
  return document.querySelector('input[name="linkDirection"]:checked')?.value === "uplink"
    ? "uplink"
    : "downlink";
}

function updateMonitorView(linkDirection) {
  const isDownlink = linkDirection === "downlink";
  if (videoMonitorView) videoMonitorView.style.display = isDownlink ? "block" : "none";
  if (c2TelemetryView) c2TelemetryView.style.display = isDownlink ? "none" : "block";
}

function updateC2Telemetry(budget, requiredSnrDb, transportState = getVideoTransportState()) {
  if (!c2TelemetryView) return;
  const receivedSnrDb = budget.rxLevelDbm - budget.totalNoiseDbm;
  const marginDb = receivedSnrDb - requiredSnrDb;
  const processingGainDb = transportState.spreadEnabled ? transportState.processingGainDb : 0;
  const state = marginDb < 0 ? "lost" : marginDb < 4 ? "marginal" : "secured";
  const statusText = {
    secured: "UPLINK STATUS: SECURED",
    marginal: "UPLINK STATUS: MARGINAL",
    lost: "UPLINK STATUS: LINK LOST"
  }[state];
  let pdr;
  if (marginDb >= 12) {
    pdr = 99.9;
  } else if (marginDb >= 4) {
    pdr = 92 + ((marginDb - 4) / 8) * 7.9;
  } else if (marginDb >= 0) {
    pdr = 45 + (marginDb / 4) * 47;
  } else {
    pdr = Math.max(0, 45 + marginDb * 5);
  }

  c2TelemetryView.className = `c2-telemetry-view c2-${state}`;
  c2UplinkStatus.textContent = statusText;
  c2PdrValue.textContent = `PDR: ${pdr.toFixed(1)}%`;
  c2PdrBar.style.width = `${pdr}%`;
  c2PdrProgress?.setAttribute("aria-valuenow", pdr.toFixed(1));
  c2SnrValue.textContent = transportState.spreadEnabled
    ? `RX SNR: ${receivedSnrDb >= 0 ? "+" : ""}${receivedSnrDb.toFixed(1)} dB | PG: +${processingGainDb.toFixed(1)} dB`
    : `RX SNR: ${receivedSnrDb >= 0 ? "+" : ""}${receivedSnrDb.toFixed(1)} dB`;
  c2MarginValue.textContent = transportState.spreadEnabled
    ? `LINK MARGIN: ${marginDb >= 0 ? "+" : ""}${marginDb.toFixed(1)} dB | EFF REQ SNR: ${requiredSnrDb.toFixed(1)} dB`
    : `LINK MARGIN: ${marginDb >= 0 ? "+" : ""}${marginDb.toFixed(1)} dB`;
  c2RxValue.textContent = `RX POWER: ${budget.rxLevelDbm.toFixed(1)} dBm`;
}

function rotateLocalVectorForPitch(vector, pitchDegrees) {
  const angle = -pitchDegrees * (Math.PI / 180);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return normalizeVector({
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
    z: vector.z
  });
}

function calculateTargetTheta(targetKey, pitchDegrees) {
  const target = ANTENNA_TARGETS[targetKey] || ANTENNA_TARGETS.tail;
  const direction = rotateLocalVectorForPitch(target.localDirection, pitchDegrees);
  const dot = Math.max(-1, Math.min(1, direction.y));
  return Math.acos(dot) * (180 / Math.PI);
}

function reportLog(message, level = "ok", detail = "") {
  if (!DIAGNOSTIC_LOG_ENABLED) {
    if (level === "error") {
      const text = `${message}${detail ? `：${detail}` : ""}`;
      console.error(`[UAV Polarization] ${text}`);
    }
    return;
  }

  const time = new Date().toLocaleTimeString("zh-TW", { hour12: false });
  const text = `[${time}] ${message}${detail ? `：${detail}` : ""}`;
  const method = level === "error" ? "error" : level === "warn" ? "warn" : "log";
  console[method](`[UAV Polarization] ${text}`);

  if (!debugLog) return;

  const item = document.createElement("li");
  item.className = level;
  item.textContent = text;
  debugLog.appendChild(item);

  while (debugLog.children.length > 36) {
    debugLog.removeChild(debugLog.firstElementChild);
  }

  debugLog.scrollTop = debugLog.scrollHeight;

  if (debugStatus) {
    debugStatus.textContent = level === "error" ? "發生錯誤" : message;
  }
}

reportLog("script.js 已開始執行");
reportLog("目前頁面", "ok", window.location.href);
reportLog("D3 全域物件", window.d3 ? "ok" : "warn", window.d3 ? `v${window.d3.version}` : "尚未載入");

let THREE;
let worldUp;
let groundAntennaBottom;
let groundAntennaTop;
let uavPosition;
let sceneCenter;

function initializeThreeConstants() {
  reportLog("初始化 Three.js 座標常數");
  worldUp = new THREE.Vector3(0, 1, 0);
  groundAntennaBottom = new THREE.Vector3(1.45, -1.2, 0);
  groundAntennaTop = new THREE.Vector3(1.45, 2.05, 0);
  uavPosition = new THREE.Vector3(-1.15, 0.35, 0);
  sceneCenter = new THREE.Vector3(-0.45, 0.35, 0);
}

function clampLoss(thetaDegrees) {
  if (thetaDegrees >= 90) return -20;
  const radians = THREE.MathUtils.degToRad(thetaDegrees);
  return Math.max(20 * Math.log10(Math.cos(radians)), -20);
}

function positiveNumberFromInput(input, fallback) {
  const value = Number(input?.value);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function numberFromInput(input, fallback) {
  const value = Number(input?.value);
  return Number.isFinite(value) ? value : fallback;
}

function nonNegativeNumberFromInput(input, fallback) {
  const value = Number(input?.value);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function clampedNumberFromInput(input, fallback, min, max) {
  const value = Number(input?.value);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function getWindState() {
  const windSpeed = clampedNumberFromInput(windSpeedInput, 0, 0, 20);
  const windDirection = clampedNumberFromInput(windDirectionInput, 0, 0, 360);
  const gustMode = GUST_JITTER_AMPLITUDES[gustInput?.value] === undefined ? "none" : gustInput.value;
  const baseWindTilt = windSpeed * 1.5;
  const directionRadians = windDirection * (Math.PI / 180);
  return {
    windSpeed,
    windDirection,
    gustMode,
    baseWindTilt,
    windPitch: baseWindTilt * Math.cos(directionRadians),
    windRoll: baseWindTilt * Math.sin(directionRadians),
    jitterAmplitude: GUST_JITTER_AMPLITUDES[gustMode]
  };
}

function calculateAerodynamicPose(userPitchDegrees) {
  const wind = getWindState();
  const pitchJitter = wind.jitterAmplitude ? (Math.random() * 2 - 1) * wind.jitterAmplitude : 0;
  const rollJitter = wind.jitterAmplitude ? (Math.random() * 2 - 1) * wind.jitterAmplitude : 0;
  return {
    ...wind,
    userPitchDegrees,
    pitchJitter,
    rollJitter,
    effectivePitchDegrees: userPitchDegrees + wind.windPitch + pitchJitter,
    effectiveRollDegrees: wind.windRoll + rollJitter
  };
}

function updateWindOutputs(windState) {
  if (windSpeedOutput) windSpeedOutput.textContent = windState.windSpeed.toFixed(1);
  if (windDirectionOutput) windDirectionOutput.textContent = `${windState.windDirection.toFixed(0)}°`;
}

function calculateFspl(distanceKm, frequencyMHz) {
  return 32.44 + 20 * Math.log10(distanceKm) + 20 * Math.log10(frequencyMHz);
}

function calculateTwoRayGainDb(distanceMeters, gsHeightMeters, uavHeightMeters, frequencyMHz) {
  const wavelength = SPEED_OF_LIGHT / (frequencyMHz * 1000000);
  const losDistance = Math.sqrt(distanceMeters ** 2 + (gsHeightMeters - uavHeightMeters) ** 2);
  const reflectedDistance = Math.sqrt(distanceMeters ** 2 + (gsHeightMeters + uavHeightMeters) ** 2);
  const phaseDiff = (2 * Math.PI * (reflectedDistance - losDistance)) / wavelength;
  const interferenceLinear = Math.max(2 - 2 * Math.cos(phaseDiff), 0.001);
  return 10 * Math.log10(interferenceLinear);
}

function calculatePathLoss(distanceKm, frequencyMHz, gsHeightMeters, uavHeightMeters, multipathModel) {
  const fsplDb = calculateFspl(distanceKm, frequencyMHz);
  const distanceMeters = Math.max(distanceKm * 1000, 0.001);
  const twoRayGainDb = multipathModel === "tworay"
    ? calculateTwoRayGainDb(distanceMeters, gsHeightMeters, uavHeightMeters, frequencyMHz)
    : 0;
  return {
    fsplDb,
    twoRayGainDb,
    pathLossDb: fsplDb - twoRayGainDb
  };
}

function bandwidthToHz(bandwidth, unit) {
  return unit === "MHz" ? bandwidth * 1000000 : bandwidth * 1000;
}

function calculateNoiseFloor(bandwidth, unit, noiseFigureDb) {
  const bandwidthHz = bandwidthToHz(bandwidth, unit);
  return -174 + 10 * Math.log10(bandwidthHz) + noiseFigureDb;
}

function dbmToMilliwatts(dbm) {
  return 10 ** (dbm / 10);
}

function milliwattsToDbm(milliwatts) {
  return 10 * Math.log10(Math.max(milliwatts, 1e-30));
}

function calculateInterferenceRxDbm({
  distanceKm,
  frequencyMHz,
  rxGainDbi,
  uavHeightMeters,
  interfererEnabled,
  interfererDistanceMeters,
  interfererPowerDbm
}) {
  if (!interfererEnabled) return null;
  const uavToInterfererMeters = calculateInterfererUavDistanceMeters(distanceKm, uavHeightMeters, interfererDistanceMeters);
  const fsplIntDb = calculateFspl(Math.max(uavToInterfererMeters / 1000, 0.001), frequencyMHz);
  return interfererPowerDbm + rxGainDbi - fsplIntDb;
}

function calculateInterfererUavDistanceMeters(distanceKm, uavHeightMeters, interfererDistanceMeters) {
  return Math.max(interfererDistanceMeters, 1);
}

function calculateLinkBudget({
  distanceKm,
  frequencyMHz,
  txPowerDbm,
  txGainDbi,
  rxGainDbi,
  polarizationLossDb,
  noiseFigureDb,
  bandwidth,
  bandwidthUnit,
  snrDb,
  gsHeightMeters,
  uavHeightMeters,
  multipathModel,
  interfererEnabled,
  interfererDistanceMeters,
  interfererPowerDbm
}) {
  const path = calculatePathLoss(distanceKm, frequencyMHz, gsHeightMeters, uavHeightMeters, multipathModel);
  const rxLevelDbm = txPowerDbm + txGainDbi + rxGainDbi - path.pathLossDb + polarizationLossDb;
  const noiseFloorDbm = calculateNoiseFloor(bandwidth, bandwidthUnit, noiseFigureDb);
  const interferenceRxDbm = calculateInterferenceRxDbm({
    distanceKm,
    frequencyMHz,
    rxGainDbi,
    uavHeightMeters,
    interfererEnabled,
    interfererDistanceMeters,
    interfererPowerDbm
  });
  const totalNoiseDbm = milliwattsToDbm(
    dbmToMilliwatts(noiseFloorDbm) + (interferenceRxDbm === null ? 0 : dbmToMilliwatts(interferenceRxDbm))
  );
  const requiredBySnrDbm = totalNoiseDbm + snrDb;
  return {
    ...path,
    rxLevelDbm,
    noiseFloorDbm,
    interferenceRxDbm,
    totalNoiseDbm,
    requiredBySnrDbm,
    linkMarginDb: rxLevelDbm - requiredBySnrDbm,
    isControllable: rxLevelDbm > requiredBySnrDbm
  };
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatCsvNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "";
}

function makeTimestampForFilename(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + "_" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function exportCurrentStateCsv() {
  updateDashboard(undefined, { skipLog: true, timestampMs: performance.now() });
  const snapshot = latestSimulationSnapshot;
  if (!snapshot) return;

  const rows = [
    ["分類", "參數", "數值", "單位/備註"],
    ["匯出資訊", "Export Time", new Date().toISOString(), "ISO 8601"],
    ["基本狀態", "Link Direction", snapshot.linkDirectionLabel, snapshot.linkDirection],
    ["基本狀態", "Target Antenna", snapshot.targetAntennaName, snapshot.targetAntenna],
    ["基本狀態", "Link State", snapshot.linkState, ""],
    ["姿態/極化", "Pitch Command", formatCsvNumber(snapshot.pitchDegrees, 1), "deg"],
    ["姿態/極化", "Effective Pitch", formatCsvNumber(snapshot.effectivePitchDegrees, 1), "deg"],
    ["姿態/極化", "Effective Roll", formatCsvNumber(snapshot.effectiveRollDegrees, 1), "deg"],
    ["姿態/極化", "Theta", formatCsvNumber(snapshot.thetaDegrees, 2), "deg"],
    ["姿態/極化", "Polarization Loss", formatCsvNumber(snapshot.polarizationLossDb, 2), "dB"],
    ["鏈路預算", "Distance", formatCsvNumber(snapshot.distanceKm, 3), "km"],
    ["鏈路預算", "Frequency", formatCsvNumber(snapshot.frequencyMHz, 3), "MHz"],
    ["鏈路預算", "Tx Power", formatCsvNumber(snapshot.txPowerDbm, 2), "dBm"],
    ["鏈路預算", "Tx Antenna Gain", formatCsvNumber(snapshot.txGainDbi, 2), "dBi"],
    ["鏈路預算", "Rx Antenna Gain", formatCsvNumber(snapshot.rxGainDbi, 2), "dBi"],
    ["鏈路預算", "Path Loss", formatCsvNumber(snapshot.pathLossDb, 2), "dB"],
    ["鏈路預算", "Two-Ray Gain", formatCsvNumber(snapshot.twoRayGainDb, 2), "dB"],
    ["鏈路預算", "Total Attenuation", formatCsvNumber(snapshot.totalAttenuationDb, 2), "dB"],
    ["鏈路預算", "Rx Power", formatCsvNumber(snapshot.rxLevelDbm, 2), "dBm"],
    ["鏈路預算", "Noise Floor", formatCsvNumber(snapshot.noiseFloorDbm, 2), "dBm"],
    ["鏈路預算", "Interference Rx", snapshot.interferenceRxDbm === null ? "OFF" : formatCsvNumber(snapshot.interferenceRxDbm, 2), "dBm"],
    ["鏈路預算", "Total Noise", formatCsvNumber(snapshot.totalNoiseDbm, 2), "dBm"],
    ["鏈路預算", "Required Signal", formatCsvNumber(snapshot.requiredBySnrDbm, 2), "dBm"],
    ["鏈路預算", "Received SNR", formatCsvNumber(snapshot.receivedSnrDb, 2), "dB"],
    ["鏈路預算", "Configured SNR Threshold", formatCsvNumber(snapshot.configuredSnrDb, 2), "dB"],
    ["鏈路預算", "Effective SNR Threshold", formatCsvNumber(snapshot.snrDb, 2), "dB"],
    ["鏈路預算", "Link Margin", formatCsvNumber(snapshot.linkMarginDb, 2), "dB"],
    ["圖傳/展頻", "Current Video Quality", snapshot.videoQualityMode || "N/A", ""],
    ["圖傳/展頻", "Spread Spectrum", snapshot.spreadSpectrumEnabled ? "ON" : "OFF", ""],
    ["圖傳/展頻", "RF Spread Bandwidth", formatCsvNumber(snapshot.spreadBandwidthMHz, 3), "MHz"],
    ["圖傳/展頻", "Data Rate", Number.isFinite(snapshot.dataRateKbps) ? formatCsvNumber(snapshot.dataRateKbps, 0) : "N/A", "kbps"],
    ["圖傳/展頻", "Processing Gain", formatCsvNumber(snapshot.processingGainDb, 2), "dB"],
    ["地面站硬體", "GCS Tx Power", formatCsvNumber(snapshot.gcsTxPower, 2), "dBm"],
    ["地面站硬體", "GCS Antenna Gain", formatCsvNumber(snapshot.gcsAntennaGain, 2), "dBi"],
    ["地面站硬體", "GCS Noise Figure", formatCsvNumber(snapshot.gcsNF, 2), "dB"],
    ["地面站硬體", "GCS RX Bandwidth", formatCsvNumber(snapshot.gcsBW, 3), "MHz"],
    ["地面站硬體", "GCS SNR Threshold", formatCsvNumber(snapshot.gcsSNRThreshold, 2), "dB"],
    ["無人機硬體", "UAV Tx Power", formatCsvNumber(snapshot.uavTxPower, 2), "dBm"],
    ["無人機硬體", "UAV Antenna Gain", formatCsvNumber(snapshot.uavAntennaGain, 2), "dBi"],
    ["無人機硬體", "UAV Noise Figure", formatCsvNumber(snapshot.uavNF, 2), "dB"],
    ["無人機硬體", "UAV RX Bandwidth", formatCsvNumber(snapshot.uavBW, 3), "MHz"],
    ["無人機硬體", "UAV SNR Threshold", formatCsvNumber(snapshot.uavSNRThreshold, 2), "dB"],
    ["環境", "Multipath Model", snapshot.multipathModel, ""],
    ["環境", "UAV Height", formatCsvNumber(snapshot.uavHeightMeters, 2), "m"],
    ["環境", "Ground Station Height", formatCsvNumber(snapshot.gsHeightMeters, 2), "m"],
    ["環境", "Wind Speed", formatCsvNumber(snapshot.windSpeed, 1), "m/s"],
    ["環境", "Wind Direction", formatCsvNumber(snapshot.windDirection, 0), "deg"],
    ["環境", "Gust Mode", snapshot.gustMode, ""],
    ["干擾源", "Enabled", snapshot.interfererEnabled ? "ON" : "OFF", ""],
    ["干擾源", "Interferer Distance", formatCsvNumber(snapshot.interfererDistanceMeters, 1), "m"],
    ["干擾源", "Interferer Tx Power", formatCsvNumber(snapshot.interfererPowerDbm, 2), "dBm"],
    ["干擾源", "Interferer-UAV Distance", formatCsvNumber(snapshot.interfererUavDistanceMeters, 1), "m"]
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `uav_rf_link_snapshot_${makeTimestampForFilename()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function createCylinderBetween(start, end, radius, material) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 16);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(worldUp, direction.normalize());
  return mesh;
}

function createDashedLine(points, color) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineDashedMaterial({
    color,
    dashSize: 0.18,
    gapSize: 0.11,
    transparent: true,
    opacity: 0.88
  });
  const line = new THREE.Line(geometry, material);
  line.computeLineDistances();
  return line;
}

function makeLabel(text, className = "") {
  const element = document.createElement("div");
  element.className = `scene-label ${className}`.trim();
  element.textContent = text;
  return element;
}

function showLoadMessage(message) {
  reportLog(message, "error");
  const sceneHost = document.querySelector("#threeScene");
  const chartHost = document.querySelector("#lossCurveChart");
  if (sceneHost && !sceneHost.querySelector("canvas")) {
    sceneHost.innerHTML = `<div class="load-message">${message}</div>`;
  }
  if (chartHost && !chartHost.querySelector("svg")) {
    chartHost.innerHTML = `<div class="load-message">${message}</div>`;
  }
}

function createThreeScene(onDroneRotationChange = () => {}) {
  reportLog("開始建立 Three.js 場景");
  const host = document.querySelector("#threeScene");
  if (!host) {
    throw new Error("找不到 #threeScene 容器");
  }
  reportLog("找到 3D 容器", "ok", `${host.clientWidth}x${host.clientHeight}`);
  const hostStyle = getComputedStyle(host);
  reportLog(
    "套用 3D 工作區版面偏移",
    "ok",
    `left=${hostStyle.getPropertyValue("--scene-workspace-left").trim()}, top=${hostStyle.getPropertyValue("--scene-workspace-top").trim()}, size=${hostStyle.getPropertyValue("--scene-workspace-size").trim()}, zoom=${hostStyle.getPropertyValue("--scene-workspace-zoom").trim()}`
  );

  const labelLayer = document.createElement("div");
  labelLayer.className = "label-layer";
  host.appendChild(labelLayer);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x071217);
  scene.fog = new THREE.Fog(0x071217, 7, 22);

  const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 100);
  camera.position.set(sceneCenter.x, sceneCenter.y, 9);
  camera.lookAt(sceneCenter);
  reportLog("使用正面正交工程視圖置中工作區", "ok", `target=${sceneCenter.toArray().join(",")}`);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch (error) {
    throw new Error(`WebGLRenderer 建立失敗：${error.message}`);
  }
  reportLog("WebGLRenderer 建立完成");

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  reportLog("Canvas 已加入 3D 容器");

  renderer.domElement.style.cursor = "grab";

  scene.add(new THREE.HemisphereLight(0xdff8ff, 0x0b1b22, 2.2));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(4, 6, 5);
  scene.add(keyLight);
  const rimLight = new THREE.PointLight(0x27d9ff, 9, 15);
  rimLight.position.set(-4, 3, -4);
  scene.add(rimLight);

  const grid = new THREE.GridHelper(8, 20, 0x2b6270, 0x17313a);
  grid.position.y = -1.2;
  scene.add(grid);
  reportLog("地面網格已建立");

  const windArrowOrigin = new THREE.Vector3(-3.1, 1.72, 0);
  const windArrow = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    windArrowOrigin,
    0.75,
    0x27d9ff,
    0.24,
    0.16
  );
  windArrow.cone.material.transparent = true;
  windArrow.cone.material.opacity = 0.78;
  windArrow.line.material.transparent = true;
  windArrow.line.material.opacity = 0.58;
  scene.add(windArrow);
  reportLog("風向與風速箭頭已建立");

  const groundMat = new THREE.MeshStandardMaterial({ color: 0xe3fbff, emissive: 0x15323a, metalness: 0.35, roughness: 0.35 });
  const groundAntenna = createCylinderBetween(groundAntennaBottom, groundAntennaTop, 0.035, groundMat);
  scene.add(groundAntenna);
  reportLog("地面遙控器天線已建立", "ok", `bottom=${groundAntennaBottom.toArray().join(",")} top=${groundAntennaTop.toArray().join(",")}`);

  const groundAntennaBase = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.12, 32), groundMat);
  groundAntennaBase.position.set(groundAntennaBottom.x, groundAntennaBottom.y + 0.03, groundAntennaBottom.z);
  scene.add(groundAntennaBase);

  const interfererGroup = new THREE.Group();
  const interfererMat = new THREE.MeshBasicMaterial({
    color: 0xff304f,
    transparent: true,
    opacity: 0.76
  });
  const interfererGlowMat = new THREE.MeshBasicMaterial({
    color: 0xff304f,
    transparent: true,
    opacity: 0.18,
    depthWrite: false
  });
  const interfererCore = new THREE.Mesh(new THREE.SphereGeometry(0.12, 28, 18), interfererMat);
  const interfererGlow = new THREE.Mesh(new THREE.SphereGeometry(0.28, 32, 20), interfererGlowMat);
  interfererGroup.add(interfererGlow, interfererCore);
  interfererGroup.visible = false;
  scene.add(interfererGroup);

  const uavGroup = new THREE.Group();
  uavGroup.position.copy(uavPosition);
  uavGroup.rotation.order = "YXZ";
  scene.add(uavGroup);
  reportLog("uavGroup 已加入場景", "ok", `position=${uavPosition.toArray().join(",")}`);
  reportLog("無人機滑鼠旋轉控制已啟用", "ok", "拖曳 canvas 只旋轉 uavGroup");

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xdbe8ec, metalness: 0.42, roughness: 0.28 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x192c35, metalness: 0.5, roughness: 0.35 });
  const cyanMat = new THREE.MeshStandardMaterial({ color: 0x27d9ff, emissive: 0x0b5f70, metalness: 0.25, roughness: 0.32 });
  const greenMat = new THREE.MeshStandardMaterial({ color: 0x47f0a6, emissive: 0x0c6d45, metalness: 0.2, roughness: 0.3 });
  const amberMat = new THREE.MeshStandardMaterial({ color: 0xffbd55, emissive: 0x6d3d0a, metalness: 0.2, roughness: 0.35 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.42, 0.62), bodyMat);
  body.scale.x = 1;
  uavGroup.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.7, 4), bodyMat);
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 1.22;
  uavGroup.add(nose);

  uavGroup.add(createCylinderBetween(new THREE.Vector3(-1.45, 0, 0), new THREE.Vector3(1.35, 0, 0), 0.035, darkMat));

  const rotorPositions = [
    [-1.35, 0.1, -0.95],
    [-1.35, 0.1, 0.95],
    [1.15, 0.1, -0.95],
    [1.15, 0.1, 0.95]
  ];
  const spinningRotors = [];

  rotorPositions.forEach(([x, y, z], index) => {
    uavGroup.add(createCylinderBetween(new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, y, z), 0.025, darkMat));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 24), cyanMat);
    hub.position.set(x, y, z);
    uavGroup.add(hub);

    const rotor = new THREE.Group();
    rotor.position.set(x, y + 0.05, z);
    rotor.rotation.y = index % 2 === 0 ? 0.18 : -0.18;

    const rotorSpin = new THREE.Group();
    rotorSpin.userData.spinDirection = index % 2 === 0 ? 1 : -1;
    const rotorMat = cyanMat.clone();
    rotorMat.transparent = true;
    rotorMat.opacity = 0.52;
    const rotorBlurMat = new THREE.MeshBasicMaterial({
      color: 0x27d9ff,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const rotorBlur = new THREE.Mesh(new THREE.CircleGeometry(0.48, 48), rotorBlurMat);
    rotorBlur.rotation.x = -Math.PI / 2;
    const bladeA = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.018, 0.08), rotorMat);
    const bladeB = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.018, 0.72), rotorMat);
    const bladeC = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.014, 0.06), rotorMat);
    bladeC.rotation.y = Math.PI / 4;
    const bladeD = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.014, 0.06), rotorMat);
    bladeD.rotation.y = -Math.PI / 4;
    bladeA.material.transparent = true;
    bladeA.material.opacity = 0.72;
    bladeB.material.transparent = true;
    bladeB.material.opacity = 0.72;
    rotorSpin.add(rotorBlur, bladeA, bladeB, bladeC, bladeD);
    rotor.add(rotorSpin);
    spinningRotors.push(rotorSpin);
    uavGroup.add(rotor);
  });
  reportLog("螺旋槳旋轉特效已建立", "ok", `${spinningRotors.length} 組旋翼`);

  const skidY = -0.72;
  [-0.42, 0.42].forEach((z) => {
    uavGroup.add(createCylinderBetween(new THREE.Vector3(-0.72, -0.22, z), new THREE.Vector3(-0.88, skidY, z), 0.025, darkMat));
    uavGroup.add(createCylinderBetween(new THREE.Vector3(0.72, -0.22, z), new THREE.Vector3(0.88, skidY, z), 0.025, darkMat));
    uavGroup.add(createCylinderBetween(new THREE.Vector3(-1.05, skidY, z), new THREE.Vector3(1.05, skidY, z), 0.026, darkMat));
  });

  const rearAntennaBase = new THREE.Vector3(-1.18, 0.25, 0);
  const rearAntennaTip = new THREE.Vector3(-1.18, 1.42, 0);
  const tailAntenna = createCylinderBetween(rearAntennaBase, rearAntennaTip, 0.028, greenMat);
  uavGroup.add(tailAntenna);
  reportLog("機尾 433MHz 天線已加入 uavGroup");

  const legAntennaBase = new THREE.Vector3(0.72, -0.68, 0.48);
  const legAntennaTip = legAntennaBase.clone().add(new THREE.Vector3(-0.18, 0.92, 0.34).normalize().multiplyScalar(0.94));
  const legAntenna = createCylinderBetween(legAntennaBase, legAntennaTip, 0.026, amberMat);
  uavGroup.add(legAntenna);
  reportLog("腳架 2.4/5GHz 天線已加入 uavGroup");

  const wifiPanel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.46, 0.34), amberMat);
  wifiPanel.position.set(0.62, -0.54, 0.48);
  wifiPanel.rotation.z = THREE.MathUtils.degToRad(-12);
  uavGroup.add(wifiPanel);

  const guideGroup = new THREE.Group();
  scene.add(guideGroup);

  const thetaCurve = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xffbd55, linewidth: 3 })
  );
  scene.add(thetaCurve);

  const labels = {
    ground: makeLabel("地面遙控器天線"),
    hard: makeLabel("機尾 433MHz 天線"),
    panel: makeLabel("腳架 2.4/5GHz 天線"),
    theta: makeLabel("夾角 θ = 0°", "theta"),
    interferer: makeLabel("動態干擾源", "theta")
  };
  Object.values(labels).forEach((label) => labelLayer.appendChild(label));

  const antennaTargets = {
    tail: {
      label: labels.hard,
      name: ANTENNA_TARGETS.tail.name,
      mesh: tailAntenna,
      base: rearAntennaBase.clone(),
      tip: rearAntennaTip.clone(),
      activeMaterial: greenMat,
      inactiveMaterial: greenMat.clone(),
      color: 0x47f0a6
    },
    leg: {
      label: labels.panel,
      name: ANTENNA_TARGETS.leg.name,
      mesh: legAntenna,
      base: legAntennaBase.clone(),
      tip: legAntennaTip.clone(),
      activeMaterial: amberMat,
      inactiveMaterial: amberMat.clone(),
      color: 0xffbd55
    }
  };
  Object.values(antennaTargets).forEach((target) => {
    target.inactiveMaterial.transparent = true;
    target.inactiveMaterial.opacity = 0.24;
    target.inactiveMaterial.emissive.setHex(0x000000);
  });

  const antennaWorldBase = new THREE.Vector3();
  const antennaWorldTip = new THREE.Vector3();
  const antennaWorldDirection = new THREE.Vector3();
  let activeAntennaKey = selectedAntennaTarget;
  let latestThetaDegrees = 0;
  let currentPitchDegrees = 0;
  let currentRollDegrees = 0;
  let currentUavHeightMeters = 50;
  let uavYaw = 0;
  let uavTilt = 0;
  let isDraggingDrone = false;
  let lastPointer = { x: 0, y: 0 };
  let workspaceZoom = Number.parseFloat(hostStyle.getPropertyValue("--scene-workspace-zoom")) || 1;

  function applyUavRotation() {
    const normalizedHeight = THREE.MathUtils.clamp((currentUavHeightMeters - 1) / 499, 0, 1);
    uavGroup.position.y = -0.2 + normalizedHeight * 1.15;
    uavGroup.rotation.set(
      uavTilt + THREE.MathUtils.degToRad(currentRollDegrees),
      uavYaw,
      THREE.MathUtils.degToRad(-currentPitchDegrees),
      "YXZ"
    );
  }

  function updateWindArrow(windState = getWindState()) {
    const directionRadians = THREE.MathUtils.degToRad(windState.windDirection);
    const direction = new THREE.Vector3(Math.cos(directionRadians), Math.sin(directionRadians), 0).normalize();
    const length = 0.35 + windState.windSpeed * 0.075;
    windArrow.setDirection(direction);
    windArrow.setLength(length, 0.18 + windState.windSpeed * 0.012, 0.1 + windState.windSpeed * 0.006);
    const opacity = windState.windSpeed <= 0 ? 0.22 : 0.58 + Math.min(windState.windSpeed / 20, 1) * 0.3;
    windArrow.line.material.opacity = opacity;
    windArrow.cone.material.opacity = Math.min(opacity + 0.16, 0.92);
  }

  function makeThetaArc(basePoint, direction, thetaDegrees) {
    const radius = 0.58;
    const points = [];
    const steps = Math.max(8, Math.ceil(thetaDegrees / 4));
    const axis = new THREE.Vector3().crossVectors(worldUp, direction);

    if (axis.lengthSq() < 0.0001) {
      return [basePoint.clone().addScaledVector(worldUp, radius)];
    }

    axis.normalize();

    for (let i = 0; i <= steps; i += 1) {
      const stepAngle = THREE.MathUtils.degToRad((thetaDegrees * i) / steps);
      points.push(worldUp.clone().applyAxisAngle(axis, stepAngle).multiplyScalar(radius).add(basePoint));
    }
    return points;
  }

  function getAntennaWorldPoints(targetKey) {
    const target = antennaTargets[targetKey] || antennaTargets.tail;
    return {
      base: target.base.clone().applyMatrix4(uavGroup.matrixWorld),
      tip: target.tip.clone().applyMatrix4(uavGroup.matrixWorld)
    };
  }

  function applyAntennaFocus() {
    Object.entries(antennaTargets).forEach(([key, target]) => {
      const isActive = key === activeAntennaKey;
      target.mesh.material = isActive ? target.activeMaterial : target.inactiveMaterial;
      target.label.classList.toggle("muted", !isActive);
    });
  }

  function updateLabels(thetaDegrees) {
    const tailWorld = getAntennaWorldPoints("tail");
    const legWorld = getAntennaWorldPoints("leg");
    const projected = [
      { element: labels.ground, point: groundAntennaTop.clone() },
      { element: labels.hard, point: tailWorld.tip },
      { element: labels.panel, point: legWorld.tip },
      { element: labels.theta, point: antennaWorldBase.clone().add(new THREE.Vector3(0.22, 0.32, 0)), text: `夾角 θ = ${thetaDegrees.toFixed(1)}°` },
      { element: labels.interferer, point: interfererGroup.position.clone().add(new THREE.Vector3(0, 0.32, 0)) }
    ];

    const hostRect = host.getBoundingClientRect();
    projected.forEach(({ element, point, text }) => {
      if (text) element.textContent = text;
      const screen = point.clone().project(camera);
      element.style.left = `${((screen.x + 1) / 2) * hostRect.width}px`;
      element.style.top = `${((-screen.y + 1) / 2) * hostRect.height}px`;
      const muted = element.classList.contains("muted");
      element.style.opacity = element === labels.interferer && !interfererGroup.visible
        ? "0"
        : screen.z > 1 ? "0" : muted ? "0.45" : "1";
    });
  }

  function updateInterferer(enabled, interfererDistanceMeters, currentDistanceKm) {
    interfererGroup.visible = enabled;
    if (!enabled) return;
    const currentDistanceMeters = Math.max(currentDistanceKm * 1000, 1);
    const ratio = THREE.MathUtils.clamp(interfererDistanceMeters / currentDistanceMeters, 0, 1.35);
    const groundX = groundAntennaBottom.x;
    const uavX = uavGroup.position.x;
    interfererGroup.position.set(
      uavX + (groundX - uavX) * ratio,
      uavGroup.position.y - 0.5,
      0.72
    );
  }

  function disposeGuideGroup() {
    guideGroup.children.forEach((child) => {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose?.());
      } else {
        child.material?.dispose?.();
      }
    });
    guideGroup.clear();
  }

  function updatePitch(pitchDegrees, uavHeightMeters = currentUavHeightMeters, rollDegrees = 0, windState = getWindState()) {
    currentPitchDegrees = pitchDegrees;
    currentRollDegrees = rollDegrees;
    currentUavHeightMeters = uavHeightMeters;
    updateWindArrow(windState);
    applyUavRotation();
    uavGroup.updateMatrixWorld(true);

    const activeTarget = antennaTargets[activeAntennaKey] || antennaTargets.tail;
    antennaWorldBase.copy(activeTarget.base).applyMatrix4(uavGroup.matrixWorld);
    antennaWorldTip.copy(activeTarget.tip).applyMatrix4(uavGroup.matrixWorld);
    antennaWorldDirection.subVectors(antennaWorldTip, antennaWorldBase).normalize();

    const dot = THREE.MathUtils.clamp(antennaWorldDirection.dot(worldUp), -1, 1);
    const thetaDegrees = THREE.MathUtils.radToDeg(Math.acos(dot));
    latestThetaDegrees = thetaDegrees;

    disposeGuideGroup();
    guideGroup.add(createDashedLine([groundAntennaBottom.clone(), groundAntennaTop.clone().addScaledVector(worldUp, 0.95)], 0xe3fbff));
    guideGroup.add(
      createDashedLine(
        [
          antennaWorldBase.clone().addScaledVector(antennaWorldDirection, -0.55),
          antennaWorldTip.clone().addScaledVector(antennaWorldDirection, 0.8)
        ],
        activeTarget.color
      )
    );
    guideGroup.add(createDashedLine([groundAntennaTop.clone(), antennaWorldTip.clone()], 0xffbd55));

    thetaCurve.geometry.dispose();
    thetaCurve.geometry = new THREE.BufferGeometry().setFromPoints(makeThetaArc(antennaWorldBase, antennaWorldDirection, thetaDegrees));
    updateLabels(thetaDegrees);

    return thetaDegrees;
  }

  function setTargetAntenna(targetKey, uavHeightMeters = currentUavHeightMeters) {
    activeAntennaKey = antennaTargets[targetKey] ? targetKey : "tail";
    applyAntennaFocus();
    return updatePitch(currentPitchDegrees, uavHeightMeters, currentRollDegrees);
  }

  function updateDroneFromPointer(event) {
    if (!isDraggingDrone) return;

    const dx = event.clientX - lastPointer.x;
    const dy = event.clientY - lastPointer.y;
    lastPointer = { x: event.clientX, y: event.clientY };

    uavYaw += dx * 0.01;
    uavTilt = THREE.MathUtils.clamp(uavTilt + dy * 0.008, -0.72, 0.72);
    const thetaDegrees = updatePitch(currentPitchDegrees, currentUavHeightMeters, currentRollDegrees);
    onDroneRotationChange(thetaDegrees);
  }

  renderer.domElement.addEventListener("pointerdown", (event) => {
    isDraggingDrone = true;
    lastPointer = { x: event.clientX, y: event.clientY };
    renderer.domElement.setPointerCapture(event.pointerId);
    renderer.domElement.style.cursor = "grabbing";
    reportLog("開始拖曳旋轉無人機");
  });

  renderer.domElement.addEventListener("pointermove", updateDroneFromPointer);

  renderer.domElement.addEventListener("pointerup", (event) => {
    if (!isDraggingDrone) return;
    isDraggingDrone = false;
    renderer.domElement.releasePointerCapture(event.pointerId);
    renderer.domElement.style.cursor = "grab";
    reportLog(
      "無人機滑鼠旋轉已套用",
      "ok",
      `yaw=${THREE.MathUtils.radToDeg(uavYaw).toFixed(1)}°, tilt=${THREE.MathUtils.radToDeg(uavTilt).toFixed(1)}°`
    );
  });

  renderer.domElement.addEventListener("pointercancel", () => {
    isDraggingDrone = false;
    renderer.domElement.style.cursor = "grab";
  });

  renderer.domElement.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      workspaceZoom = THREE.MathUtils.clamp(workspaceZoom + direction * 0.08, 0.62, 2.2);
      host.style.setProperty("--scene-workspace-zoom", workspaceZoom.toFixed(2));
      reportLog("工作區滾輪縮放已套用", "ok", `zoom=${workspaceZoom.toFixed(2)}`);
    },
    { passive: false }
  );

  function resize() {
    const width = host.clientWidth;
    const height = host.clientHeight;
    const aspect = width / height || 1;
    const viewHeight = 4.35;
    camera.left = (-viewHeight * aspect) / 2;
    camera.right = (viewHeight * aspect) / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    reportLog("正面正交視窗已更新", "ok", `aspect=${aspect.toFixed(2)}, viewHeight=${viewHeight}`);
  }

  function logProjectedCenter() {
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    const centerScreen = sceneCenter.clone().project(camera);
    const droneScreen = uavPosition.clone().project(camera);
    const groundScreen = groundAntennaTop.clone().project(camera);
    const toPixel = (point) => `${(((point.x + 1) / 2) * width).toFixed(0)},${(((-point.y + 1) / 2) * height).toFixed(0)}`;
    reportLog("投影中心檢查", "ok", `center=${toPixel(centerScreen)}, uav=${toPixel(droneScreen)}, groundTop=${toPixel(groundScreen)}`);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();
  logProjectedCenter();
  reportLog("Renderer 尺寸已同步", "ok", `${host.clientWidth}x${host.clientHeight}`);
  applyAntennaFocus();
  updatePitch(0);
  reportLog("初始俯仰角已更新", "ok", "0 度");

  function render() {
    spinningRotors.forEach((rotor, index) => {
      rotor.rotation.y += rotor.userData.spinDirection * (0.34 + index * 0.015);
    });
    updateLabels(latestThetaDegrees);
    renderer.render(scene, camera);
    requestAnimationFrame(render);
  }
  render();
  reportLog("Three.js render loop 已啟動");

  return { updatePitch, setTargetAntenna, updateInterferer };
}

function createLossCurveChart() {
  reportLog("開始建立 D3 損耗曲線圖");
  const width = 430;
  const height = 300;
  const margin = { top: 22, right: 24, bottom: 52, left: 62 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = d3
    .select("#lossCurveChart")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", "無人機俯仰角與極化錯位損耗折線圖");
  reportLog("D3 SVG 已建立");

  svg
    .append("rect")
    .attr("x", 1)
    .attr("y", 1)
    .attr("width", width - 2)
    .attr("height", height - 2)
    .attr("rx", 6)
    .attr("fill", "#071217")
    .attr("stroke", "rgba(98, 153, 169, 0.18)");

  const chart = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);
  const yGrid = chart.append("g").attr("class", "grid");
  const xGrid = chart.append("g").attr("class", "grid").attr("transform", `translate(0, ${innerHeight})`);
  const xAxis = chart.append("g").attr("class", "axis").attr("transform", `translate(0, ${innerHeight})`);
  const yAxis = chart.append("g").attr("class", "axis");
  const xLabel = svg
    .append("text")
    .attr("class", "chart-label")
    .attr("x", margin.left + innerWidth / 2)
    .attr("y", height - 14)
    .attr("text-anchor", "middle");
  const yLabel = svg
    .append("text")
    .attr("class", "chart-label")
    .attr("x", 18)
    .attr("y", margin.top + innerHeight / 2)
    .attr("text-anchor", "middle")
    .attr("transform", `rotate(-90, 18, ${margin.top + innerHeight / 2})`);

  const path = chart.append("path").attr("class", "loss-line");
  const referencePath = chart.append("path").attr("class", "reference-line");
  const thresholdPath = chart.append("path").attr("class", "threshold-line");
  let activeTargetKey = selectedAntennaTarget;
  let latestState = null;
  let activeLinkDirection = null;
  const timeSeriesData = [];
  let lastPitchChartLogKey = "";

  function makeCurveData(targetKey) {
    return d3.range(0, 91).map((pitch) => ({
      pitch,
      loss: clampLoss(calculateTargetTheta(targetKey, pitch))
    }));
  }

  function drawPitchMode(targetKey, state) {
    const x = d3.scaleLinear().domain([0, 90]).range([0, innerWidth]);
    const y = d3.scaleLinear().domain([-20, 0]).range([innerHeight, 0]);
    const line = d3
      .line()
      .x((d) => x(d.pitch))
      .y((d) => y(d.loss))
      .curve(d3.curveMonotoneX);
    const data = makeCurveData(targetKey);

    yGrid.call(d3.axisLeft(y).ticks(5).tickSize(-innerWidth).tickFormat("")).select(".domain").remove();
    xGrid.call(d3.axisBottom(x).ticks(6).tickSize(-innerHeight).tickFormat("")).select(".domain").remove();
    xAxis.call(d3.axisBottom(x).ticks(6).tickFormat((d) => `${d}°`));
    yAxis.call(d3.axisLeft(y).ticks(5).tickFormat((d) => `${d} dB`));
    xLabel.text("無人機俯仰角");
    yLabel.text("極化損耗 (dB)");
    if (chartSubtitle) chartSubtitle.textContent = "Lpol = 20 × log10(cos θ)";

    path.datum(data).attr("d", line);
    referencePath.attr("d", null);
    thresholdPath.attr("d", null);

    const pitchDegrees = state?.pitchDegrees ?? Number(slider.value);
    const thetaDegrees = state?.thetaDegrees ?? calculateTargetTheta(targetKey, pitchDegrees);
    const loss = clampLoss(thetaDegrees);
    dot.attr("cx", x(pitchDegrees)).attr("cy", y(loss));
    dotLabel
      .attr("x", x(pitchDegrees))
      .attr("y", y(loss) - 14)
      .text(`${loss.toFixed(2)} dB`);
    const chartLogKey = `${targetKey}:${data.length}`;
    if (chartLogKey !== lastPitchChartLogKey) {
      reportLog("D3 損耗曲線已繪製", "ok", `${ANTENNA_TARGETS[targetKey]?.name || "目標天線"}，${data.length} 個資料點`);
      lastPitchChartLogKey = chartLogKey;
    }
  }

  function makeDistanceData(state, forcedModel) {
    const data = [];
    const minMeters = 10;
    const maxMeters = 10000;
    const steps = 240;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const distanceMeters = minMeters * ((maxMeters / minMeters) ** t);
      const distanceKm = distanceMeters / 1000;
      const budget = calculateLinkBudget({
        ...state,
        distanceKm,
        multipathModel: forcedModel
      });
      data.push({
        distanceMeters,
        rxLevelDbm: budget.rxLevelDbm,
        requiredBySnrDbm: budget.requiredBySnrDbm
      });
    }
    return data;
  }

  function drawDistanceMode(state) {
    if (!state) return;
    const x = d3.scaleLog().domain([10, 10000]).range([0, innerWidth]).clamp(true);
    const y = d3.scaleLinear().domain([-130, -30]).range([innerHeight, 0]).clamp(true);
    const line = d3
      .line()
      .x((d) => x(d.distanceMeters))
      .y((d) => y(d.rxLevelDbm))
      .curve(d3.curveLinear);
    const activeData = makeDistanceData(state, state.multipathModel);
    const fsplData = makeDistanceData(state, "fspl");
    const thresholdData = makeDistanceData(state, state.multipathModel);

    yGrid.call(d3.axisLeft(y).ticks(5).tickSize(-innerWidth).tickFormat("")).select(".domain").remove();
    xGrid.call(d3.axisBottom(x).tickValues([10, 30, 100, 300, 1000, 3000, 10000]).tickSize(-innerHeight).tickFormat("")).select(".domain").remove();
    xAxis.call(d3.axisBottom(x).tickValues([10, 30, 100, 300, 1000, 3000, 10000]).tickFormat((d) => `${d >= 1000 ? d / 1000 : d}${d >= 1000 ? "km" : "m"}`));
    yAxis.call(d3.axisLeft(y).ticks(5).tickFormat((d) => `${d} dBm`));
    xLabel.text("距離");
    yLabel.text("接收功率 Rx Level (dBm)");
    if (chartSubtitle) chartSubtitle.textContent = state.multipathModel === "tworay" ? "Two-Ray 與 FSPL 接收功率對照" : "純 FSPL 接收功率曲線";

    path.datum(activeData).attr("d", line);
    referencePath.datum(fsplData).attr("d", state.multipathModel === "tworay" ? line : null);
    thresholdPath
      .datum(thresholdData)
      .attr("d", d3.line()
        .x((d) => x(d.distanceMeters))
        .y((d) => y(d.requiredBySnrDbm))
        .curve(d3.curveLinear));

    dot.attr("cx", x(Math.max(state.distanceKm * 1000, 10))).attr("cy", y(state.rxLevelDbm));
    dotLabel
      .attr("x", x(Math.max(state.distanceKm * 1000, 10)))
      .attr("y", y(state.rxLevelDbm) - 14)
      .text(`${state.rxLevelDbm.toFixed(1)} dBm`);
  }

  function drawTimeMode(state) {
    if (!state) return;
    const now = state.timestampMs || performance.now();
    const oldest = now - TIME_SERIES_WINDOW_MS;
    while (timeSeriesData.length && timeSeriesData[0].timestampMs < oldest) {
      timeSeriesData.shift();
    }

    const x = d3.scaleLinear().domain([-10, 0]).range([0, innerWidth]);
    const y = d3.scaleLinear().domain([-100, -70]).range([innerHeight, 0]).clamp(true);
    const line = d3
      .line()
      .x((d) => x((d.timestampMs - now) / 1000))
      .y((d) => y(d.rxLevelDbm))
      .curve(d3.curveLinear);

    yGrid.call(d3.axisLeft(y).ticks(6).tickSize(-innerWidth).tickFormat("")).select(".domain").remove();
    xGrid.call(d3.axisBottom(x).ticks(6).tickSize(-innerHeight).tickFormat("")).select(".domain").remove();
    xAxis.call(d3.axisBottom(x).ticks(6).tickFormat((d) => `${d}s`));
    yAxis.call(d3.axisLeft(y).ticks(6).tickFormat((d) => `${d} dBm`));
    xLabel.text("時間序列即時監控");
    yLabel.text("接收功率 Rx Level (dBm)");
    if (chartSubtitle) chartSubtitle.textContent = "過去 10 秒 Rx Level 與底噪門檻";

    path.datum(timeSeriesData).attr("d", timeSeriesData.length > 1 ? line : null);
    referencePath.attr("d", null);
    thresholdPath
      .datum([
        { timeOffsetSeconds: -10, requiredBySnrDbm: state.requiredBySnrDbm },
        { timeOffsetSeconds: 0, requiredBySnrDbm: state.requiredBySnrDbm }
      ])
      .attr("d", d3.line()
        .x((d) => x(d.timeOffsetSeconds))
        .y((d) => y(d.requiredBySnrDbm))
        .curve(d3.curveLinear));

    dot.attr("cx", x(0)).attr("cy", y(state.rxLevelDbm));
    dotLabel
      .attr("x", x(0))
      .attr("y", y(state.rxLevelDbm) - 14)
      .text(`${state.rxLevelDbm.toFixed(1)} dBm`);
  }

  function redraw(state = latestState) {
    latestState = state || latestState;
    if (activeChartMode === "time") {
      drawTimeMode(latestState);
    } else if (activeChartMode === "distance") {
      drawDistanceMode(latestState);
    } else {
      drawPitchMode(activeTargetKey, latestState);
    }
  }

  const dot = chart.append("circle").attr("class", "highlight-dot").attr("r", 7);
  const dotLabel = chart.append("text").attr("class", "chart-label").attr("fill", "#ffbd55").attr("text-anchor", "middle");
  redraw();

  function update(state) {
    if (state?.linkDirection && activeLinkDirection !== state.linkDirection) {
      timeSeriesData.length = 0;
      activeLinkDirection = state.linkDirection;
    }
    if (state?.timestampMs) {
      timeSeriesData.push({
        timestampMs: state.timestampMs,
        rxLevelDbm: state.rxLevelDbm
      });
      const oldest = state.timestampMs - TIME_SERIES_WINDOW_MS;
      while (timeSeriesData.length && timeSeriesData[0].timestampMs < oldest) {
        timeSeriesData.shift();
      }
    }
    redraw(state);
  }

  function setTargetAntenna(targetKey) {
    activeTargetKey = ANTENNA_TARGETS[targetKey] ? targetKey : "tail";
    redraw();
  }

  function setMode(mode) {
    activeChartMode = mode === "time" ? "time" : mode === "distance" ? "distance" : "pitch";
    redraw();
  }

  return { update, setTargetAntenna, setMode };
}

let threeScene;
let chart;
let lastLoggedSignature = "";
let latestSimulationSnapshot = null;

function applyTargetAntennaSelection() {
  selectedAntennaTarget = getSelectedAntennaTarget();
  const target = ANTENNA_TARGETS[selectedAntennaTarget] || ANTENNA_TARGETS.tail;
  const uavHeightMeters = clampedNumberFromInput(uavHeightInput, 50, 1, 500);
  frequencyInput.value = target.frequencyMHz;
  threeScene?.setTargetAntenna(selectedAntennaTarget, uavHeightMeters);
  chart?.setTargetAntenna(selectedAntennaTarget);
  updateDashboard();
  reportLog("分析天線已切換", "ok", `${target.name}，頻率=${target.frequencyMHz} MHz`);
}

function updateDashboard(thetaFromScene, options = {}) {
  const pitchDegrees = Number(slider.value);
  const aerodynamicPose = calculateAerodynamicPose(pitchDegrees);
  updateWindOutputs(aerodynamicPose);
  const uavHeightMeters = clampedNumberFromInput(uavHeightInput, 50, 1, 500);
  const thetaDegrees = typeof thetaFromScene === "number"
    ? thetaFromScene
    : threeScene.updatePitch(
      aerodynamicPose.effectivePitchDegrees,
      uavHeightMeters,
      aerodynamicPose.effectiveRollDegrees,
      aerodynamicPose
    );
  const polarizationLoss = clampLoss(thetaDegrees);
  const distanceKm = positiveNumberFromInput(distanceInput, 1);
  const gsHeightMeters = clampedNumberFromInput(gsHeightInput, 1.5, 0.5, 20);
  const multipathModel = multipathModelInput?.value === "tworay" ? "tworay" : "fspl";
  const interfererEnabled = Boolean(interfererEnabledInput?.checked);
  const interfererDistanceMeters = clampedNumberFromInput(interfererDistanceInput, 2000, 1, 100000);
  const interfererPowerDbm = numberFromInput(interfererPowerInput, 30);
  const interfererUavDistanceMeters = calculateInterfererUavDistanceMeters(distanceKm, uavHeightMeters, interfererDistanceMeters);
  const frequencyMHz = positiveNumberFromInput(frequencyInput, 433);
  const linkDirection = getLinkDirection();
  const gcsTxPower = numberFromInput(gcsTxPowerInput, 30);
  const gcsAntennaGain = numberFromInput(gcsAntennaGainInput, 2.15);
  const gcsNF = nonNegativeNumberFromInput(gcsNoiseFigureInput, 4);
  const gcsBW = positiveNumberFromInput(gcsBandwidthInput, 20);
  const gcsSNRThreshold = numberFromInput(gcsSnrInput, 10);
  const uavTxPower = numberFromInput(uavTxPowerInput, 23);
  const uavAntennaGain = numberFromInput(uavAntennaGainInput, 2.15);
  const uavNF = nonNegativeNumberFromInput(uavNoiseFigureInput, 6);
  const uavBW = positiveNumberFromInput(uavBandwidthInput, 0.125);
  const uavSNRThreshold = numberFromInput(uavSnrInput, 10);

  let currentTxPower;
  let currentTxGain;
  let currentRxGain;
  let currentRxNF;
  let currentRxBW;
  let currentRxSNR;

  if (linkDirection === "downlink") {
    currentTxPower = uavTxPower;
    currentTxGain = uavAntennaGain;
    currentRxGain = gcsAntennaGain;
    currentRxNF = gcsNF;
    currentRxBW = gcsBW;
    currentRxSNR = gcsSNRThreshold;
  } else {
    currentTxPower = gcsTxPower;
    currentTxGain = gcsAntennaGain;
    currentRxGain = uavAntennaGain;
    currentRxNF = uavNF;
    currentRxBW = uavBW;
    currentRxSNR = uavSNRThreshold;
  }

  const txPowerDbm = currentTxPower;
  const txGainDbi = currentTxGain;
  const rxGainDbi = currentRxGain;
  const noiseFigureDb = currentRxNF;
  const bandwidth = currentRxBW;
  const bandwidthUnit = "MHz";
  const configuredSnrDb = currentRxSNR;
  let videoTransportState = getVideoTransportState(bandwidth);
  const snrDb = configuredSnrDb - videoTransportState.processingGainDb;
  const budget = calculateLinkBudget({
    distanceKm,
    frequencyMHz,
    txPowerDbm,
    txGainDbi,
    rxGainDbi,
    polarizationLossDb: polarizationLoss,
    noiseFigureDb,
    bandwidth,
    bandwidthUnit,
    snrDb,
    gsHeightMeters,
    uavHeightMeters,
    multipathModel,
    interfererEnabled,
    interfererDistanceMeters,
    interfererPowerDbm
  });
  threeScene?.updateInterferer(interfererEnabled, interfererDistanceMeters, distanceKm);
  if (interfererUavDistanceOutput) {
    interfererUavDistanceOutput.textContent = interfererEnabled
      ? `${interfererUavDistanceMeters.toFixed(1)} 公尺`
      : "--";
  }
  const totalAttenuation = budget.pathLossDb + Math.abs(polarizationLoss);

  sliderValue.textContent = `${pitchDegrees}°`;
  currentPitch.textContent = `${aerodynamicPose.effectivePitchDegrees.toFixed(1)} 度`;
  currentTheta.textContent = `${thetaDegrees.toFixed(1)} 度`;
  currentLoss.textContent = `${polarizationLoss.toFixed(2)} dB`;
  currentFspl.textContent = `${budget.pathLossDb.toFixed(2)} dB`;
  currentTotalLoss.textContent = `-${totalAttenuation.toFixed(2)} dB`;
  currentRxLevel.textContent = `${budget.rxLevelDbm.toFixed(2)} dBm`;
  currentRequiredSignal.textContent = `${budget.requiredBySnrDbm.toFixed(2)} dBm`;
  currentLinkMargin.textContent = `${budget.linkMarginDb.toFixed(2)} dB`;
  currentLinkState.textContent = linkDirection === "downlink"
    ? (budget.isControllable ? "圖傳鏈路正常" : "圖傳鏈路中斷")
    : (budget.isControllable ? "無人機可控" : "無人機失控");
  linkStateCard.classList.toggle("controlled", budget.isControllable);
  linkStateCard.classList.toggle("lost", !budget.isControllable);
  updateMonitorView(linkDirection);
  if (linkDirection === "downlink") {
    videoTransportState = videoFeed?.update(budget, snrDb, videoTransportState) || videoTransportState;
  } else {
    updateC2Telemetry(budget, snrDb, videoTransportState);
  }

  latestSimulationSnapshot = {
    linkDirection,
    linkDirectionLabel: linkDirection === "downlink" ? "下行（圖傳 Video：無人機 → 地面站）" : "上行（遙控 C2：地面站 → 無人機）",
    targetAntenna: selectedAntennaTarget,
    targetAntennaName: ANTENNA_TARGETS[selectedAntennaTarget]?.name || "未知天線",
    linkState: currentLinkState.textContent,
    pitchDegrees,
    effectivePitchDegrees: aerodynamicPose.effectivePitchDegrees,
    effectiveRollDegrees: aerodynamicPose.effectiveRollDegrees,
    thetaDegrees,
    polarizationLossDb: polarizationLoss,
    distanceKm,
    frequencyMHz,
    txPowerDbm,
    txGainDbi,
    rxGainDbi,
    noiseFigureDb,
    bandwidth,
    bandwidthUnit,
    snrDb,
    configuredSnrDb,
    gsHeightMeters,
    uavHeightMeters,
    multipathModel,
    interfererEnabled,
    interfererDistanceMeters,
    interfererPowerDbm,
    interfererUavDistanceMeters,
    totalAttenuationDb: totalAttenuation,
    receivedSnrDb: budget.rxLevelDbm - budget.totalNoiseDbm,
    videoQualityMode: videoTransportState.mode || null,
    spreadSpectrumEnabled: videoTransportState.spreadEnabled,
    dataRateKbps: videoTransportState.dataRateKbps,
    spreadBandwidthMHz: videoTransportState.spreadBandwidthMHz,
    processingGainDb: videoTransportState.processingGainDb,
    gcsTxPower,
    gcsAntennaGain,
    gcsNF,
    gcsBW,
    gcsSNRThreshold,
    uavTxPower,
    uavAntennaGain,
    uavNF,
    uavBW,
    uavSNRThreshold,
    windSpeed: aerodynamicPose.windSpeed,
    windDirection: aerodynamicPose.windDirection,
    windPitch: aerodynamicPose.windPitch,
    windRoll: aerodynamicPose.windRoll,
    pitchJitter: aerodynamicPose.pitchJitter,
    rollJitter: aerodynamicPose.rollJitter,
    gustMode: aerodynamicPose.gustMode,
    ...budget
  };

  if (chart) {
    chart.update({
      pitchDegrees,
      effectivePitchDegrees: aerodynamicPose.effectivePitchDegrees,
      effectiveRollDegrees: aerodynamicPose.effectiveRollDegrees,
      windSpeed: aerodynamicPose.windSpeed,
      windDirection: aerodynamicPose.windDirection,
      windPitch: aerodynamicPose.windPitch,
      windRoll: aerodynamicPose.windRoll,
      pitchJitter: aerodynamicPose.pitchJitter,
      rollJitter: aerodynamicPose.rollJitter,
      gustMode: aerodynamicPose.gustMode,
      timestampMs: options.timestampMs || performance.now(),
      linkDirection,
      thetaDegrees,
      distanceKm,
      frequencyMHz,
      txPowerDbm,
      txGainDbi,
      rxGainDbi,
      polarizationLossDb: polarizationLoss,
      noiseFigureDb,
      bandwidth,
      bandwidthUnit,
      snrDb,
      configuredSnrDb,
      gsHeightMeters,
      uavHeightMeters,
      multipathModel,
      interfererEnabled,
      interfererDistanceMeters,
      interfererPowerDbm,
      ...budget
    });
  }

  const signature = [
    pitchDegrees,
    selectedAntennaTarget,
    linkDirection,
    thetaDegrees.toFixed(1),
    distanceKm,
    uavHeightMeters,
    gsHeightMeters,
    multipathModel,
    interfererEnabled,
    interfererDistanceMeters,
    interfererPowerDbm,
    frequencyMHz,
    txPowerDbm,
    txGainDbi,
    rxGainDbi,
    noiseFigureDb,
    bandwidth,
    bandwidthUnit,
    snrDb,
    gcsTxPower,
    gcsAntennaGain,
    gcsNF,
    gcsBW,
    gcsSNRThreshold,
    uavTxPower,
    uavAntennaGain,
    uavNF,
    uavBW,
    uavSNRThreshold,
    budget.pathLossDb.toFixed(2),
    budget.twoRayGainDb.toFixed(2),
    budget.totalNoiseDbm.toFixed(2),
    budget.interferenceRxDbm === null ? "off" : budget.interferenceRxDbm.toFixed(2),
    aerodynamicPose.windSpeed.toFixed(1),
    aerodynamicPose.windDirection.toFixed(0),
    aerodynamicPose.gustMode,
    budget.isControllable
  ].join("|");

  if (!options.skipLog && signature !== lastLoggedSignature) {
    reportLog(
      "鏈路預算已更新",
      budget.isControllable ? "ok" : "warn",
      `direction=${linkDirection}, target=${ANTENNA_TARGETS[selectedAntennaTarget].name}, model=${multipathModel}, pathLoss=${budget.pathLossDb.toFixed(2)} dB, twoRayGain=${budget.twoRayGainDb.toFixed(2)} dB, noise=${budget.totalNoiseDbm.toFixed(2)} dBm, interference=${budget.interferenceRxDbm === null ? "off" : `${budget.interferenceRxDbm.toFixed(2)} dBm`}, Rx=${budget.rxLevelDbm.toFixed(2)} dBm, threshold=${budget.requiredBySnrDbm.toFixed(2)} dBm, margin=${budget.linkMarginDb.toFixed(2)} dB, state=${currentLinkState.textContent}`
    );
    lastLoggedSignature = signature;
  }
}

async function boot() {
  try {
    reportLog("檢查 Three.js 全域物件");
    THREE = window.THREE;
    if (!THREE) {
      throw new Error("Three.js 未載入，請確認 cdn.jsdelivr.net 可以連線。");
    }
    reportLog("Three.js 模組載入完成", "ok", `REVISION ${THREE.REVISION}`);
    initializeThreeConstants();

    if (!d3) {
      throw new Error("D3.js 未載入，請確認瀏覽器可以連線到 CDN。");
    }

    threeScene = createThreeScene(() => updateDashboard());
    chart = createLossCurveChart();
    videoFeed = createVideoFeedMonitor();
    targetAntennaInputs.forEach((input) => {
      input.addEventListener("change", applyTargetAntennaSelection);
    });
    linkDirectionInputs.forEach((input) => {
      input.addEventListener("change", () => {
        updateMonitorView(getLinkDirection());
        updateDashboard();
      });
    });
    chartModeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        activeChartMode = button.dataset.chartMode === "time" ? "time" : button.dataset.chartMode === "distance" ? "distance" : "pitch";
        chartModeButtons.forEach((modeButton) => modeButton.classList.toggle("active", modeButton === button));
        chart?.setMode(activeChartMode);
        updateDashboard();
      });
    });
    exportCsvButton?.addEventListener("click", exportCurrentStateCsv);
    slider.addEventListener("input", updateDashboard);
    [
      distanceInput,
      uavHeightInput,
      gsHeightInput,
      multipathModelInput,
      windSpeedInput,
      windDirectionInput,
      gustInput,
      interfererEnabledInput,
      interfererDistanceInput,
      interfererPowerInput,
      frequencyInput,
      gcsTxPowerInput,
      gcsAntennaGainInput,
      gcsNoiseFigureInput,
      gcsBandwidthInput,
      gcsSnrInput,
      uavTxPowerInput,
      uavAntennaGainInput,
      uavNoiseFigureInput,
      uavBandwidthInput,
      uavSnrInput
    ].forEach((input) => {
      input.addEventListener("input", () => updateDashboard());
      input.addEventListener("change", () => updateDashboard());
    });
    [spreadSpectrumInput, dataRateInput].filter(Boolean).forEach((input) => {
      input.addEventListener("input", () => updateDashboard());
      input.addEventListener("change", () => updateDashboard());
    });
    applyTargetAntennaSelection();
    function monitorFrame(timestampMs) {
      updateDashboard(undefined, { skipLog: true, timestampMs });
      requestAnimationFrame(monitorFrame);
    }
    requestAnimationFrame(monitorFrame);
    reportLog("儀表板啟動完成");
  } catch (error) {
    reportLog(error.stack || error.message, "error");
    showLoadMessage(`視覺化載入失敗：${error.message}`);
  }
}

boot();
