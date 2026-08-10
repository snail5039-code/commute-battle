export {};

declare global {
  interface Window {
    commuteBattleDesktop?: {
      platform: string;
      isDesktop: true;
    };
  }
}
