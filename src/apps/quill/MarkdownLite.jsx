import React, { memo, useMemo } from 'react';
import { parseMarkdownLite } from './quillHelpers.js';

function InlineTokens({ tokens = [], stopLinkPropagation = false }) {
  return tokens.map((tok, idx) => {
    if (tok.type === 'bold') {
      return (
        <strong key={idx} className="font-extrabold">
          {tok.value}
        </strong>
      );
    }
    if (tok.type === 'italic') {
      return (
        <em key={idx} className="italic">
          {tok.value}
        </em>
      );
    }
    if (tok.type === 'strike') {
      return (
        <del key={idx} className="line-through opacity-75">
          {tok.value}
        </del>
      );
    }
    if (tok.type === 'code') {
      return (
        <code
          key={idx}
          className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 font-mono text-[0.88em]"
        >
          {tok.value}
        </code>
      );
    }
    if (tok.type === 'link') {
      return (
        <a
          key={idx}
          href={tok.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={stopLinkPropagation ? (e) => e.stopPropagation() : undefined}
          className="font-semibold text-text-primary underline decoration-yellow-700/70 dark:decoration-yellow-300/70 hover:opacity-80 break-all"
        >
          {tok.label}
        </a>
      );
    }
    return <React.Fragment key={idx}>{tok.value}</React.Fragment>;
  });
}

function MarkdownLite({ text = '', className = '', stopLinkPropagation = false }) {
  const blocks = useMemo(() => parseMarkdownLite(text), [text]);
  if (blocks.length === 0) return null;

  return (
    <div className={`space-y-1 break-words ${className}`.trim()}>
      {blocks.map((block, idx) => {
        if (block.type === 'spacer') {
          return <div key={idx} className="h-1.5" aria-hidden="true" />;
        }
        if (block.type === 'heading') {
          const sizeCls =
            block.level === 1
              ? 'text-base font-extrabold'
              : block.level === 2
                ? 'text-sm font-extrabold'
                : 'text-xs font-extrabold uppercase tracking-wide';
          return (
            <div key={idx} className={`${sizeCls} leading-snug`}>
              <InlineTokens tokens={block.inlines} stopLinkPropagation={stopLinkPropagation} />
            </div>
          );
        }
        if (block.type === 'ul') {
          return (
            <ul key={idx} className="list-disc pl-4 space-y-0.5">
              {block.items.map((inlines, liIdx) => (
                <li key={liIdx}>
                  <InlineTokens tokens={inlines} stopLinkPropagation={stopLinkPropagation} />
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === 'ol') {
          return (
            <ol key={idx} className="list-decimal pl-4 space-y-0.5">
              {block.items.map((inlines, liIdx) => (
                <li key={liIdx}>
                  <InlineTokens tokens={inlines} stopLinkPropagation={stopLinkPropagation} />
                </li>
              ))}
            </ol>
          );
        }
        return (
          <p key={idx} className="leading-relaxed">
            <InlineTokens tokens={block.inlines} stopLinkPropagation={stopLinkPropagation} />
          </p>
        );
      })}
    </div>
  );
}

export default memo(MarkdownLite);
