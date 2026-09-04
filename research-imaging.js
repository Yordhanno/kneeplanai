const MAX_RENDER_DIMENSION = 4096;
const TEXT_DECODER = new TextDecoder('utf-8');
const LONG_VR = new Set(['OB', 'OD', 'OF', 'OL', 'OV', 'OW', 'SQ', 'SV', 'UC', 'UN', 'UR', 'UT', 'UV']);
const KNOWN_VR = new Set(['AE', 'AS', 'AT', 'CS', 'DA', 'DS', 'DT', 'FD', 'FL', 'IS', 'LO', 'LT', 'OB', 'OD', 'OF', 'OL', 'OV', 'OW', 'PN', 'SH', 'SL', 'SQ', 'SS', 'ST', 'SV', 'TM', 'UC', 'UI', 'UL', 'UN', 'UR', 'US', 'UT', 'UV']);

function textValue(bytes) {
  return TEXT_DECODER.decode(bytes).replaceAll('\0', '').trim();
}

function numericList(value) {
  return String(value || '').split('\\').map(Number).filter(Number.isFinite);
}

function tagKey(group, element) {
  return `${group.toString(16).padStart(4, '0')},${element.toString(16).padStart(4, '0')}`;
}

function elementAt(view, offset, explicit, littleEndian = true) {
  if (offset + 8 > view.byteLength) return null;
  const group = view.getUint16(offset, littleEndian);
  const element = view.getUint16(offset + 2, littleEndian);
  if (explicit) {
    const vr = String.fromCharCode(view.getUint8(offset + 4), view.getUint8(offset + 5));
    if (!KNOWN_VR.has(vr)) return null;
    if (LONG_VR.has(vr)) {
      if (offset + 12 > view.byteLength) return null;
      return { group, element, vr, length: view.getUint32(offset + 8, littleEndian), valueOffset: offset + 12 };
    }
    return { group, element, vr, length: view.getUint16(offset + 6, littleEndian), valueOffset: offset + 8 };
  }
  return { group, element, vr: '', length: view.getUint32(offset + 4, littleEndian), valueOffset: offset + 8 };
}

function readNumber(view, item, signed = false, littleEndian = true) {
  if (!item || item.length < 2) return null;
  if (item.vr === 'UL' && item.length >= 4) return view.getUint32(item.valueOffset, littleEndian);
  if (item.vr === 'SL' && item.length >= 4) return view.getInt32(item.valueOffset, littleEndian);
  return signed ? view.getInt16(item.valueOffset, littleEndian) : view.getUint16(item.valueOffset, littleEndian);
}

function parseDicom(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const hasPreamble = view.byteLength >= 132 && String.fromCharCode(...bytes.slice(128, 132)) === 'DICM';
  let offset = hasPreamble ? 132 : 0;
  let transferSyntax = '1.2.840.10008.1.2.1';

  while (offset + 8 <= view.byteLength) {
    const item = elementAt(view, offset, true);
    if (!item || item.group !== 0x0002 || item.length === 0xffffffff) break;
    const end = item.valueOffset + item.length;
    if (end > view.byteLength) break;
    if (tagKey(item.group, item.element) === '0002,0010') transferSyntax = textValue(bytes.slice(item.valueOffset, end));
    offset = end + (item.length % 2);
  }

  if (transferSyntax === '1.2.840.10008.1.2.2') throw new Error('dicom_big_endian_not_supported');
  if (!['1.2.840.10008.1.2', '1.2.840.10008.1.2.1'].includes(transferSyntax)) {
    throw new Error('dicom_compressed_not_supported');
  }
  let explicit = transferSyntax !== '1.2.840.10008.1.2';
  if (!hasPreamble && offset === 0 && view.byteLength > 8) {
    const guessedVr = String.fromCharCode(view.getUint8(4), view.getUint8(5));
    explicit = KNOWN_VR.has(guessedVr);
  }

  const metadata = {
    rows: 0, columns: 0, bitsAllocated: 0, bitsStored: 0,
    signed: false, samplesPerPixel: 1, photometric: '',
    slope: 1, intercept: 0, pixelSpacing: null, manufacturer: '', model: '',
  };
  let pixelOffset = -1;
  let pixelLength = 0;

  while (offset + 8 <= view.byteLength) {
    const item = elementAt(view, offset, explicit);
    if (!item || item.length === 0xffffffff) break;
    const end = item.valueOffset + item.length;
    if (end > view.byteLength) break;
    const key = tagKey(item.group, item.element);
    const rawText = () => textValue(bytes.slice(item.valueOffset, end));
    if (key === '0028,0010') metadata.rows = readNumber(view, item) || 0;
    else if (key === '0028,0011') metadata.columns = readNumber(view, item) || 0;
    else if (key === '0028,0100') metadata.bitsAllocated = readNumber(view, item) || 0;
    else if (key === '0028,0101') metadata.bitsStored = readNumber(view, item) || 0;
    else if (key === '0028,0103') metadata.signed = readNumber(view, item) === 1;
    else if (key === '0028,0002') metadata.samplesPerPixel = readNumber(view, item) || 1;
    else if (key === '0028,0004') metadata.photometric = rawText().toUpperCase();
    else if (key === '0028,0030') {
      const spacing = numericList(rawText());
      metadata.pixelSpacing = spacing.length >= 2 ? spacing.slice(0, 2) : null;
    } else if (key === '0028,1052') metadata.intercept = Number(rawText()) || 0;
    else if (key === '0028,1053') metadata.slope = Number(rawText()) || 1;
    else if (key === '0008,0070') metadata.manufacturer = rawText().slice(0, 80);
    else if (key === '0008,1090') metadata.model = rawText().slice(0, 80);
    else if (key === '7fe0,0010') {
      pixelOffset = item.valueOffset;
      pixelLength = item.length;
      break;
    }
    offset = end + (item.length % 2);
  }

  if (!metadata.rows || !metadata.columns || pixelOffset < 0) throw new Error('dicom_pixels_missing');
  if (![8, 16].includes(metadata.bitsAllocated)) throw new Error('dicom_bit_depth_not_supported');
  if (metadata.samplesPerPixel !== 1) throw new Error('dicom_color_not_supported');
  const expected = metadata.rows * metadata.columns;
  const bytesPerPixel = metadata.bitsAllocated / 8;
  if (pixelLength < expected * bytesPerPixel) throw new Error('dicom_pixel_data_incomplete');

  const values = new Float32Array(expected);
  for (let index = 0; index < expected; index += 1) {
    const position = pixelOffset + index * bytesPerPixel;
    const raw = metadata.bitsAllocated === 8
      ? (metadata.signed ? view.getInt8(position) : view.getUint8(position))
      : (metadata.signed ? view.getInt16(position, true) : view.getUint16(position, true));
    values[index] = raw * metadata.slope + metadata.intercept;
  }
  return { values, metadata, transferSyntax };
}

function percentiles(values) {
  const stride = Math.max(1, Math.floor(values.length / 120000));
  const sample = [];
  for (let index = 0; index < values.length; index += stride) {
    const value = values[index];
    if (Number.isFinite(value)) sample.push(value);
  }
  if (!sample.length) throw new Error('image_pixels_invalid');
  sample.sort((a, b) => a - b);
  const at = (fraction) => sample[Math.min(sample.length - 1, Math.floor(sample.length * fraction))];
  let low = at(0.005);
  let high = at(0.995);
  if (!(high > low)) {
    low = sample[0];
    high = sample[sample.length - 1];
  }
  if (!(high > low)) high = low + 1;
  return [low, high];
}

function renderDicom(parsed, canvas) {
  const { rows, columns, photometric } = parsed.metadata;
  const scale = Math.min(1, MAX_RENDER_DIMENSION / Math.max(rows, columns));
  const width = Math.max(1, Math.round(columns * scale));
  const height = Math.max(1, Math.round(rows * scale));
  const [low, high] = percentiles(parsed.values);
  const source = document.createElement('canvas');
  source.width = columns;
  source.height = rows;
  const sourceContext = source.getContext('2d', { alpha: false });
  const image = sourceContext.createImageData(columns, rows);
  const invert = photometric === 'MONOCHROME1';
  for (let index = 0; index < parsed.values.length; index += 1) {
    let gray = Math.round((Math.min(high, Math.max(low, parsed.values[index])) - low) / (high - low) * 255);
    if (invert) gray = 255 - gray;
    const out = index * 4;
    image.data[out] = gray;
    image.data[out + 1] = gray;
    image.data[out + 2] = gray;
    image.data[out + 3] = 255;
  }
  sourceContext.putImageData(image, 0, 0);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
  const spacing = parsed.metadata.pixelSpacing;
  const renderedSpacing = spacing ? [spacing[0] / scale, spacing[1] / scale] : null;
  return { width, height, scale, renderedSpacing };
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function looksLikeDicom(file, bytes) {
  const name = file.name.toLowerCase();
  if (/\.(dcm|dicom|dcim)$/.test(name)) return true;
  return bytes.length >= 132 && String.fromCharCode(...bytes.slice(128, 132)) === 'DICM';
}

export async function loadRadiograph(file, canvas) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const imageHash = await sha256Hex(buffer);
  const filenameHash = await sha256Hex(new TextEncoder().encode(file.name));

  if (looksLikeDicom(file, bytes)) {
    const parsed = parseDicom(buffer);
    const rendered = renderDicom(parsed, canvas);
    return {
      width: rendered.width,
      height: rendered.height,
      imageHash,
      filenameHash,
      technical: {
        format: 'dicom',
        rows: parsed.metadata.rows,
        columns: parsed.metadata.columns,
        rendered_rows: rendered.height,
        rendered_columns: rendered.width,
        pixel_spacing_mm: parsed.metadata.pixelSpacing,
        rendered_pixel_spacing_mm: rendered.renderedSpacing,
        calibration_source: parsed.metadata.pixelSpacing ? 'dicom_pixel_spacing' : '',
        manufacturer: parsed.metadata.manufacturer,
        model: parsed.metadata.model,
        photometric: parsed.metadata.photometric,
        bits_stored: parsed.metadata.bitsStored,
        transfer_syntax: parsed.transferSyntax,
      },
    };
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (_) {
    throw new Error('image_format_not_supported');
  }
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  const scale = Math.min(1, MAX_RENDER_DIMENSION / Math.max(originalWidth, originalHeight));
  const width = Math.max(1, Math.round(originalWidth * scale));
  const height = Math.max(1, Math.round(originalHeight * scale));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return {
    width, height, imageHash, filenameHash,
    technical: {
      format: file.type || file.name.split('.').pop()?.toLowerCase() || 'image',
      rows: originalHeight,
      columns: originalWidth,
      rendered_rows: height,
      rendered_columns: width,
      pixel_spacing_mm: null,
      rendered_pixel_spacing_mm: null,
      calibration_source: '',
    },
  };
}
