import { contextBridge, ipcRenderer } from 'electron';
import { createChatCaptureApi } from './provider-chat-capture';

function publishPageContext() {
  ipcRenderer.send('chat:page-context', {
    url: location.href,
    title: document.title,
  });
}

window.addEventListener('load', publishPageContext);
window.addEventListener('popstate', publishPageContext);
setInterval(publishPageContext, 2000);

contextBridge.exposeInMainWorld(
  'amberkeeperChatCapture',
  createChatCaptureApi({
    getUrl: () => location.href,
    getTitle: () => document.title,
    getCapturedAt: () => new Date().toISOString(),
    root: document,
  })
);
