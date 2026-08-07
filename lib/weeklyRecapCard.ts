import type { PeriodStats } from './stats';
import type { PetDefinition } from './petCatalog';
import type { CharacterStage } from './characterStages';

export interface WeeklyRecapData {
  rangeLabel: string;
  petName: string;
  petColor: string;
  petSoftColor: string;
  stageName: string;
  level: number;
  commuteCount: number;
  roundTripDays: number;
  lateRate: number | null;
  avgCommuteDuration: number | null;
  weeklyExp: number;
}

export function buildWeeklyRecapData(stats: PeriodStats, pet: PetDefinition, stage: CharacterStage, level: number): WeeklyRecapData {
  const weeklyExp = stats.monthRecords.reduce((sum, record) => sum + (record.exp_gained || 0), 0);
  return {
    rangeLabel: stats.range.label,
    petName: pet.name,
    petColor: pet.color,
    petSoftColor: pet.softColor,
    stageName: pet.stageNames[stage],
    level,
    commuteCount: stats.commuteArrivals.length,
    roundTripDays: stats.roundTripDays,
    lateRate: stats.lateRate,
    avgCommuteDuration: stats.avgCommuteDuration,
    weeklyExp,
  };
}

const CARD_WIDTH = 720;
const CARD_HEIGHT = 960;
const FONT_FAMILY = "'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

export function drawWeeklyRecapCard(canvas: HTMLCanvasElement, data: WeeklyRecapData) {
  const scale = 2;
  canvas.width = CARD_WIDTH * scale;
  canvas.height = CARD_HEIGHT * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);

  const gradient = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  gradient.addColorStop(0, data.petSoftColor);
  gradient.addColorStop(1, '#ffffff');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.fillStyle = '#64748b';
  ctx.font = `600 22px ${FONT_FAMILY}`;
  ctx.fillText('출퇴근전쟁봇 · 주간 리캡', 48, 72);
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 30px ${FONT_FAMILY}`;
  ctx.fillText(data.rangeLabel, 48, 112);

  ctx.beginPath();
  ctx.arc(CARD_WIDTH / 2, 240, 96, 0, Math.PI * 2);
  ctx.fillStyle = data.petColor;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 40px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillText(`Lv.${data.level}`, CARD_WIDTH / 2, 250);

  ctx.fillStyle = '#0f172a';
  ctx.font = `700 32px ${FONT_FAMILY}`;
  ctx.fillText(`${data.petName} · ${data.stageName}`, CARD_WIDTH / 2, 380);
  ctx.textAlign = 'left';

  const stats = [
    { label: '출근 완료', value: `${data.commuteCount}건` },
    { label: '왕복 완주', value: `${data.roundTripDays}일` },
    { label: '지각률', value: data.lateRate === null ? '-' : `${data.lateRate}%` },
    { label: '평균 출근', value: data.avgCommuteDuration === null ? '-' : `${data.avgCommuteDuration}분` },
  ];
  const gridTop = 460;
  const cellWidth = (CARD_WIDTH - 96) / 2;
  const cellHeight = 140;
  stats.forEach((stat, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 48 + col * cellWidth;
    const y = gridTop + row * (cellHeight + 24);
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x, y, cellWidth - 16, cellHeight, 20);
    ctx.fill();
    ctx.fillStyle = '#64748b';
    ctx.font = `600 20px ${FONT_FAMILY}`;
    ctx.fillText(stat.label, x + 28, y + 44);
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 40px ${FONT_FAMILY}`;
    ctx.fillText(stat.value, x + 28, y + 96);
  });

  const footerY = gridTop + 2 * (cellHeight + 24) + 16;
  ctx.fillStyle = data.petColor;
  roundRect(ctx, 48, footerY, CARD_WIDTH - 96, 88, 20);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 26px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillText(`이번 주 획득 EXP +${data.weeklyExp}`, CARD_WIDTH / 2, footerY + 56);

  ctx.fillStyle = '#94a3b8';
  ctx.font = `500 16px ${FONT_FAMILY}`;
  ctx.fillText('commute-battle.vercel.app', CARD_WIDTH / 2, CARD_HEIGHT - 32);
  ctx.textAlign = 'left';
}
