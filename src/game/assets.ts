/**
 * Runtime media URLs. Development uses the local project files; production uses the exact
 * verified Manus Storage objects registered in assets.lock.json.
 */
export const ASSET_BASE = '/assets'
const DEV = import.meta.env.DEV
const media = (devPath: string, storagePath: string): string => DEV ? devPath : storagePath

export const CAR_URL = media(`${ASSET_BASE}/models/apex-car.glb`, '/manus-storage/game/sha256/ddc62801d308a9d3cf423f55382237207e214939e68d06f56d1cc58206a673ca.glb')

export const AUDIO_URLS = {
  engine: media(`${ASSET_BASE}/audio/engine.mp3`, '/manus-storage/game/sha256/330dac4f7c5846b1c6aca3faf0afc494350bf48456610c40b27d0baa199a9fcc.mp3'),
  drift: media(`${ASSET_BASE}/audio/drift.mp3`, '/manus-storage/game/sha256/af95ae5af55db3b5e135b9fb29d507707c819e3c5edc806d94cff6eb25b56b75.mp3'),
  wallride: media(`${ASSET_BASE}/audio/wallride.mp3`, '/manus-storage/game/sha256/d1a2773656bb5ac1ebad0ee1a1292637a08a8ecb9d8e185278d80081fdc88efc.mp3'),
  music: media(`${ASSET_BASE}/audio/race-theme.mp3`, '/manus-storage/game/sha256/8a4cf4aa889d686d987cebc6c08d8d251d8aae367c871fab3090e1ce327c1a9f.mp3'),
  ui: media(`${ASSET_BASE}/audio/ui.mp3`, '/manus-storage/game/sha256/89641caf5d6a9e31902e45888ab5ddfd371af1dd192c8a2d3dff059e70d72650.mp3'),
  start: media(`${ASSET_BASE}/audio/start.mp3`, '/manus-storage/game/sha256/6a7d68f527c6deb5fe92fc3653524b15a375c1f049d2b1d0145e54c304bf30bb.mp3'),
  boost: media(`${ASSET_BASE}/audio/boost.mp3`, '/manus-storage/game/sha256/3a383764c181cad90e31994bfbcd87f793e3971cd8110ee93d8c2754b86128b9.mp3'),
  jump: media(`${ASSET_BASE}/audio/jump.mp3`, '/manus-storage/game/sha256/a6bca58e8e58fb5704a98235f14f69a650abbf46e39e5635e7ed623fea85553c.mp3'),
  land: media(`${ASSET_BASE}/audio/land.mp3`, '/manus-storage/game/sha256/b3b50fc19262468900a1fa6a9d48db9c7dcacac8f66c51204fc9c303c8b91a8b.mp3'),
  lap: media(`${ASSET_BASE}/audio/lap.mp3`, '/manus-storage/game/sha256/66d828a571cdc3c47bb211b28f17ccf48a57b8b7fdd115ba86be3e4881047f73.mp3'),
  finish: media(`${ASSET_BASE}/audio/finish.mp3`, '/manus-storage/game/sha256/7c8bd915745e20ecb77b2f7ac1ed12f96fd74c072f0c5551202baa54f86a31aa.mp3'),
} as const
