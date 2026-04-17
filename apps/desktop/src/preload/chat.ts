import { contextBridge, ipcRenderer } from 'electron';
import {
  AMBERKEEPER_CHAT_CAPTURE_COMMAND_CHANNEL,
  AMBERKEEPER_CHAT_CAPTURE_KEY,
  AMBERKEEPER_CHAT_CAPTURE_RESULT_CHANNEL,
  AMBERKEEPER_CHAT_CAPTURE_WORLD_ID,
  type ChatCaptureCommandKind,
} from '../shared/chat-capture-bridge';
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

const chatCaptureApi = createChatCaptureApi({
  getUrl: () => location.href,
  getTitle: () => document.title,
  getCapturedAt: () => new Date().toISOString(),
  root: document,
});

contextBridge.exposeInMainWorld(AMBERKEEPER_CHAT_CAPTURE_KEY, chatCaptureApi);
contextBridge.exposeInIsolatedWorld(
  AMBERKEEPER_CHAT_CAPTURE_WORLD_ID,
  AMBERKEEPER_CHAT_CAPTURE_KEY,
  chatCaptureApi
);

ipcRenderer.on(
  AMBERKEEPER_CHAT_CAPTURE_COMMAND_CHANNEL,
  (
    _event,
    payload: {
      requestId?: string;
      kind?: ChatCaptureCommandKind;
    }
  ) => {
    const requestId = payload?.requestId;
    if (!requestId) {
      return;
    }

    try {
      const result =
        payload.kind === 'snapshot-dom'
          ? chatCaptureApi.snapshotDom()
          : chatCaptureApi.snapshotSignal();

      ipcRenderer.send(AMBERKEEPER_CHAT_CAPTURE_RESULT_CHANNEL, {
        requestId,
        ok: true,
        payload: result,
      });
    } catch (error) {
      ipcRenderer.send(AMBERKEEPER_CHAT_CAPTURE_RESULT_CHANNEL, {
        requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);
