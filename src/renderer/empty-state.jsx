import React from 'react';
import Bookmark from 'kubai-icons-react/duotone/icons/bookmark';
import FileImage from 'kubai-icons-react/duotone/icons/file-image';
import FileText from 'kubai-icons-react/duotone/icons/file-text';
import History from 'kubai-icons-react/duotone/icons/history';
import ImageSparkle from 'kubai-icons-react/duotone/icons/image-sparkle';
import List from 'kubai-icons-react/duotone/icons/list';
import MessageSquare from 'kubai-icons-react/duotone/icons/message-square';
import Quote from 'kubai-icons-react/duotone/icons/quote';
import Sliders from 'kubai-icons-react/duotone/icons/sliders';
import Tag from 'kubai-icons-react/duotone/icons/tag';
import TriangleAlert from 'kubai-icons-react/duotone/icons/triangle-alert';
import { LibraryWireframe, SearchEmptyWireframe, WorkspaceWireframe } from './empty-wireframes.jsx';
import './empty-state.css';

const ICONS = {
  alert: TriangleAlert,
  bookmark: Bookmark,
  chat: MessageSquare,
  document: FileText,
  history: History,
  image: ImageSparkle,
  list: List,
  pageImage: FileImage,
  quote: Quote,
  sliders: Sliders,
  tag: Tag,
};

const WIREFRAMES = {
  library: LibraryWireframe,
  search: SearchEmptyWireframe,
  workspace: WorkspaceWireframe,
};

function ReloadMark({ spinning }) {
  return <svg className={'elr-empty-reload' + (spinning ? ' is-spinning' : '')} viewBox="0 0 16 16" width="14" height="14"
    fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M13.5 8a5.5 5.5 0 1 1-1.4-3.7" />
    <path d="M13.5 3.2v3.3h-3.3" />
  </svg>;
}

export function EmptyIcon({ name, size = 22 }) {
  const Component = ICONS[name] || FileText;
  return <span className="elr-empty-icon" aria-hidden="true">
    <Component size={size} />
  </span>;
}

export function EmptyState({
  size = 'page',
  icon,
  wireframe,
  title,
  description,
  primaryAction,
  secondaryAction,
  live = false,
  className = '',
}) {
  const Wireframe = wireframe ? WIREFRAMES[wireframe] : null;
  const liveProps = live ? { role: 'status', 'aria-live': 'polite' } : {};

  if (size === 'menu') {
    return <p className={'elr-empty elr-empty-menu' + (className ? ' ' + className : '')} {...liveProps}>
      {title}
    </p>;
  }

  if (size === 'row') {
    const action = secondaryAction || primaryAction;
    return <div className={'elr-empty elr-empty-row' + (className ? ' ' + className : '')} {...liveProps}>
      <span className="elr-empty-title">{title}</span>
      {action && <button type="button" className="elr-empty-ghost" disabled={action.disabled} onClick={action.onClick}>
        {action.retry && <ReloadMark spinning={action.spinning} />}
        {action.label}
      </button>}
    </div>;
  }

  if (size === 'card') {
    const action = secondaryAction || primaryAction;
    return <div className={'elr-empty elr-empty-card' + (className ? ' ' + className : '')} {...liveProps}>
      {icon && <div className="elr-empty-tile" aria-hidden="true"><EmptyIcon name={icon} size={22} /></div>}
      <span className="elr-empty-title">{title}</span>
      {action && <button type="button" className="elr-empty-ghost" disabled={action.disabled} onClick={action.onClick}>
        {action.retry && <ReloadMark spinning={action.spinning} />}
        {action.label}
      </button>}
    </div>;
  }

  // Page / large panel size
  return <div className={'elr-empty elr-empty-page' + (className ? ' ' + className : '')} {...liveProps}>
    <div className="elr-empty-group">
      {Wireframe ? <div className="elr-empty-picture" aria-hidden="true"><Wireframe /></div>
        : icon ? <div className="elr-empty-picture" aria-hidden="true"><EmptyIcon name={icon} size={48} /></div> : null}
      <h3 className="elr-empty-title">{title}</h3>
      {description && <p className="elr-empty-desc">{description}</p>}
      {(primaryAction || secondaryAction) && <div className="elr-empty-actions">
        {primaryAction && <button type="button" className={'elr-empty-btn ' + (primaryAction.variant || 'primary')}
          disabled={primaryAction.disabled} onClick={primaryAction.onClick}>
          {primaryAction.retry && <ReloadMark spinning={primaryAction.spinning} />}
          {primaryAction.label}
        </button>}
        {secondaryAction && <button type="button" className={'elr-empty-btn ' + (secondaryAction.variant || 'secondary')}
          disabled={secondaryAction.disabled} onClick={secondaryAction.onClick}>
          {secondaryAction.retry && <ReloadMark spinning={secondaryAction.spinning} />}
          {secondaryAction.label}
        </button>}
      </div>}
    </div>
  </div>;
}

export function EmptySkeleton({ variant = 'library', rows = 4, label = '正在加载…' }) {
  return <div className={'elr-skeleton elr-skeleton-' + variant} role="status" aria-busy="true" aria-label={label}>
    {Array.from({ length: rows }, (_, i) => (
      <div className="elr-skeleton-item" key={i}>
        {variant === 'library' && <span className="elr-sk-thumb" />}
        <div className="elr-sk-lines">
          <span className="elr-sk-line is-title" style={{ width: (62 + ((i * 17) % 26)) + '%' }} />
          {variant !== 'outline' && <span className="elr-sk-line" style={{ width: (40 + ((i * 23) % 44)) + '%' }} />}
        </div>
      </div>
    ))}
  </div>;
}
