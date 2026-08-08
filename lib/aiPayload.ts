import type { AssistantInput, RouteCommentSegment, RouteGuideAiInput, RouteGuideInput } from './aiTypes';

export const AI_BODY_LIMIT_BYTES = 12_000;
export const AI_ROUTE_SEGMENT_LIMIT = 16;

const compactText = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function redactSensitiveText(value: unknown, max: number) {
  return compactText(value, max)
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[이메일 삭제]')
    .replace(/\b(?:01[016789][ -]?\d{3,4}[ -]?\d{4})\b/g, '[전화번호 삭제]')
    .replace(/\b-?\d{1,3}\.\d{4,}\s*[,/]\s*-?\d{1,3}\.\d{4,}\b/g, '[정밀 좌표 삭제]')
    .replace(/\b(?:AIza|sk-)[A-Za-z0-9_-]{12,}\b/gi, '[비밀값 삭제]')
    .replace(
      /(?:[가-힣A-Za-z0-9]+(?:로|길|대로)\s*\d+(?:-\d+)?|[가-힣]+(?:시|도)\s+[가-힣]+(?:구|군|시)\s+[^,]{1,50}|[가-힣]{2,10}(?:동|읍|면|리)\s*\d{1,5}(?:-\d{1,5})?(?:번지)?|\d{1,5}\s+[A-Za-z][A-Za-z-]*-(?:ro|gil|daero)\b|[A-Za-z][A-Za-z-]*-(?:gu|si|dong|gun)\b)/g,
      '[주소 삭제]',
    );
}

function sameSegment(left: RouteCommentSegment, right: RouteCommentSegment) {
  return left.trafficType === right.trafficType
    && left.label === right.label
    && left.laneName === right.laneName
    && left.startName === right.startName
    && left.endName === right.endName
    && left.congestion === right.congestion;
}

export function compactRouteSegments(segments: RouteCommentSegment[]): RouteCommentSegment[] {
  const result: RouteCommentSegment[] = [];
  for (const raw of segments.slice(0, 80)) {
    const segment: RouteCommentSegment = {
      trafficType: Number(raw.trafficType),
      label: redactSensitiveText(raw.label, 60),
      distance: Math.max(0, Math.round(Number(raw.distance) || 0)),
      sectionTime: Math.max(0, Math.round(Number(raw.sectionTime) || 0)),
      ...(raw.startName ? { startName: redactSensitiveText(raw.startName, 60) } : {}),
      ...(raw.endName ? { endName: redactSensitiveText(raw.endName, 60) } : {}),
      ...(raw.laneName ? { laneName: redactSensitiveText(raw.laneName, 60) } : {}),
      ...(raw.congestion !== undefined && raw.congestion !== null ? { congestion: compactText(raw.congestion, 24) } : {}),
      ...(raw.transfer !== undefined ? { transfer: Boolean(raw.transfer) } : {}),
    };
    const previous = result.at(-1);
    if (previous && sameSegment(previous, segment)) {
      previous.distance += segment.distance;
      previous.sectionTime += segment.sectionTime;
      previous.endName = segment.endName || previous.endName;
    } else {
      result.push(segment);
    }
  }
  if (result.length <= AI_ROUTE_SEGMENT_LIMIT) return result;
  const head = result.slice(0, AI_ROUTE_SEGMENT_LIMIT - 1);
  const rest = result.slice(AI_ROUTE_SEGMENT_LIMIT - 1);
  head.push({
    trafficType: 3,
    label: `기타 ${rest.length}개 구간`,
    distance: rest.reduce((sum, item) => sum + item.distance, 0),
    sectionTime: rest.reduce((sum, item) => sum + item.sectionTime, 0),
  });
  return head;
}

export function safeRouteGuideInput(input: RouteGuideInput): RouteGuideAiInput {
  return {
    commute_type: input.commute_type,
    weather: {
      precipitation_mm_h: input.weather.precipitation_mm_h,
      probability: input.weather.probability,
      condition: compactText(input.weather.condition, 40),
    },
    ...(input.recent_avg_departure_time ? { recent_avg_departure_time: compactText(input.recent_avg_departure_time, 16) } : {}),
    ...(input.recent_avg_arrival_time ? { recent_avg_arrival_time: compactText(input.recent_avg_arrival_time, 16) } : {}),
  };
}

export const AI_ASSISTANT_HISTORY_LIMIT = 3;

export function redactAssistantInput(input: AssistantInput): AssistantInput {
  const question = redactSensitiveText(input.question, 300);
  const history = input.history?.slice(-AI_ASSISTANT_HISTORY_LIMIT).map((turn) => ({
    question: redactSensitiveText(turn.question, 300),
    answer: redactSensitiveText(turn.answer, 250),
  }));
  return {
    question,
    // context를 통째로 펼치면 클라이언트가 (또는 앞으로 바뀔 코드가) 여기에 무엇을 넣어도
    // 그대로 프롬프트에 실려 나간다. 알려진 필드만 명시적으로 골라서 보낸다.
    context: {
      averageMinutes: input.context.averageMinutes,
      variabilityMinutes: input.context.variabilityMinutes,
      lateRate: input.context.lateRate,
      routeMinutes: input.context.routeMinutes,
      weather: input.context.weather ? compactText(input.context.weather, 100) : undefined,
    },
    ...(history?.length ? { history } : {}),
  };
}
