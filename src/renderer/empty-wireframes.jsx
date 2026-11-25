import React from 'react';

// Self-contained inline SVG wireframes driven entirely by CoReader theme CSS variables.
// ViewBoxes: 120x90 for page-level first-use states, 80x60 for no-results states.

export function LibraryWireframe() {
  return <svg className="elr-empty-wireframe" viewBox="0 0 120 90" width="120" height="90" aria-hidden="true" focusable="false">
    <defs>
      <filter id="ew-lib-shadow" x="-15%" y="-15%" width="130%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" />
        <feOffset dx="0" dy="2" result="offset" />
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.06" />
        </feComponentTransfer>
        <feMerge>
          <feMergeNode />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <g filter="url(#ew-lib-shadow)">
      <rect x="20" y="16" width="80" height="24" rx="10" className="ew-card" />
      <rect x="28" y="23" width="10" height="10" rx="3" className="ew-slot" />
      <rect x="43" y="23" width="34" height="5" rx="2.5" className="ew-title" />
      <rect x="43" y="31" width="46" height="4" rx="2" className="ew-bar" />

      <rect x="20" y="46" width="80" height="24" rx="10" className="ew-card" />
      <rect x="28" y="53" width="10" height="10" rx="3" className="ew-slot" />
      <rect x="43" y="53" width="28" height="5" rx="2.5" className="ew-title" />
      <rect x="43" y="61" width="38" height="4" rx="2" className="ew-bar" />
    </g>
    <circle cx="94" cy="68" r="10" className="ew-accent" />
    <path d="M94 64v8M90 68h8" className="ew-accent-mark" strokeWidth="1.8" strokeLinecap="round" />
  </svg>;
}

export function WorkspaceWireframe() {
  return <svg className="elr-empty-wireframe" viewBox="0 0 120 90" width="120" height="90" aria-hidden="true" focusable="false">
    <defs>
      <filter id="ew-dock-shadow" x="-15%" y="-15%" width="130%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" />
        <feOffset dx="0" dy="2" result="offset" />
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.06" />
        </feComponentTransfer>
        <feMerge>
          <feMergeNode />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <g filter="url(#ew-dock-shadow)">
      <rect x="24" y="16" width="72" height="26" rx="10" className="ew-card" />
      <rect x="33" y="23" width="28" height="5" rx="2.5" className="ew-title" />
      <rect x="33" y="32" width="52" height="4" rx="2" className="ew-bar" />

      <rect x="24" y="48" width="72" height="26" rx="10" className="ew-card" />
      <rect x="33" y="55" width="36" height="5" rx="2.5" className="ew-title" />
      <rect x="33" y="64" width="44" height="4" rx="2" className="ew-bar" />
    </g>
    <circle cx="92" cy="70" r="10" className="ew-accent" />
    <path d="M92 66v8M88 70h8" className="ew-accent-mark" strokeWidth="1.8" strokeLinecap="round" />
  </svg>;
}

export function SearchEmptyWireframe() {
  return <svg className="elr-empty-wireframe is-compact" viewBox="0 0 80 60" width="80" height="60" aria-hidden="true" focusable="false">
    <defs>
      <filter id="ew-search-shadow" x="-18%" y="-18%" width="136%" height="145%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="1.2" />
        <feOffset dx="0" dy="2" result="offset" />
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.06" />
        </feComponentTransfer>
        <feMerge>
          <feMergeNode />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <g filter="url(#ew-search-shadow)">
      <rect x="14" y="14" width="52" height="32" rx="10" className="ew-card" />
      <rect x="22" y="22" width="22" height="5" rx="2.5" className="ew-title" />
      <rect x="22" y="31" width="32" height="4" rx="2" className="ew-bar" />
    </g>
    <circle cx="56" cy="38" r="8" className="ew-card" />
    <circle cx="55" cy="37" r="4" fill="none" className="ew-line" strokeWidth="1.5" />
    <path d="M58 40l3.2 3.2" className="ew-line" strokeWidth="1.5" strokeLinecap="round" />
  </svg>;
}
