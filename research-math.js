const RIGHT_PATIENT_ON_IMAGE_LEFT = true;

function vector(from, to) {
  return [to[0] - from[0], to[1] - from[1]];
}

function angleBetween(a, b) {
  const normA = Math.hypot(...a);
  const normB = Math.hypot(...b);
  if (normA < 1e-9 || normB < 1e-9) throw new Error('zero_length_reference');
  const cosine = Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / (normA * normB)));
  return Math.acos(cosine) * 180 / Math.PI;
}

function acuteAngle(a, b) {
  const angle = angleBetween(a, b);
  return Math.min(Math.abs(angle), Math.abs(180 - angle));
}

function orientationDifference(base, target) {
  const baseAngle = Math.atan2(base[1], base[0]);
  const targetAngle = Math.atan2(target[1], target[0]);
  return ((targetAngle - baseAngle) * 180 / Math.PI + 540) % 360 - 180;
}

function orientedLineVector(line, side, destination) {
  const [p1, p2] = line;
  const medialHigherX = RIGHT_PATIENT_ON_IMAGE_LEFT ? side === 'derecha' : side === 'izquierda';
  const destinationHigherX = destination === 'medial' ? medialHigherX : !medialHigherX;
  const [origin, target] = destinationHigherX
    ? (p2[0] >= p1[0] ? [p1, p2] : [p2, p1])
    : (p2[0] <= p1[0] ? [p1, p2] : [p2, p1]);
  return vector(origin, target);
}

function directionFromDifference(difference, side) {
  if (Math.abs(difference) < 0.05) return 'neutro';
  const isValgus = RIGHT_PATIENT_ON_IMAGE_LEFT
    ? (side === 'derecha' ? difference > 0 : difference < 0)
    : (side === 'derecha' ? difference < 0 : difference > 0);
  return isValgus ? 'valgo' : 'varo';
}

function signedValue(magnitude, direction) {
  if (direction === 'varo') return -Math.abs(magnitude);
  if (direction === 'valgo') return Math.abs(magnitude);
  return 0;
}

function classifyHka(deviation, alignment) {
  if (deviation <= 3) return 'Neutro';
  if (alignment === 'varo') return deviation < 10 ? 'Varo leve' : 'Varo severo';
  if (alignment === 'valgo') {
    if (deviation < 10) return 'Valgo leve';
    if (deviation < 20) return 'Valgo moderado';
    return 'Valgo severo';
  }
  return 'Indeterminado';
}

export function classifyCpak(ahka, jlo) {
  const column = ahka < -2 ? 0 : ahka > 2 ? 2 : 1;
  const row = jlo < 177 ? 0 : jlo > 183 ? 2 : 1;
  const matrix = [['I', 'II', 'III'], ['IV', 'V', 'VI'], ['VII', 'VIII', 'IX']];
  return {
    type: matrix[row][column],
    alignment: column === 0 ? 'Varo' : column === 2 ? 'Valgo' : 'Neutro',
    jlo: row === 0 ? 'Ápex distal' : row === 2 ? 'Ápex proximal' : 'Neutra',
  };
}

export const REQUIRED_GEOMETRY = [
  'cabeza', 'femur_proximal', 'femur_distal', 'femur_f10',
  'tibia_proximal', 'tibia_t4', 'tibia_t10', 'tobillo',
  'linea_femoral', 'linea_tibial',
];

function center(item) {
  return item?.center || item?.position;
}

export function missingGeometry(geometry) {
  return REQUIRED_GEOMETRY.filter((key) => !geometry[key]);
}

export function calculateMeasurements(geometry, side) {
  const missing = missingGeometry(geometry);
  if (missing.length) throw new Error(`missing_geometry:${missing.join(',')}`);
  if (!['derecha', 'izquierda'].includes(side)) throw new Error('invalid_side');

  const head = center(geometry.cabeza);
  const femurProximal = center(geometry.femur_proximal);
  const femurDistal = center(geometry.femur_distal);
  const femurF10 = center(geometry.femur_f10);
  const tibiaProximal = center(geometry.tibia_proximal);
  const tibiaT4 = center(geometry.tibia_t4);
  const tibiaT10 = center(geometry.tibia_t10);
  const ankle = center(geometry.tobillo);
  const femoralLine = [geometry.linea_femoral.point_1, geometry.linea_femoral.point_2];
  const tibialLine = [geometry.linea_tibial.point_1, geometry.linea_tibial.point_2];

  const femoralMechanical = vector(femurDistal, head);
  const tibialMechanical = vector(tibiaProximal, ankle);
  const femoralLineVector = vector(...femoralLine);
  const tibialLineVector = vector(...tibialLine);
  const femoralLateral = orientedLineVector(femoralLine, side, 'lateral');
  const tibialMedial = orientedLineVector(tibialLine, side, 'medial');
  const femoralAnatomical = vector(femurDistal, femurProximal);
  const femoralLocal = vector(femurF10, femurDistal);
  const tibialLocal = vector(tibiaT4, tibiaT10);

  const hkaInternal = angleBetween(femoralMechanical, tibialMechanical);
  const mldfa = angleBetween(femoralMechanical, femoralLateral);
  const mpta = angleBetween(tibialMechanical, tibialMedial);
  const jlca = acuteAngle(femoralLineVector, tibialLineVector);
  const ama = acuteAngle(femoralMechanical, femoralAnatomical);
  const aldfa = angleBetween(femoralAnatomical, femoralLateral);
  const aftaMagnitude = acuteAngle(femoralLocal, tibialLocal);
  const aftaDirection = directionFromDifference(orientationDifference(femoralLocal, tibialLocal), side);
  const hkaDeviation = Math.abs(180 - hkaInternal);
  const hkaAlignment = directionFromDifference(
    orientationDifference(vector(head, femurDistal), vector(tibiaProximal, ankle)),
    side,
  );
  const femoralMedial = orientedLineVector(femoralLine, side, 'medial');
  const tibialMedialForJlca = orientedLineVector(tibialLine, side, 'medial');
  const jlcaDifference = orientationDifference(femoralMedial, tibialMedialForJlca);
  const jlcaValgus = RIGHT_PATIENT_ON_IMAGE_LEFT
    ? (side === 'derecha' ? jlcaDifference < 0 : jlcaDifference > 0)
    : (side === 'derecha' ? jlcaDifference > 0 : jlcaDifference < 0);
  const jlcaSigned = Math.abs(jlcaDifference) < 0.05 ? 0 : (jlcaValgus ? Math.abs(jlca) : -Math.abs(jlca));
  const ahka = mpta - mldfa;
  const jlo = mpta + mldfa;
  const cpak = classifyCpak(ahka, jlo);

  return {
    HKA_interno: hkaInternal,
    HKA_desviacion: hkaDeviation,
    HKA_firmado: signedValue(hkaDeviation, hkaAlignment),
    alineacion: hkaAlignment,
    clasificacion_HKA: classifyHka(hkaDeviation, hkaAlignment),
    mLDFA: mldfa,
    MPTA: mpta,
    JLCA: jlca,
    JLCA_firmado: jlcaSigned,
    aLDFA: aldfa,
    AMA: ama,
    Valgo_femoral: ama,
    aHKA: ahka,
    JLO_CPAK: jlo,
    CPAK_tipo: cpak.type,
    CPAK_alineacion: cpak.alignment,
    CPAK_JLO: cpak.jlo,
    aFTA: signedValue(aftaMagnitude, aftaDirection),
    aFTA_magnitud: aftaMagnitude,
    aFTA_direccion: aftaDirection,
  };
}

export function roundMeasurements(results) {
  return Object.fromEntries(Object.entries(results).map(([key, value]) => [
    key,
    typeof value === 'number' ? Math.round(value * 100) / 100 : value,
  ]));
}

export function seedLocalAxes(geometry, pixelSpacing = null) {
  const output = structuredClone(geometry);
  const spacing = Array.isArray(pixelSpacing) && pixelSpacing.length === 2
    && pixelSpacing.every((value) => Number(value) > 0)
    ? pixelSpacing.map(Number)
    : null;

  const pointAlong = (start, end, fraction) => [
    start[0] + (end[0] - start[0]) * fraction,
    start[1] + (end[1] - start[1]) * fraction,
  ];
  const fraction = (start, end, millimeters, fallback) => {
    if (!spacing) return fallback;
    const distance = Math.hypot((end[0] - start[0]) * spacing[1], (end[1] - start[1]) * spacing[0]);
    return distance > 0 ? Math.min(1, millimeters / distance) : fallback;
  };

  const fn = center(output.femur_distal);
  const faa = center(output.femur_proximal);
  const tp = center(output.tibia_proximal);
  const ac = center(output.tobillo);
  if (fn && faa && !output.femur_f10) {
    output.femur_f10 = { type: 'circle', center: pointAlong(fn, faa, fraction(fn, faa, 100, 0.22)), radius: output.femur_proximal.radius };
  }
  if (tp && ac && !output.tibia_t4) {
    output.tibia_t4 = { type: 'circle', center: pointAlong(tp, ac, fraction(tp, ac, 40, 0.10)), radius: (output.tobillo.radius || 10) * 0.75 };
  }
  if (tp && ac && !output.tibia_t10) {
    output.tibia_t10 = { type: 'circle', center: pointAlong(tp, ac, fraction(tp, ac, 100, 0.25)), radius: (output.tobillo.radius || 10) * 0.75 };
  }
  return output;
}

export function normalizeGeometry(geometry, side) {
  const output = structuredClone(geometry);
  const medialFirst = (line) => {
    const [a, b] = [line.point_1, line.point_2];
    const aIsMedial = side === 'derecha' ? a[0] >= b[0] : a[0] <= b[0];
    return aIsMedial ? { ...line, point_1: a, point_2: b } : { ...line, point_1: b, point_2: a };
  };
  output.linea_femoral = medialFirst(output.linea_femoral);
  output.linea_tibial = medialFirst(output.linea_tibial);
  return output;
}
