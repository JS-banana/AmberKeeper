import { contextBridge, ipcRenderer } from 'electron';
import { createChatCaptureApi } from './provider-chat-capture';
import { installPageNetworkCapture, PAGE_NETWORK_RELAY_BRIDGE } from './page-network-capture';

function publishPageContext() {
  ipcRenderer.send('chat:page-context', {
    url: location.href,
    title: document.title,
  });
}

window.addEventListener('load', publishPageContext);
window.addEventListener('popstate', publishPageContext);
setInterval(publishPageContext, 2000);

contextBridge.exposeInMainWorld(PAGE_NETWORK_RELAY_BRIDGE, {
  send(payload: {
    url?: string;
    method?: string;
    status?: number | null;
    body?: string;
  }) {
    ipcRenderer.send('chat:network-payload', {
      ...payload,
      pageUrl: location.href,
      capturedAt: new Date().toISOString(),
    });
  },
});

installPageNetworkCapture({
  relay(payload) {
    ipcRenderer.send('chat:network-payload', {
      ...payload,
      pageUrl: location.href,
      capturedAt: new Date().toISOString(),
    });
  },
});

contextBridge.exposeInMainWorld(
  'amberkeeperChatCapture',
  createChatCaptureApi({
    getUrl: () => location.href,
    getTitle: () => document.title,
    getCapturedAt: () => new Date().toISOString(),
    root: document,
  })
);
