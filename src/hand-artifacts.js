import { distance2D } from './landmark-geometry.js';

function drawTextEllipseRing(ctx, cx, cy, radiusX, radiusY, pattern, fontSize, color, startAngle = 0) {
  const characters = Array.from(pattern);
  if (!characters.length) return;

  const perimeter = Math.PI * (3 * (radiusX + radiusY)
    - Math.sqrt((3 * radiusX + radiusY) * (radiusX + 3 * radiusY)));
  const glyphCount = Math.max(characters.length, Math.floor(perimeter / (fontSize * 0.66)));

  ctx.save();
  ctx.font = `600 ${fontSize}px "Segoe UI Symbol", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(255, 205, 48, 0.2)';
  ctx.shadowBlur = 2;

  for (let index = 0; index < glyphCount; index += 1) {
    const angle = startAngle + (index / glyphCount) * Math.PI * 2;
    const x = cx + Math.cos(angle) * radiusX;
    const y = cy + Math.sin(angle) * radiusY;
    const tangentX = -radiusX * Math.sin(angle);
    const tangentY = radiusY * Math.cos(angle);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(tangentY, tangentX));
    ctx.fillText(characters[index % characters.length], 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

export function drawSudarshanChakra(ctx, indexTip, handPoints, landmarks, previousRadius, now) {
  // Screen-space palm size provides a natural distance cue; relative MediaPipe
  // depth adds a modest boost when the pointing fingertip moves toward camera.
  const palmWidth = distance2D(handPoints[5], handPoints[17]);
  const wristDepth = landmarks?.[0]?.z;
  const tipDepth = landmarks?.[8]?.z;
  const depthDelta = Number.isFinite(wristDepth) && Number.isFinite(tipDepth)
    ? Math.max(0, wristDepth - tipDepth)
    : 0;
  const depthBoost = 1 + Math.min(0.28, depthDelta * 1.1);
  const targetRadius = Math.min(275, Math.max(118, palmWidth * 1.72) * depthBoost);
  const priorRadius = previousRadius ?? targetRadius;
  const radiusX = priorRadius + (targetRadius - priorRadius) * 0.2;

  const radiusY = radiusX * 0.285;
  const centerX = indexTip.x;
  const centerY = indexTip.y - radiusY * 0.68;
  const fontSize = Math.max(9, radiusX * 0.073);
  const rotation = now * 0.00115;

  // The chakra remains anchored to the fingertip. Only its text rings rotate;
  // there is no launch, travelling projectile, pulse, or fade animation.
  drawTextEllipseRing(ctx, centerX, centerY, radiusX, radiusY,
    '✦ · ॐ · ✦ · ◆ · ✦ · ॐ · ✦ ·', fontSize * 0.92, '#ffe98a', rotation);
  drawTextEllipseRing(ctx, centerX, centerY, radiusX * 0.93, radiusY * 0.83,
    '▲ ◆ ▲ ◆ ▲ ◆ ▲ ◆', fontSize * 0.78, '#ffbd26', -rotation * 1.18);
  drawTextEllipseRing(ctx, centerX, centerY, radiusX * 0.79, radiusY * 0.68,
    'SUDARSHAN • CHAKRA •', fontSize * 0.75, '#ffd23f', rotation * 0.78);
  drawTextEllipseRing(ctx, centerX, centerY, radiusX * 0.63, radiusY * 0.55,
    'ॐ • ✦ • ॐ • ✦ •', fontSize * 0.76, '#fff0a1', -rotation * 1.45);
  drawTextEllipseRing(ctx, centerX, centerY, radiusX * 0.45, radiusY * 0.4,
    '◆ · ॐ · ◆ · ॐ ·', fontSize * 0.62, '#ffcf4a', rotation * 1.05);

  // Twelve text-built blades create a clearer radial silhouette while keeping
  // the entire effect typographic rather than drawing a vector disc.
  const bladeGlyphs = ['❯', '◆', '✦'];
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd13e';
  ctx.shadowColor = 'rgba(255, 198, 45, 0.32)';
  ctx.shadowBlur = 5;
  for (let blade = 0; blade < 12; blade += 1) {
    const angle = rotation + (blade / 12) * Math.PI * 2;
    for (let step = 0; step < bladeGlyphs.length; step += 1) {
      const ratio = 0.48 + step * 0.105;
      const x = centerX + Math.cos(angle) * radiusX * ratio;
      const y = centerY + Math.sin(angle) * radiusY * ratio;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle + Math.PI / 2);
      ctx.font = `700 ${fontSize * (step === 1 ? 1.05 : 0.82)}px "Segoe UI Symbol", Arial, sans-serif`;
      ctx.fillText(bladeGlyphs[step], 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();

  ctx.save();
  ctx.font = `700 ${fontSize * 1.25}px "Segoe UI Symbol", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff4b2';
  ctx.shadowColor = 'rgba(255, 224, 110, 0.3)';
  ctx.shadowBlur = 7;
  ctx.fillText('ॐ', centerX, centerY);
  ctx.restore();
  return radiusX;
}

export function drawGreenLanternRing(ctx, points) {
  const mcp = points[9];
  const pip = points[10];
  const palmWidth = distance2D(points[5], points[17]);
  const fingerSpan = distance2D(points[9], points[13]);
  const fingerWidth = Math.min(palmWidth * 0.24, fingerSpan * 0.5);
  if (fingerWidth < 7 || distance2D(mcp, pip) < 8) return false;

  const axisX = pip.x - mcp.x;
  const axisY = pip.y - mcp.y;
  const angle = Math.atan2(axisY, axisX);
  const center = {
    x: mcp.x + axisX * 0.34,
    y: mcp.y + axisY * 0.34,
  };
  const faceWidth = fingerWidth * 1.42;
  const faceHeight = fingerWidth * 1.72;
  const halfWidth = faceWidth / 2;
  const halfHeight = faceHeight / 2;
  const rim = fingerWidth * 0.075;
  const corner = fingerWidth * 0.09;
  const coreRadius = faceWidth * 0.285;

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(angle + Math.PI / 2);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const bandMetal = ctx.createLinearGradient(-fingerWidth * 0.55, 0, fingerWidth * 0.55, 0);
  bandMetal.addColorStop(0, '#303735');
  bandMetal.addColorStop(0.2, '#aeb9b0');
  bandMetal.addColorStop(0.43, '#e8eee5');
  bandMetal.addColorStop(0.62, '#727c75');
  bandMetal.addColorStop(0.82, '#d6ded3');
  bandMetal.addColorStop(1, '#343b36');

  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = fingerWidth * 0.22;
  ctx.beginPath();
  ctx.ellipse(0, faceHeight * 0.31, fingerWidth * 0.55, fingerWidth * 0.25, 0, 0, Math.PI * 2);
  ctx.strokeStyle = '#202824';
  ctx.lineWidth = fingerWidth * 0.2;
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.ellipse(0, faceHeight * 0.31, fingerWidth * 0.53, fingerWidth * 0.23, 0, 0, Math.PI * 2);
  ctx.strokeStyle = bandMetal;
  ctx.lineWidth = fingerWidth * 0.13;
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(0, faceHeight * 0.31, fingerWidth * 0.53, fingerWidth * 0.23, 0, Math.PI * 0.13, Math.PI * 0.87);
  ctx.strokeStyle = 'rgba(248, 255, 244, 0.82)';
  ctx.lineWidth = fingerWidth * 0.025;
  ctx.stroke();

  ctx.shadowColor = 'rgba(0, 0, 0, 0.62)';
  ctx.shadowBlur = fingerWidth * 0.2;
  ctx.fillStyle = '#252e29';
  ctx.strokeStyle = '#d5ded2';
  ctx.lineWidth = fingerWidth * 0.075;
  ctx.beginPath();
  ctx.moveTo(-halfWidth + corner, -halfHeight);
  ctx.lineTo(halfWidth - corner, -halfHeight);
  ctx.lineTo(halfWidth, -halfHeight + corner);
  ctx.lineTo(halfWidth, halfHeight - corner);
  ctx.lineTo(halfWidth - corner, halfHeight);
  ctx.lineTo(-halfWidth + corner, halfHeight);
  ctx.lineTo(-halfWidth, halfHeight - corner);
  ctx.lineTo(-halfWidth, -halfHeight + corner);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  const plate = ctx.createLinearGradient(-halfWidth, -halfHeight, halfWidth, halfHeight);
  plate.addColorStop(0, '#0b4928');
  plate.addColorStop(0.28, '#087b36');
  plate.addColorStop(0.58, '#003e20');
  plate.addColorStop(0.82, '#087331');
  plate.addColorStop(1, '#002c19');
  ctx.fillStyle = plate;
  ctx.strokeStyle = '#142d20';
  ctx.lineWidth = fingerWidth * 0.035;
  ctx.beginPath();
  ctx.moveTo(-halfWidth + rim, -halfHeight + rim);
  ctx.lineTo(halfWidth - rim, -halfHeight + rim);
  ctx.lineTo(halfWidth - rim, halfHeight - rim);
  ctx.lineTo(-halfWidth + rim, halfHeight - rim);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const railWidth = faceWidth * 0.19;
  const railTop = -halfHeight + rim * 1.45;
  const railBottom = halfHeight - rim * 1.45;
  const railInset = fingerWidth * 0.055;
  const railGreen = ctx.createLinearGradient(-halfWidth, 0, halfWidth, 0);
  railGreen.addColorStop(0, '#06451f');
  railGreen.addColorStop(0.18, '#7cff78');
  railGreen.addColorStop(0.38, '#20e94e');
  railGreen.addColorStop(0.62, '#087e2d');
  railGreen.addColorStop(0.84, '#50f56a');
  railGreen.addColorStop(1, '#063d20');

  for (const side of [-1, 1]) {
    const railX = side * (halfWidth - rim - railWidth / 2 - railInset * 0.2);
    ctx.fillStyle = '#052d1a';
    ctx.strokeStyle = '#78e88a';
    ctx.lineWidth = fingerWidth * 0.025;
    ctx.beginPath();
    ctx.moveTo(railX - railWidth / 2, railTop + corner * 0.35);
    ctx.lineTo(railX + railWidth / 2, railTop + corner * 0.35);
    ctx.lineTo(railX + railWidth / 2, railBottom - corner * 0.35);
    ctx.lineTo(railX - railWidth / 2, railBottom - corner * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = railGreen;
    ctx.beginPath();
    ctx.moveTo(railX - railWidth * 0.34, railTop + railInset);
    ctx.lineTo(railX + railWidth * 0.34, railTop + railInset);
    ctx.lineTo(railX + railWidth * 0.34, railBottom - railInset);
    ctx.lineTo(railX - railWidth * 0.34, railBottom - railInset);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(220, 255, 206, 0.76)';
    ctx.lineWidth = fingerWidth * 0.025;
    ctx.beginPath();
    ctx.moveTo(railX - railWidth * 0.2, railTop + railInset * 1.5);
    ctx.lineTo(railX - railWidth * 0.2, railBottom - railInset * 1.5);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 36, 16, 0.72)';
    ctx.lineWidth = fingerWidth * 0.025;
    ctx.beginPath();
    ctx.moveTo(railX + railWidth * 0.23, railTop + railInset * 1.5);
    ctx.lineTo(railX + railWidth * 0.23, railBottom - railInset * 1.5);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(0, 0, coreRadius * 1.22, 0, Math.PI * 2);
  ctx.fillStyle = '#032d1a';
  ctx.fill();
  ctx.strokeStyle = '#86c88c';
  ctx.lineWidth = fingerWidth * 0.055;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, coreRadius * 1.08, 0, Math.PI * 2);
  ctx.strokeStyle = '#27b64c';
  ctx.lineWidth = fingerWidth * 0.045;
  ctx.stroke();

  const gem = ctx.createRadialGradient(
    -coreRadius * 0.28,
    -coreRadius * 0.34,
    coreRadius * 0.04,
    0,
    0,
    coreRadius * 0.98,
  );
  gem.addColorStop(0, '#e0ffd0');
  gem.addColorStop(0.12, '#9bff83');
  gem.addColorStop(0.34, '#28ef4d');
  gem.addColorStop(0.68, '#009b36');
  gem.addColorStop(1, '#003d20');
  ctx.shadowColor = 'rgba(29, 255, 71, 0.9)';
  ctx.shadowBlur = fingerWidth * 0.28;
  ctx.beginPath();
  ctx.arc(0, 0, coreRadius * 0.91, 0, Math.PI * 2);
  ctx.fillStyle = gem;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = 'rgba(194, 255, 177, 0.78)';
  ctx.lineWidth = fingerWidth * 0.018;
  for (const scale of [0.28, 0.48, 0.68]) {
    ctx.beginPath();
    ctx.arc(0, 0, coreRadius * scale, -Math.PI * 0.18, Math.PI * 1.82);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(-coreRadius * 0.27, -coreRadius * 0.32, coreRadius * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(240, 255, 224, 0.88)';
  ctx.fill();

  ctx.strokeStyle = 'rgba(230, 255, 218, 0.78)';
  ctx.lineWidth = fingerWidth * 0.022;
  ctx.beginPath();
  ctx.moveTo(-halfWidth + rim, -halfHeight + rim * 0.65);
  ctx.lineTo(halfWidth - rim, -halfHeight + rim * 0.65);
  ctx.stroke();

  ctx.restore();
  return true;
}
