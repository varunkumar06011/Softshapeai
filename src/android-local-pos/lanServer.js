import { registerPlugin } from '@capacitor/core';

const LocalPosLanServer = registerPlugin('LocalPosLanServer');

export function createAndroidLanServerAdapter({ port = 3101, onRequest = null } = {}) {
  let listening = false;
  let requestListener;

  return {
    async start() {
      if (onRequest && !requestListener) {
        requestListener = await LocalPosLanServer.addListener('request', async (request) => {
          try {
            const response = await onRequest(request);
            await LocalPosLanServer.respond({
              requestId: request.requestId,
              status: response?.status || 200,
              body: JSON.stringify(response?.body ?? response ?? {}),
            });
          } catch (error) {
            await LocalPosLanServer.respond({
              requestId: request.requestId,
              status: 500,
              body: JSON.stringify({ error: error.message || 'Local POS request failed' }),
            });
          }
        });
      }
      const result = await LocalPosLanServer.start({ port });
      listening = result?.listening !== false;
      return result;
    },

    async stop() {
      if (listening) await LocalPosLanServer.stop();
      listening = false;
      if (requestListener) {
        await requestListener.remove();
        requestListener = undefined;
      }
    },

    async status() {
      return LocalPosLanServer.status();
    },

    health() {
      return { enabled: true, listening, port };
    },
  };
}
