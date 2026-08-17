import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

// 채널마다 1:1 음성 통화(허들)를 엽니다. 미디어는 브라우저끼리 직접(WebRTC) 주고받고,
// 연결에 필요한 신호만 Supabase Realtime broadcast로 전달합니다. 서버 비용이 들지 않는 대신
// 대칭형 NAT처럼 STUN만으로 뚫리지 않는 회선에서는 연결이 실패할 수 있습니다(TURN 서버 미사용).

export type HuddleStatus = 'connecting' | 'waiting' | 'calling' | 'connected' | 'failed' | 'ended';

export interface HuddleCallbacks {
  onStatus: (status: HuddleStatus) => void;
  onRemoteStream: (stream: MediaStream | null) => void;
  onRemoteVideo: (active: boolean) => void;
  onPeerName: (name: string | null) => void;
  onError: (message: string) => void;
}

export interface HuddleSession {
  toggleMic: () => boolean;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
  leave: () => Promise<void>;
}

interface SignalPayload {
  from: string;
  to?: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  share?: boolean;
  bye?: boolean;
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

export function huddleSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof RTCPeerConnection !== 'undefined';
}

export function screenShareSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia);
}

// 한 브라우저에서 통화는 하나만 유지합니다. 앞선 통화가 완전히 정리된 뒤에 다음 통화를 시작해야
// 같은 Realtime 토픽을 두 번 구독하는 상태가 생기지 않습니다(개발 모드 이중 마운트, 빠른 채널 전환).
let joinChain: Promise<HuddleSession | null> = Promise.resolve(null);

export function joinHuddle(options: { channelId: string; userId: string; userName: string; callbacks: HuddleCallbacks }): Promise<HuddleSession> {
  const next = joinChain.then(async (previous) => {
    if (previous) await previous.leave().catch(() => undefined);
    return startHuddle(options);
  });
  joinChain = next.catch(() => null);
  return next;
}

async function startHuddle(options: { channelId: string; userId: string; userName: string; callbacks: HuddleCallbacks }): Promise<HuddleSession> {
  const { channelId, userId, userName, callbacks } = options;
  if (!huddleSupported()) throw new Error('이 브라우저에서는 음성 통화를 지원하지 않습니다.');

  const local = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }).catch(() => {
    throw new Error('마이크를 사용할 수 없습니다. 브라우저 권한을 확인해 주세요.');
  });

  const remote = new MediaStream();
  const pendingCandidates: RTCIceCandidateInit[] = [];
  let pc: RTCPeerConnection;
  let room: RealtimeChannel | null = null;
  let peerId = '';
  let polite = false;
  let makingOffer = false;
  let ignoreOffer = false;
  let closed = false;
  let screenStream: MediaStream | null = null;
  let screenSender: RTCRtpSender | null = null;
  let remoteSharing: boolean | null = null;

  const send = (payload: Omit<SignalPayload, 'from'>) => {
    if (!room || closed) return;
    void room.send({ type: 'broadcast', event: 'signal', payload: { from: userId, to: peerId || undefined, ...payload } });
  };

  const syncRemoteVideo = () => {
    const videos = remote.getVideoTracks();
    const active = videos.filter((track) => track.readyState === 'live' && !track.muted);
    // 재협상 과정에서 멈춘 영상 트랙이 남으면 <video>가 그 정지 화면을 잡고 있을 수 있어 함께 정리합니다.
    if (active.length) videos.filter((track) => !active.includes(track)).forEach((track) => remote.removeTrack(track));
    // 트랙이 muted로 바뀌는 데 몇 초 걸려서, 상대가 보낸 공유 종료 신호를 우선합니다.
    callbacks.onRemoteVideo(remoteSharing !== false && active.length > 0);
  };

  // 상대가 나가면 연결을 통째로 새로 만듭니다. 쓰던 연결을 재사용하면 다음 사람이 들어왔을 때
  // 이전 상대의 미디어 라인이 남아 협상이 어긋납니다.
  const setupPeer = () => {
    const next = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    local.getTracks().forEach((track) => next.addTrack(track, local));
    const shared = screenStream?.getVideoTracks()[0];
    if (screenStream && shared) screenSender = next.addTrack(shared, screenStream);
    next.onicecandidate = (event) => { if (event.candidate) send({ candidate: event.candidate.toJSON() }); };
    next.onnegotiationneeded = () => { void negotiate(); };
    next.ontrack = (event) => {
      remote.addTrack(event.track);
      callbacks.onRemoteStream(remote);
      // 상대가 화면 공유를 멈추면 트랙이 사라지는 게 아니라 muted 상태가 됩니다.
      // 'ended'만 보면 멈춘 화면이 계속 남아 있으므로 mute/unmute도 함께 봅니다.
      event.track.addEventListener('mute', syncRemoteVideo);
      event.track.addEventListener('unmute', syncRemoteVideo);
      event.track.addEventListener('ended', () => { remote.removeTrack(event.track); syncRemoteVideo(); });
      syncRemoteVideo();
    };
    next.onconnectionstatechange = () => {
      if (closed || next !== pc) return;
      if (next.connectionState === 'connected') callbacks.onStatus('connected');
      if (next.connectionState === 'failed') { callbacks.onStatus('failed'); callbacks.onError('상대와 연결하지 못했습니다. 회사망이나 방화벽 환경일 수 있어요.'); }
      if (next.connectionState === 'disconnected') callbacks.onStatus('calling');
    };
    pc = next;
  };

  const resetPeer = () => {
    peerId = '';
    pendingCandidates.length = 0;
    makingOffer = false;
    ignoreOffer = false;
    screenSender = null;
    remoteSharing = null;
    remote.getTracks().forEach((track) => remote.removeTrack(track));
    callbacks.onRemoteStream(null);
    callbacks.onRemoteVideo(false);
    callbacks.onPeerName(null);
    pc?.close();
    if (closed) return;
    setupPeer();
    callbacks.onStatus('waiting');
  };

  const negotiate = async () => {
    if (!peerId || closed) return;
    try {
      makingOffer = true;
      await pc.setLocalDescription();
      send({ description: pc.localDescription?.toJSON() });
    } catch {
      callbacks.onError('연결 정보를 주고받지 못했습니다.');
    } finally {
      makingOffer = false;
    }
  };

  setupPeer();

  const applyCandidates = async () => {
    while (pendingCandidates.length) {
      const candidate = pendingCandidates.shift();
      if (candidate) await pc.addIceCandidate(candidate).catch(() => undefined);
    }
  };

  const handleSignal = async (payload: SignalPayload) => {
    if (closed || !payload || payload.from === userId) return;
    if (payload.to && payload.to !== userId) return;
    if (!peerId) { peerId = payload.from; polite = userId > payload.from; }
    if (payload.from !== peerId) return;
    if (payload.bye) { resetPeer(); return; }
    if (typeof payload.share === 'boolean') { remoteSharing = payload.share; syncRemoteVideo(); return; }

    if (payload.description) {
      const collision = payload.description.type === 'offer' && (makingOffer || pc.signalingState !== 'stable');
      ignoreOffer = !polite && collision;
      if (ignoreOffer) return;
      // 충돌한 제안은 setRemoteDescription이 알아서 롤백합니다(perfect negotiation).
      await pc.setRemoteDescription(payload.description);
      await applyCandidates();
      if (payload.description.type === 'offer') {
        await pc.setLocalDescription();
        send({ description: pc.localDescription?.toJSON() });
      }
      return;
    }

    if (payload.candidate) {
      if (!pc.remoteDescription) { pendingCandidates.push(payload.candidate); return; }
      await pc.addIceCandidate(payload.candidate).catch(() => { if (!ignoreOffer) callbacks.onError('연결 후보를 처리하지 못했습니다.'); });
    }
  };

  callbacks.onStatus('connecting');
  const topic = `huddle:${channelId}`;
  // 같은 토픽의 채널이 남아 있으면 supabase-js가 그 채널을 그대로 돌려줘서, 이미 구독된 채널에
  // 콜백을 붙이다 실패합니다(개발 모드의 이중 마운트, 이전 통화 정리 실패 등).
  await Promise.all(
    supabase.getChannels()
      .filter((item) => item.topic === topic || item.topic === `realtime:${topic}`)
      .map((item) => supabase.removeChannel(item)),
  );
  room = supabase.channel(topic, { config: { presence: { key: userId }, broadcast: { self: false } } });

  room.on('broadcast', { event: 'signal' }, ({ payload }) => { void handleSignal(payload as SignalPayload); });

  room.on('presence', { event: 'sync' }, () => {
    if (closed || !room) return;
    const state = room.presenceState<{ name: string }>();
    const others = Object.keys(state).filter((id) => id !== userId);
    if (!others.length) { if (peerId) resetPeer(); else callbacks.onStatus('waiting'); return; }
    if (!peerId && others.length > 1) { callbacks.onError('이미 두 사람이 통화 중이에요. 잠시 후 다시 시도해 주세요.'); void leave(); return; }
    const next = peerId && others.includes(peerId) ? peerId : others[0];
    callbacks.onPeerName(state[next]?.[0]?.name ?? '동료');
    if (next === peerId) return;
    peerId = next;
    polite = userId > next;
    callbacks.onStatus('calling');
    // 사전순으로 앞선 쪽이 먼저 제안해서 양쪽이 동시에 제안하는 상황을 줄입니다.
    if (!polite) void negotiate();
  });

  room.on('presence', { event: 'leave' }, ({ key }) => { if (key === peerId) resetPeer(); });

  await new Promise<void>((resolve, reject) => {
    room?.subscribe((status) => {
      if (status === 'SUBSCRIBED') { void room?.track({ name: userName }); resolve(); }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error('통화 서버에 연결하지 못했습니다.'));
    });
  }).catch((cause) => {
    local.getTracks().forEach((track) => track.stop());
    pc.close();
    throw cause;
  });

  async function stopScreenShare() {
    screenStream?.getTracks().forEach((track) => track.stop());
    screenStream = null;
    // sender는 남겨두고 트랙만 비웁니다. 지우고 다시 만들면 상대 쪽에 멈춘 영상 트랙이 하나 더 쌓입니다.
    if (screenSender) await screenSender.replaceTrack(null).catch(() => undefined);
    send({ share: false });
  }

  async function leave() {
    if (closed) return;
    closed = true;
    send({ bye: true });
    await stopScreenShare();
    local.getTracks().forEach((track) => track.stop());
    pc.close();
    if (room) { await room.untrack().catch(() => undefined); await supabase.removeChannel(room); room = null; }
    callbacks.onRemoteStream(null);
    callbacks.onStatus('ended');
  }

  return {
    toggleMic() {
      const track = local.getAudioTracks()[0];
      if (!track) return false;
      track.enabled = !track.enabled;
      return track.enabled;
    },
    async startScreenShare() {
      if (!screenShareSupported()) throw new Error('이 환경에서는 화면 공유를 지원하지 않습니다.');
      if (screenStream) return;
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const [track] = stream.getVideoTracks();
      if (!track) { stream.getTracks().forEach((item) => item.stop()); throw new Error('공유할 화면을 가져오지 못했습니다.'); }
      screenStream = stream;
      if (screenSender) await screenSender.replaceTrack(track);
      else screenSender = pc.addTrack(track, stream);
      send({ share: true });
      track.addEventListener('ended', () => { void stopScreenShare(); });
    },
    stopScreenShare,
    leave,
  };
}
