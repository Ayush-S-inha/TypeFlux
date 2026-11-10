function drawFlashPath(ctx, path, alpha, width) {
  const layers = [
    { color: `rgba(255, 70, 8, ${alpha * 0.42})`, width: width * 4.2, blur: width * 4.5 },
    { color: `rgba(255, 154, 18, ${alpha * 0.92})`, width: width * 1.8, blur: width * 2.2 },
    { color: `rgba(255, 246, 190, ${alpha})`, width: Math.max(1, width * 0.48), blur: width * 0.7 },
  ];

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const layer of layers) {
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let index = 1; index < path.length; index += 1) {
      ctx.lineTo(path[index].x, path[index].y);
    }
    ctx.strokeStyle = layer.color;
    ctx.lineWidth = layer.width;
    ctx.shadowColor = 'rgba(255, 92, 10, 0.95)';
    ctx.shadowBlur = layer.blur;
    ctx.stroke();
  }
  ctx.restore();
}

function drawFlashBolt(ctx, start, end, spread, seed, phase, alpha, width) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 5) return;

  const sideX = -dy / length;
  const sideY = dx / length;
  const segments = Math.max(7, Math.min(15, Math.ceil(length / 24)));
  const path = [start];
  for (let index = 1; index < segments; index += 1) {
    const t = index / segments;
    const wave = Math.sin(seed * 1.71 + phase + index * 2.37) * 0.62
      + Math.sin(seed * 0.83 - phase * 0.7 + index * 4.13) * 0.28;
    const offset = wave * spread * Math.sin(t * Math.PI);
    path.push({
      x: start.x + dx * t + sideX * offset,
      y: start.y + dy * t + sideY * offset,
    });
  }
  path.push(end);
  drawFlashPath(ctx, path, alpha, width);

  const branchIndex = Math.max(2, Math.floor(segments * 0.42));
  const branchStart = path[branchIndex];
  const branchSide = seed % 2 ? 1 : -1;
  const branchEnd = {
    x: branchStart.x + sideX * spread * 1.35 * branchSide + dx / length * spread * 0.34,
    y: branchStart.y + sideY * spread * 1.35 * branchSide + dy / length * spread * 0.34,
  };
  const branch = [
    branchStart,
    {
      x: branchStart.x + sideX * spread * 0.5 * branchSide + dx / length * spread * 0.12,
      y: branchStart.y + sideY * spread * 0.5 * branchSide + dy / length * spread * 0.12,
    },
    branchEnd,
  ];
  drawFlashPath(ctx, branch, alpha * 0.78, width * 0.68);
}

export function drawFlashLightning(ctx, points, now, handKey) {
  if (!Array.isArray(points)) return false;
  for (const index of [0, 5, 9, 13, 17]) {
    if (!Number.isFinite(points[index]?.x) || !Number.isFinite(points[index]?.y)) return false;
  }
  const knuckles = { x: 0, y: 0 };
  for (const index of [5, 9, 13, 17]) {
    knuckles.x += points[index].x / 4;
    knuckles.y += points[index].y / 4;
  }
  const wrist = points[0];
  const acrossX = points[17].x - points[5].x;
  const acrossY = points[17].y - points[5].y;
  const palmWidth = Math.hypot(acrossX, acrossY);
  const forearmX = wrist.x - knuckles.x;
  const forearmY = wrist.y - knuckles.y;
  const forearmLength = Math.hypot(forearmX, forearmY);
  if (palmWidth < 12 || forearmLength < palmWidth * 0.28) return false;

  const axisX = forearmX / forearmLength;
  const axisY = forearmY / forearmLength;
  let sideX = -axisY;
  let sideY = axisX;
  if (sideX * acrossX + sideY * acrossY < 0) {
    sideX = -sideX;
    sideY = -sideY;
  }

  const at = (along, across) => ({
    x: knuckles.x + axisX * along + sideX * across,
    y: knuckles.y + axisY * along + sideY * across,
  });
  const forearmEnd = forearmLength + palmWidth * 1.45;
  let seed = 0;
  for (const character of String(handKey)) seed += character.charCodeAt(0);
  const phase = now * 0.014;
  const flicker = 0.78 + Math.sin(now * 0.031 + seed) * 0.12
    + Math.sin(now * 0.067 + seed * 0.4) * 0.1;
  const alpha = Math.max(0.48, Math.min(1, flicker));
  const spread = palmWidth * 0.2;
  const width = Math.max(1.5, palmWidth * 0.025);

  drawFlashBolt(ctx, at(-palmWidth * 0.28, -palmWidth * 0.53),
    at(forearmEnd, -palmWidth * 0.43), spread, seed + 3, phase, alpha, width);
  drawFlashBolt(ctx, at(-palmWidth * 0.34, palmWidth * 0.53),
    at(forearmEnd * 0.96, palmWidth * 0.44), spread * 1.08, seed + 8, phase + 1.2, alpha, width);
  drawFlashBolt(ctx, at(-palmWidth * 0.48, -palmWidth * 0.25),
    at(forearmLength + palmWidth * 0.88, palmWidth * 0.2), spread * 1.2,
    seed + 13, phase + 2.1, alpha * 0.9, width * 0.82);
  drawFlashBolt(ctx, at(-palmWidth * 0.42, palmWidth * 0.27),
    at(forearmLength + palmWidth * 0.68, -palmWidth * 0.16), spread,
    seed + 18, phase + 2.8, alpha * 0.86, width * 0.78);
  drawFlashBolt(ctx, at(-palmWidth * 0.62, -palmWidth * 0.36),
    at(palmWidth * 0.28, palmWidth * 0.42), spread * 0.72,
    seed + 23, phase + 3.4, alpha, width * 0.86);
  drawFlashBolt(ctx, at(-palmWidth * 0.55, palmWidth * 0.42),
    at(palmWidth * 0.32, -palmWidth * 0.45), spread * 0.7,
    seed + 28, phase + 4.1, alpha * 0.92, width * 0.82);
  return true;
}
