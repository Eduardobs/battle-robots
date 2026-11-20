import { WIDTH, HEIGHT, EDGE, RADIUS } from './battle.js';
import { pilots } from './catalog.js';
import { damageFormat, t } from './i18n.js';

const dropSymbols = { health: '+', attribute: '↑', teleport: '↯' };

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const backdrop = document.createElement('canvas');
  backdrop.width = WIDTH;
  backdrop.height = HEIGHT;
  const ground = backdrop.getContext('2d', { alpha: false });
  let paintedWalls;

  const rect = (pen, fill, x, y, w, h) => {
    pen.fillStyle = fill;
    pen.fillRect(x, y, w, h);
  };
  const line = (pen, color, width, a, b) => {
    pen.strokeStyle = color;
    pen.lineWidth = width;
    pen.beginPath();
    pen.moveTo(a.x, a.y);
    pen.lineTo(b.x, b.y);
    pen.stroke();
  };
  const circle = (pen, color, x, y, radius, width = 0) => {
    pen.beginPath();
    pen.arc(x, y, radius, 0, Math.PI * 2);
    if (width) {
      pen.strokeStyle = color;
      pen.lineWidth = width;
      pen.stroke();
    } else {
      pen.fillStyle = color;
      pen.fill();
    }
  };

  function drawSpikes({ x, y, w, h }) {
    rect(ground, '#3c2524', x, y, w, h);
    ground.strokeStyle = '#a05a49';
    ground.lineWidth = 1;
    ground.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    const columns = Math.floor(w / 10);
    const rows = Math.floor(h / 10);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const cx = x + (col + 0.5) * w / columns;
        const cy = y + (row + 0.5) * h / rows;
        ground.fillStyle = '#edb29b';
        ground.beginPath();
        ground.moveTo(cx, cy - 4);
        ground.lineTo(cx - 3.5, cy + 3);
        ground.lineTo(cx + 3.5, cy + 3);
        ground.fill();
        ground.fillStyle = '#ac6b59';
        ground.beginPath();
        ground.moveTo(cx, cy - 4);
        ground.lineTo(cx, cy + 3);
        ground.lineTo(cx + 3.5, cy + 3);
        ground.fill();
      }
    }
  }

  function drawGround(state) {
    rect(ground, '#171a1c', 0, 0, WIDTH, HEIGHT);
    for (let x = 24; x < WIDTH; x += 24) {
      line(ground, x % 96 ? '#202528' : '#2a3033', 1, { x, y: 0 }, { x, y: HEIGHT });
    }
    for (let y = 24; y < HEIGHT; y += 24) {
      line(ground, y % 96 ? '#202528' : '#2a3033', 1, { x: 0, y }, { x: WIDTH, y });
    }
    circle(ground, '#333b37', WIDTH / 2, HEIGHT / 2, 95, 2);
    circle(ground, '#292f2c', WIDTH / 2, HEIGHT / 2, 79, 1);
    for (const [id, x] of [71, WIDTH - 71].entries()) {
      circle(ground, pilots[id].color + '55', x, HEIGHT / 2, 32, 2);
      circle(ground, pilots[id].color + '22', x, HEIGHT / 2, 42, 1);
    }
    for (const puddle of state.mud) {
      ground.save();
      ground.translate(puddle.x, puddle.y);
      ground.scale(puddle.rx, puddle.ry);
      ground.beginPath();
      for (let point = 0; point <= 40; point++) {
        const angle = point / 40 * Math.PI * 2;
        const edge = 0.96 + Math.sin(angle * 5) * 0.04 + Math.cos(angle * 7) * 0.03;
        ground.lineTo(Math.cos(angle) * edge, Math.sin(angle) * edge);
      }
      ground.fillStyle = '#493925';
      ground.fill();
      ground.restore();
      for (let i = 0; i < 12; i++) {
        const phase = i * 2.399;
        const x = puddle.x + Math.cos(phase) * puddle.rx * 0.70;
        const y = puddle.y + Math.sin(phase) * puddle.ry * 0.60;
        line(ground, i % 2 ? '#655038' : '#53412a', 2, { x, y }, { x: x + 8, y });
      }
    }
    state.spikePatches.forEach(drawSpikes);
    state.spikeRim.forEach(drawSpikes);
    for (const { x, y, w, h } of state.walls) {
      rect(ground, '#0c0e10', x + 4, y + 5, w, h);
      rect(ground, '#525b5e', x, y, w, h);
      rect(ground, '#343a3d', x + 3, y + 3, w - 6, h - 6);
      rect(ground, '#202628', x + 8, y + 8, w - 16, h - 16);
      ground.save();
      ground.beginPath();
      ground.rect(x + 8, y + 8, w - 16, h - 16);
      ground.clip();
      for (let offset = -h; offset < w; offset += 13) {
        line(ground, '#332f21', 5, { x: x + offset, y: y + h }, { x: x + offset + h, y });
      }
      ground.restore();
      for (const px of [x + 5, x + w - 5]) {
        for (const py of [y + 5, y + h - 5]) circle(ground, '#92968d', px, py, 1.5);
      }
    }
    for (const [x, y, w, h] of [[0, 0, WIDTH, EDGE], [0, HEIGHT - EDGE, WIDTH, EDGE],
      [0, EDGE, EDGE, HEIGHT - EDGE * 2], [WIDTH - EDGE, EDGE, EDGE, HEIGHT - EDGE * 2]]) {
      rect(ground, '#101214', x, y, w, h);
      ground.save();
      ground.beginPath();
      ground.rect(x + 2, y + 2, w - 4, h - 4);
      ground.clip();
      for (let offset = -h; offset < w; offset += 20) {
        line(ground, '#635525', 7, { x: x + offset, y: y + h }, { x: x + offset + h, y });
      }
      ground.restore();
    }
  }

  function drawRobot(robot, time) {
    const pilot = pilots[robot.id];
    const active = key => robot.utils.some(item => item.key === key && item.until > time);
    ctx.save();
    ctx.translate(robot.x, robot.y);
    if (active('shield')) {
      circle(ctx, '#74e2ff22', 0, 0, 29);
      circle(ctx, '#74e2ffbb', 0, 0, 29, 2);
      circle(ctx, '#74e2ff44', 0, 0, 33 + Math.sin(time * 9) * 2, 1);
    }
    ctx.rotate(robot.angle);
    if (active('nitro')) {
      const trail = 25 + Math.sin(time * 37) * 5;
      for (const y of [-7, 7]) {
        line(ctx, '#76ecff85', 4, { x: -12, y }, { x: -trail, y });
        line(ctx, '#ccfaff', 1.5, { x: -13, y }, { x: -trail, y });
      }
    }
    for (const y of [-16, 10]) {
      rect(ctx, '#090b0c', -16, y, 33, 7);
      const treadOffset = robot.moving ? (time * 35) % 5 : 0;
      for (let x = -14; x < 12; x += 5) rect(ctx, '#434a4c', x + treadOffset, y + 1, 2, 5);
    }
    rect(ctx, '#0a0d0e', -16, -11, 32, 23);
    rect(ctx, pilot.color, -14, -9, 26, 18);
    rect(ctx, '#2b3033', -10, -6, 19, 12);
    rect(ctx, pilot.ink, -12, -8, 21, 1);
    rect(ctx, '#191c1e', -8, -4, 9, 8);
    for (const y of [-3, 0, 3]) rect(ctx, '#50585b', -7, y, 6, 1);
    rect(ctx, pilot.color, 6, -4, 14, 8);
    rect(ctx, '#14191c', 9, -2, 8, 4);
    rect(ctx, '#eff9eb', 17, -3, 3, 6);
    if (robot.burns.length) {
      for (let index = 0; index < 5; index++) {
        const angle = time * 5 + index * 2.1;
        circle(ctx, index % 2 ? '#ff963a' : '#ffd27c', Math.sin(angle) * 17,
          Math.cos(angle) * 14, 1.6 + index * 0.2);
      }
    }
    ctx.restore();
  }

  function drawEffect(event, state) {
    const progress = (state.time - event.start) / (event.end - event.start);
    const { kind, from, to } = event;
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    if (kind === 'hit') {
      circle(ctx, '#ffc176', from.x, from.y, 18 + progress * 8, 2);
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe1a0';
      ctx.fillText(`−${damageFormat.format(event.amount)}`, from.x + 16, from.y - 15 - progress * 16);
    } else if (kind === 'dodge') {
      circle(ctx, '#a8efff', from.x, from.y, 20 + progress * 10, 2);
    } else if (kind === 'tether') {
      const source = state.robots[event.attached];
      const target = event.victim === undefined ? to : state.robots[event.victim];
      line(ctx, '#dee4de', 2, source, target);
      circle(ctx, '#fff0a9', target.x, target.y, 4, 2);
    } else if (kind === 'echo' || kind === 'echoBlast') {
      ctx.globalAlpha = kind === 'echo' ? 0.55 + progress * 0.45 : 1 - progress;
      circle(ctx, '#ff83e8', to.x, to.y, event.radius, 2);
      circle(ctx, '#ff83e8', to.x, to.y, Math.max(1, progress * event.radius), 3);
    } else if (kind === 'beaconReturn') {
      line(ctx, '#82eeff', 3, from, to);
      circle(ctx, '#82eeff', to.x, to.y, 10 + progress * 20, 2);
    } else {
      const contact = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      circle(ctx, kind === 'saw' ? '#e8e5cf' : '#ffaf65', contact.x, contact.y, 5 + progress * 11, 3);
      line(ctx, '#eee1a8', kind === 'hammer' ? 7 : 3, from, contact);
    }
    ctx.restore();
  }

  function drawProjectile(shot) {
    const { key, x, y, from } = shot;
    if (key === 'hook') {
      line(ctx, '#dee4de', 2, shot.robot, shot);
      circle(ctx, '#fff0a9', x, y, 4, 2);
    } else if (key === 'disc') {
      circle(ctx, '#e2ff96', x, y, 6, 2);
      circle(ctx, '#fff5c8', x, y, 2);
    } else if (key === 'nitrogen') {
      circle(ctx, '#9ceaff88', x, y, 7);
      circle(ctx, '#dcfaff', x, y, 3);
    } else if (key === 'pulse') {
      circle(ctx, '#82eeff', x, y, 8, 2);
    } else {
      const flame = key === 'flame';
      const span = Math.hypot(x - from.x, y - from.y);
      const scale = span > 0 ? Math.min(1, (flame ? 14 : 24) / span) : 0;
      const tail = { x: x + (from.x - x) * scale, y: y + (from.y - y) * scale };
      line(ctx, flame ? '#ff963a' : '#e8fb9b', flame ? 8 : 2, tail, shot);
      circle(ctx, flame ? '#ffd57e' : '#e7fdba', x, y, flame ? 5 : 3);
    }
  }

  function drawHP(robot, { x, y }, scale) {
    const ratio = Math.max(0, robot.hp / robot.stats.hp);
    const value = ratio > 0 ? Math.max(1, Math.round(ratio * 100)) : 0;
    const pilot = pilots[robot.id];
    rect(ctx, '#0c0f10', x - 32 * scale, y - 7 * scale, 64 * scale, 19 * scale);
    rect(ctx, '#30363a', x - 28 * scale, y + 5 * scale, 56 * scale, 4 * scale);
    rect(ctx, pilot.color, x - 28 * scale, y + 5 * scale, 56 * ratio * scale, 4 * scale);
    ctx.font = `bold ${12 * scale}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = pilot.ink;
    ctx.fillText(`${value}%`, x, y + 3 * scale);
  }

  return function render(state) {
    if (state.walls !== paintedWalls) {
      drawGround(state);
      paintedWalls = state.walls;
    }
    ctx.drawImage(backdrop, 0, 0);
    for (const drop of state.drops) {
      const pulse = 16 + 2 * Math.sin(state.time * 5);
      circle(ctx, '#dbfb4866', drop.x, drop.y, pulse, 2);
      rect(ctx, '#dbfb48', drop.x - 10, drop.y - 10, 20, 20);
      ctx.fillStyle = '#182015';
      ctx.textAlign = 'center';
      ctx.font = 'bold 18px monospace';
      ctx.fillText(dropSymbols[drop.type] ?? t(`dropSymbol.${drop.type}`), drop.x, drop.y + 6);
    }
    for (const robot of state.robots) {
      const color = pilots[robot.id].ink;
      for (const tool of robot.utils) {
        if (tool.until <= state.time) continue;
        if (tool.key === 'beacon') {
          circle(ctx, color, tool.anchor.x, tool.anchor.y, 13, 2);
          circle(ctx, color, tool.anchor.x, tool.anchor.y, 4);
        } else if (tool.key === 'hologram') {
          ctx.save();
          ctx.globalAlpha = 0.42;
          drawRobot({ ...robot, ...tool.decoy, angle: tool.heading, utils: [] }, state.time);
          ctx.restore();
        } else if (tool.key === 'treads') {
          circle(ctx, color, robot.x, robot.y, 22, 2);
        }
      }
      drawRobot(robot, state.time);
    }
    state.projectiles.forEach(drawProjectile);
    state.effects.forEach(event => drawEffect(event, state));
    const scale = Math.max(1, WIDTH * 0.83 / Math.max(canvas.clientWidth, 250));
    const inset = EDGE + 33 * scale;
    const labels = state.robots.map(robot => ({
      x: Math.max(inset, Math.min(WIDTH - inset, robot.x)),
      y: Math.max(7 * scale, robot.y - RADIUS - 18 * scale),
    }));
    if (Math.abs(labels[0].x - labels[1].x) < 68 * scale &&
        Math.abs(labels[0].y - labels[1].y) < 21 * scale) {
      const top = labels[0].y <= labels[1].y ? 0 : 1;
      const raised = labels[1 - top].y - 21 * scale;
      if (raised >= 7 * scale) labels[top].y = raised;
      else labels[1 - top].y = labels[top].y + 21 * scale;
    }
    state.robots.forEach((robot, id) => drawHP(robot, labels[id], scale));
  };
}
