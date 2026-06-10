const d3 = window.d3;
const targetAntennaInputs = document.querySelectorAll('input[name="targetAntenna"]');
const slider = document.querySelector("#pitchSlider");
const sliderValue = document.querySelector("#sliderValue");
const distanceInput = document.querySelector("#distanceInput");
const uavHeightInput = document.querySelector("#uavHeightInput");
const gsHeightInput = document.querySelector("#gsHeightInput");
const multipathModelInput = document.querySelector("#multipathModelInput");
const interfererEnabledInput = document.querySelector("#interfererEnabledInput");
const interfererDistanceInput = document.querySelector("#interfererDistanceInput");
const interfererPowerInput = document.querySelector("#interfererPowerInput");
const interfererUavDistanceOutput = document.querySelector("#interfererUavDistanceOutput");
const frequencyInput = document.querySelector("#frequencyInput");
const txPowerInput = document.querySelector("#txPowerInput");
const txGainInput = document.querySelector("#txGainInput");
const rxGainInput = document.querySelector("#rxGainInput");
const noiseFigureInput = document.querySelector("#noiseFigureInput");
const bandwidthInput = document.querySelector("#bandwidthInput");
const bandwidthUnitInput = document.querySelector("#bandwidthUnitInput");
const snrInput = document.querySelector("#snrInput");
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

const SPEED_OF_LIGHT = 3e8;

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
      uavTilt,
      uavYaw,
      THREE.MathUtils.degToRad(-currentPitchDegrees),
      "YXZ"
    );
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

  function updatePitch(pitchDegrees, uavHeightMeters = currentUavHeightMeters) {
    currentPitchDegrees = pitchDegrees;
    currentUavHeightMeters = uavHeightMeters;
    applyUavRotation();
    uavGroup.updateMatrixWorld(true);

    const activeTarget = antennaTargets[activeAntennaKey] || antennaTargets.tail;
    antennaWorldBase.copy(activeTarget.base).applyMatrix4(uavGroup.matrixWorld);
    antennaWorldTip.copy(activeTarget.tip).applyMatrix4(uavGroup.matrixWorld);
    antennaWorldDirection.subVectors(antennaWorldTip, antennaWorldBase).normalize();

    const dot = THREE.MathUtils.clamp(antennaWorldDirection.dot(worldUp), -1, 1);
    const thetaDegrees = THREE.MathUtils.radToDeg(Math.acos(dot));
    latestThetaDegrees = thetaDegrees;

    guideGroup.clear();
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
    return updatePitch(currentPitchDegrees, uavHeightMeters);
  }

  function updateDroneFromPointer(event) {
    if (!isDraggingDrone) return;

    const dx = event.clientX - lastPointer.x;
    const dy = event.clientY - lastPointer.y;
    lastPointer = { x: event.clientX, y: event.clientY };

    uavYaw += dx * 0.01;
    uavTilt = THREE.MathUtils.clamp(uavTilt + dy * 0.008, -0.72, 0.72);
    const thetaDegrees = updatePitch(currentPitchDegrees);
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
    reportLog("D3 損耗曲線已繪製", "ok", `${ANTENNA_TARGETS[targetKey]?.name || "目標天線"}，${data.length} 個資料點`);
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

  function redraw(state = latestState) {
    latestState = state || latestState;
    if (activeChartMode === "distance") {
      drawDistanceMode(latestState);
    } else {
      drawPitchMode(activeTargetKey, latestState);
    }
  }

  const dot = chart.append("circle").attr("class", "highlight-dot").attr("r", 7);
  const dotLabel = chart.append("text").attr("class", "chart-label").attr("fill", "#ffbd55").attr("text-anchor", "middle");
  redraw();

  function update(state) {
    redraw(state);
  }

  function setTargetAntenna(targetKey) {
    activeTargetKey = ANTENNA_TARGETS[targetKey] ? targetKey : "tail";
    redraw();
  }

  function setMode(mode) {
    activeChartMode = mode === "distance" ? "distance" : "pitch";
    redraw();
  }

  return { update, setTargetAntenna, setMode };
}

let threeScene;
let chart;
let lastLoggedSignature = "";

function applyTargetAntennaSelection() {
  selectedAntennaTarget = getSelectedAntennaTarget();
  const target = ANTENNA_TARGETS[selectedAntennaTarget] || ANTENNA_TARGETS.tail;
  const uavHeightMeters = clampedNumberFromInput(uavHeightInput, 50, 1, 500);
  frequencyInput.value = target.frequencyMHz;
  const thetaDegrees = threeScene?.setTargetAntenna(selectedAntennaTarget, uavHeightMeters);
  chart?.setTargetAntenna(selectedAntennaTarget);
  updateDashboard(thetaDegrees);
  reportLog("分析天線已切換", "ok", `${target.name}，頻率=${target.frequencyMHz} MHz`);
}

function updateDashboard(thetaFromScene) {
  const pitchDegrees = Number(slider.value);
  const uavHeightMeters = clampedNumberFromInput(uavHeightInput, 50, 1, 500);
  const thetaDegrees = typeof thetaFromScene === "number" ? thetaFromScene : threeScene.updatePitch(pitchDegrees, uavHeightMeters);
  const polarizationLoss = clampLoss(thetaDegrees);
  const distanceKm = positiveNumberFromInput(distanceInput, 1);
  const gsHeightMeters = clampedNumberFromInput(gsHeightInput, 1.5, 0.5, 20);
  const multipathModel = multipathModelInput?.value === "tworay" ? "tworay" : "fspl";
  const interfererEnabled = Boolean(interfererEnabledInput?.checked);
  const interfererDistanceMeters = clampedNumberFromInput(interfererDistanceInput, 2000, 1, 100000);
  const interfererPowerDbm = numberFromInput(interfererPowerInput, 30);
  const interfererUavDistanceMeters = calculateInterfererUavDistanceMeters(distanceKm, uavHeightMeters, interfererDistanceMeters);
  const frequencyMHz = positiveNumberFromInput(frequencyInput, 433);
  const txPowerDbm = numberFromInput(txPowerInput, 30);
  const txGainDbi = numberFromInput(txGainInput, 0);
  const rxGainDbi = numberFromInput(rxGainInput, 0);
  const noiseFigureDb = nonNegativeNumberFromInput(noiseFigureInput, 6);
  const bandwidth = positiveNumberFromInput(bandwidthInput, 125);
  const bandwidthUnit = bandwidthUnitInput?.value === "MHz" ? "MHz" : "kHz";
  const snrDb = numberFromInput(snrInput, 0);
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
  currentPitch.textContent = `${pitchDegrees} 度`;
  currentTheta.textContent = `${thetaDegrees.toFixed(1)} 度`;
  currentLoss.textContent = `${polarizationLoss.toFixed(2)} dB`;
  currentFspl.textContent = `${budget.pathLossDb.toFixed(2)} dB`;
  currentTotalLoss.textContent = `-${totalAttenuation.toFixed(2)} dB`;
  currentRxLevel.textContent = `${budget.rxLevelDbm.toFixed(2)} dBm`;
  currentRequiredSignal.textContent = `${budget.requiredBySnrDbm.toFixed(2)} dBm`;
  currentLinkMargin.textContent = `${budget.linkMarginDb.toFixed(2)} dB`;
  currentLinkState.textContent = budget.isControllable ? "無人機可控" : "無人機失控";
  linkStateCard.classList.toggle("controlled", budget.isControllable);
  linkStateCard.classList.toggle("lost", !budget.isControllable);
  if (chart) {
    chart.update({
      pitchDegrees,
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
    budget.pathLossDb.toFixed(2),
    budget.twoRayGainDb.toFixed(2),
    budget.totalNoiseDbm.toFixed(2),
    budget.interferenceRxDbm === null ? "off" : budget.interferenceRxDbm.toFixed(2),
    budget.isControllable
  ].join("|");

  if (signature !== lastLoggedSignature) {
    reportLog(
      "鏈路預算已更新",
      budget.isControllable ? "ok" : "warn",
      `target=${ANTENNA_TARGETS[selectedAntennaTarget].name}, model=${multipathModel}, pathLoss=${budget.pathLossDb.toFixed(2)} dB, twoRayGain=${budget.twoRayGainDb.toFixed(2)} dB, noise=${budget.totalNoiseDbm.toFixed(2)} dBm, interference=${budget.interferenceRxDbm === null ? "off" : `${budget.interferenceRxDbm.toFixed(2)} dBm`}, Rx=${budget.rxLevelDbm.toFixed(2)} dBm, threshold=${budget.requiredBySnrDbm.toFixed(2)} dBm, margin=${budget.linkMarginDb.toFixed(2)} dB, state=${currentLinkState.textContent}`
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

    threeScene = createThreeScene((thetaDegrees) => updateDashboard(thetaDegrees));
    chart = createLossCurveChart();
    targetAntennaInputs.forEach((input) => {
      input.addEventListener("change", applyTargetAntennaSelection);
    });
    chartModeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        activeChartMode = button.dataset.chartMode === "distance" ? "distance" : "pitch";
        chartModeButtons.forEach((modeButton) => modeButton.classList.toggle("active", modeButton === button));
        chart?.setMode(activeChartMode);
        updateDashboard();
      });
    });
    slider.addEventListener("input", updateDashboard);
    [
      distanceInput,
      uavHeightInput,
      gsHeightInput,
      multipathModelInput,
      interfererEnabledInput,
      interfererDistanceInput,
      interfererPowerInput,
      frequencyInput,
      txPowerInput,
      txGainInput,
      rxGainInput,
      noiseFigureInput,
      bandwidthInput,
      bandwidthUnitInput,
      snrInput
    ].forEach((input) => {
      input.addEventListener("input", () => updateDashboard());
      input.addEventListener("change", () => updateDashboard());
    });
    applyTargetAntennaSelection();
    reportLog("儀表板啟動完成");
  } catch (error) {
    reportLog(error.stack || error.message, "error");
    showLoadMessage(`視覺化載入失敗：${error.message}`);
  }
}

boot();
