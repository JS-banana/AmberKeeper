import type { CaptureMessageRecord, CaptureSessionRecord } from '@amberkeeper/shared-types';

export function ConversationMessagePane(props: {
  session: CaptureSessionRecord | null;
  messages: CaptureMessageRecord[];
  loading: boolean;
}) {
  return (
    <article className="workspace-card workspace-card--messages">
      <div className="section-header section-header--tight">
        <h2>消息</h2>
        <span className="panel-count">{props.messages.length}</span>
      </div>

      {props.session ? (
        <div className="message-pane__header">
          <strong>{props.session.remoteConversationId ?? props.session.id}</strong>
          <span>{props.session.pageUrl}</span>
        </div>
      ) : (
        <div className="workspace-empty">
          <p>选择左侧会话后，可在这里查看消息内容。</p>
        </div>
      )}

      {props.session && props.loading ? (
        <div className="workspace-empty">
          <p>正在加载消息…</p>
        </div>
      ) : null}

      {props.session && !props.loading && props.messages.length === 0 ? (
        <div className="workspace-empty">
          <p>当前会话还没有捕获到消息。</p>
        </div>
      ) : null}

      {props.session && props.messages.length > 0 ? (
        <ol className="message-list">
          {props.messages.map((message) => (
            <li
              key={message.id}
              className={
                message.role === 'assistant' ? 'message-bubble assistant' : 'message-bubble user'
              }
            >
              <div className="message-bubble__meta">
                <span>{message.role === 'assistant' ? '助手' : '用户'}</span>
                <span>{message.createdAt}</span>
              </div>
              <p>{message.content}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </article>
  );
}
