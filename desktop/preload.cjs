const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('commuteBattleDesktop', {
  platform: process.platform,
  isDesktop: true,
});
