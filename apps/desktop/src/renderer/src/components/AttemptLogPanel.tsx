import type { CaptureAttemptLogRecord } from '@amberkeeper/shared-types';

export function AttemptLogPanel(props: { attempts: CaptureAttemptLogRecord[] }) {
  const { attempts } = props;

  return (
    <article className="panel-card">
      <div className="section-header section-header--tight">
        <h3>Recent Attempts</h3>
        <span className="panel-count">{attempts.length}</span>
      </div>
      <ul className="attempt-list">
        {attempts.length === 0 ? (
          <li className="empty-state">No capture attempts recorded yet.</li>
        ) : (
          attempts.map((attempt) => (
            <li key={attempt.id} className={`attempt-item attempt-${attempt.status}`}>
              <div className="attempt-meta">
                <span>{attempt.source}</span>
                <span>{attempt.stage}</span>
              </div>
              <strong>{attempt.message}</strong>
              {attempt.detail ? <p className="attempt-detail">{attempt.detail}</p> : null}
            </li>
          ))
        )}
      </ul>
    </article>
  );
}
