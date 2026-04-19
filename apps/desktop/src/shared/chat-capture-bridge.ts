export const AMBERKEEPER_CHAT_CAPTURE_KEY = 'amberkeeperChatCapture';

// Electron reserves worlds 0 and 999. Keep a dedicated world for the
// sandboxed chat-capture bridge so the main process can query preload-owned
// helpers without relying on page-world visibility.
export const AMBERKEEPER_CHAT_CAPTURE_WORLD_ID = 1004;

export const AMBERKEEPER_CHAT_CAPTURE_COMMAND_CHANNEL =
  'amberkeeper:chat-capture-command';
export const AMBERKEEPER_CHAT_CAPTURE_RESULT_CHANNEL =
  'amberkeeper:chat-capture-command-result';

export type ChatCaptureCommandKind = 'snapshot-dom' | 'snapshot-structured';
