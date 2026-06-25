import dotenv from 'dotenv';
dotenv.config();
import { LavalinkManager } from 'lavalink-client';

const host = process.env.LAVALINK_HOST || 'localhost';
const port = process.env.LAVALINK_PORT || '2333';
const password = process.env.LAVALINK_PASSWORD || 'youshallnotpass';
const secure = process.env.LAVALINK_SECURE === 'true';

console.log(`Configured node: ${host}:${port} (secure: ${secure})`);

const manager = new LavalinkManager({
  nodes: [
    {
      host,
      port: Number(port),
      authorization: password,
      secure,
      id: 'main',
    }
  ],
  sendToShard: (guildId, payload) => {},
  client: { id: '1506871353188421692', username: 'TestBot' },
});

manager.nodeManager.on('connect', async (node) => {
  console.log(`✅ Connected to node: ${node.id}`);
  
  // Test: SoundCloud search
  try {
    console.log('\n--- SoundCloud Search ("scsearch:hello adele") ---');
    const start = Date.now();
    const res = await node.search({ query: 'scsearch:hello adele' }, { id: 'test' });
    console.log(`SoundCloud search finished in ${Date.now() - start}ms`);
    console.log(`- loadType: ${res.loadType}`);
    console.log(`- Tracks count: ${res.tracks?.length}`);
    if (res.tracks?.length > 0) {
      console.log(`- First track: ${res.tracks[0].info.title}`);
    }
  } catch (err) {
    console.error('SoundCloud search failed:', err.message || err);
  }

  process.exit(0);
});

manager.nodeManager.on('error', (node, err) => {
  console.log(`❌ Node error:`, err?.message ?? err);
  process.exit(1);
});

async function run() {
  await manager.init({ id: '1506871353188421692', username: 'TestBot' });
}

run();






