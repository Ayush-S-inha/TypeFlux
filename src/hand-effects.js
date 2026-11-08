function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function normalizeDirection(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 0.0001) return null;
  return { vx: dx / length, vy: dy / length };
}

function palmCenter(points) {
  const palmPoints = [0, 5, 9, 13, 17];
  if (!palmPoints.every((index) => finitePoint(points[index]))) return null;
  return palmPoints.reduce((center, index) => ({
    x: center.x + points[index].x / palmPoints.length,
    y: center.y + points[index].y / palmPoints.length,
  }), { x: 0, y: 0 });
}

export function createSpiderManWebEffect(points) {
  if (!finitePoint(points?.[0]) || !finitePoint(points?.[5]) || !finitePoint(points?.[8])) return null;
  const palm = palmCenter(points);
  const direction = normalizeDirection(points[5], points[8]);
  if (!palm || !direction) return null;

  return {
    type: 'web',
    x: points[0].x * 0.58 + palm.x * 0.42,
    y: points[0].y * 0.58 + palm.y * 0.42,
    ...direction,
    duration: 820,
    flightRatio: 0.52,
  };
}

export function createIronManRepulsorEffects(points) {
  if (!finitePoint(points?.[0]) || !finitePoint(points?.[12])) return [];
  const palm = palmCenter(points);
  const direction = normalizeDirection(points[0], points[12]);
  if (!palm || !direction) return [];

  return [
    {
      type: 'repulsor',
      x: palm.x,
      y: palm.y,
      ...direction,
      duration: 620,
    },
    {
      type: 'repulsor-flash',
      x: palm.x,
      y: palm.y,
      duration: 260,
    },
  ];
}

export function distanceToEdge(x, y, vx, vy, screenWidth, screenHeight) {
  const distances = [];
  if (vx > 0.0001) distances.push((screenWidth - x) / vx);
  else if (vx < -0.0001) distances.push(-x / vx);
  if (vy > 0.0001) distances.push((screenHeight - y) / vy);
  else if (vy < -0.0001) distances.push(-y / vy);

  const validDistances = distances.filter((distance) => distance >= 0);
  return validDistances.length
    ? Math.min(...validDistances)
    : Math.hypot(screenWidth, screenHeight);
}

export function drawSpiderManWeb(ctx, effect, progress, reach) {
  const flightRatio = effect.flightRatio || 0.52;
  const flight = Math.min(1, progress / flightRatio);
  const travel = 1 - Math.pow(1 - flight, 3);
  const fade = progress <= flightRatio
    ? 1
    : Math.max(0, 1 - (progress - flightRatio) / (1 - flightRatio));
  const length = reach * travel;
  if (length < 2 || fade <= 0) return;

  const sideX = -effect.vy;
  const sideY = effect.vx;
  const segments = Math.max(4, Math.min(72, Math.ceil(length / 12)));
  const strandPoint = (t) => {
    const sway = Math.sin(t * Math.PI * 5) * 2.1 * Math.sin(t * Math.PI);
    return {
      x: effect.x + effect.vx * length * t + sideX * sway,
      y: effect.y + effect.vy * length * t + sideY * sway,
    };
  };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(169, 225, 255, .85)';
  ctx.shadowBlur = 11;
  ctx.strokeStyle = `rgba(147, 211, 255, ${0.45 * fade})`;
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(effect.x, effect.y);
  for (let step = 1; step <= segments; step += 1) {
    const point = strandPoint(step / segments);
    ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();

  ctx.shadowBlur = 3;
  for (const offset of [-1.1, 1.1]) {
    ctx.beginPath();
    for (let step = 0; step <= segments; step += 1) {
      const point = strandPoint(step / segments);
      const x = point.x + sideX * offset;
      const y = point.y + sideY * offset;
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(245, 251, 255, ${0.9 * fade})`;
    ctx.lineWidth = offset < 0 ? 1.25 : 0.8;
    ctx.stroke();
  }

  const threadCount = Math.min(24, Math.floor(length / 27));
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(195, 235, 255, ${0.72 * fade})`;
  ctx.lineWidth = 0.75;
  for (let index = 1; index <= threadCount; index += 1) {
    const t = index / (threadCount + 1);
    const point = strandPoint(t);
    const spread = 2.5 + t * 2.8;
    const tilt = index % 2 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(point.x - sideX * spread, point.y - sideY * spread);
    ctx.lineTo(point.x + sideX * spread + effect.vx * tilt * 2,
      point.y + sideY * spread + effect.vy * tilt * 2);
    ctx.stroke();
  }

  const head = strandPoint(1);
  ctx.shadowColor = 'rgba(190, 238, 255, .95)';
  ctx.shadowBlur = 14;
  ctx.fillStyle = `rgba(255, 255, 255, ${0.95 * fade})`;
  ctx.beginPath();
  ctx.arc(head.x, head.y, 2.2 + (1 - travel) * 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 8;
  ctx.fillStyle = `rgba(227, 248, 255, ${0.8 * fade})`;
  ctx.beginPath();
  ctx.arc(effect.x, effect.y, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawIronManRepulsor(ctx, effect, progress, screenWidth, screenHeight) {
  const reach = 24 + progress * Math.hypot(screenWidth, screenHeight) * 0.8;
  const endX = effect.x + effect.vx * reach;
  const endY = effect.y + effect.vy * reach;
  ctx.save();
  ctx.lineCap = 'round';
  const gradient = ctx.createLinearGradient(effect.x, effect.y, endX, endY);
  gradient.addColorStop(0, `rgba(255, 255, 255, ${(1 - progress) * 0.98})`);
  gradient.addColorStop(0.16, `rgba(112, 224, 255, ${(1 - progress) * 0.98})`);
  gradient.addColorStop(1, 'rgba(92, 145, 255, 0)');
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 9 * (1 - progress) + 1.5;
  ctx.shadowColor = 'rgba(98, 210, 255, .98)';
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.moveTo(effect.x, effect.y);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.restore();
}

export function drawIronManRepulsorFlash(ctx, effect, progress) {
  const radius = 8 + progress * 24;
  ctx.save();
  const glow = ctx.createRadialGradient(effect.x, effect.y, 0, effect.x, effect.y, radius * 1.6);
  glow.addColorStop(0, `rgba(255, 255, 255, ${(1 - progress) * 0.95})`);
  glow.addColorStop(0.28, `rgba(140, 235, 255, ${(1 - progress) * 0.8})`);
  glow.addColorStop(1, 'rgba(86, 155, 255, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(effect.x, effect.y, radius * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
