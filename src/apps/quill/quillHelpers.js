import { QUILL_LIMITS, createChecklistItemId } from './quillConstants.js';

export function sortBoardNotes(notes = []) {
  return [...notes].sort(
    (a, b) =>
      Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
      Number(a.position ?? 0) - Number(b.position ?? 0) ||
      String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  );
}

export function computeMovedPosition(orderedNotes = [], targetIndex = 0) {
  const list = Array.isArray(orderedNotes) ? orderedNotes : [];
  if (list.length === 0) return 1000;
  const clamped = Math.max(0, Math.min(targetIndex, list.length));
  if (clamped === 0) {
    return Number(list[0].position ?? 1000) - 1000;
  }
  if (clamped >= list.length) {
    return Number(list[list.length - 1].position ?? 1000) + 1000;
  }
  const prevPos = Number(list[clamped - 1].position ?? 0);
  const nextPos = Number(list[clamped].position ?? prevPos + 2000);
  return (prevPos + nextPos) / 2;
}

export function filterQuillNotes(
  notes = [],
  { tab = 'shared', activeProfileId = 'partner1', searchQuery = '', selectedLabel = '' } = {}
) {
  const q = String(searchQuery || '').trim().toLowerCase();
  const lbl = String(selectedLabel || '').trim().toLowerCase();

  return sortBoardNotes(notes).filter((note) => {
    if (!note) return false;
    if (activeProfileId === 'caregiver') {
      if (note.visibility !== 'shared' || note.status !== 'active' || !note.caregiverVisible) {
        return false;
      }
    } else if (tab === 'shared') {
      if (note.status !== 'active' || note.visibility !== 'shared') return false;
    } else if (tab === 'private') {
      if (
        note.status !== 'active' ||
        note.visibility !== 'private' ||
        note.ownerProfileId !== activeProfileId
      ) {
        return false;
      }
    } else if (tab === 'archive') {
      if (note.status !== 'archived') return false;
      if (note.visibility === 'private' && note.ownerProfileId !== activeProfileId) return false;
    } else if (tab === 'trash') {
      if (note.status !== 'trashed') return false;
      if (note.visibility === 'private' && note.ownerProfileId !== activeProfileId) return false;
    }

    if (lbl) {
      const noteLabels = Array.isArray(note.labels) ? note.labels : [];
      if (!noteLabels.some((l) => String(l).toLowerCase() === lbl)) return false;
    }

    if (q) {
      const hayParts = [
        note.title || '',
        note.body || '',
        ...(Array.isArray(note.labels) ? note.labels : []),
        ...(Array.isArray(note.items) ? note.items.map((it) => it?.text || '') : [])
      ];
      if (!hayParts.join('\n').toLowerCase().includes(q)) return false;
    }

    return true;
  });
}

export function convertTextToChecklistItems(body = '') {
  return String(body || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean)
    .slice(0, QUILL_LIMITS.maxItems)
    .map((text) => ({
      id: createChecklistItemId(),
      text: text.slice(0, QUILL_LIMITS.maxItemTextLen),
      checked: false
    }));
}

export function convertChecklistItemsToText(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item?.text || '').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, QUILL_LIMITS.maxBodyLen);
}

export function applyMarkdownFormat(text = '', start = 0, end = 0, formatType = 'bold') {
  const src = String(text || '');
  const selStart = Math.max(0, Math.min(start, src.length));
  const selEnd = Math.max(selStart, Math.min(end, src.length));
  const selected = src.slice(selStart, selEnd);

  const wrap = (prefix, suffix, placeholder) => {
    const inner = selected || placeholder;
    const next = `${src.slice(0, selStart)}${prefix}${inner}${suffix}${src.slice(selEnd)}`;
    return {
      text: next,
      start: selStart + prefix.length,
      end: selStart + prefix.length + inner.length
    };
  };

  const prefixLines = (linePrefix, placeholder) => {
    const lineStart = src.lastIndexOf('\n', selStart - 1) + 1;
    const rawLineEnd = src.indexOf('\n', selEnd);
    const lineEnd = rawLineEnd === -1 ? src.length : rawLineEnd;
    const chunk = src.slice(lineStart, lineEnd) || placeholder;
    const lines = chunk.split('\n');
    const formatted = lines
      .map((ln, idx) => {
        if (formatType === 'ol') return `${idx + 1}. ${ln.replace(/^\d+\.\s+/, '')}`;
        if (formatType === 'heading') {
          return ln.startsWith('# ') ? ln.replace(/^#\s+/, '## ') : `# ${ln.replace(/^#+\s+/, '')}`;
        }
        return ln.startsWith(linePrefix) ? ln : `${linePrefix}${ln}`;
      })
      .join('\n');
    const next = `${src.slice(0, lineStart)}${formatted}${src.slice(lineEnd)}`;
    return {
      text: next,
      start: lineStart,
      end: lineStart + formatted.length
    };
  };

  switch (formatType) {
    case 'bold':
      return wrap('**', '**', 'bold text');
    case 'italic':
      return wrap('*', '*', 'italic text');
    case 'strike':
      return wrap('~~', '~~', 'struck text');
    case 'code':
      return wrap('`', '`', 'code');
    case 'link': {
      const label = selected || 'link text';
      const next = `${src.slice(0, selStart)}[${label}](https://)${src.slice(selEnd)}`;
      const urlStart = selStart + label.length + 3;
      return { text: next, start: urlStart, end: urlStart + 8 };
    }
    case 'heading':
      return prefixLines('# ', 'Heading');
    case 'ul':
      return prefixLines('- ', 'List item');
    case 'ol':
      return prefixLines('1. ', 'List item');
    default:
      return { text: src, start: selStart, end: selEnd };
  }
}

function isSafeLinkHref(rawUrl = '') {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return false;
  return /^(https?:\/\/|mailto:)/i.test(trimmed);
}

export function parseInlineMarkdown(text = '') {
  const src = String(text || '');
  const tokens = [];
  const tokenRe =
    /(\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>"')]+)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|~~([^~\n]+)~~|\*([^*\n]+)\*)/g;

  let lastIndex = 0;
  let match;
  while ((match = tokenRe.exec(src)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: src.slice(lastIndex, match.index) });
    }
    if (match[2] !== undefined && match[3] !== undefined) {
      if (isSafeLinkHref(match[3])) {
        tokens.push({ type: 'link', label: match[2], href: match[3] });
      } else {
        tokens.push({ type: 'text', value: match[0] });
      }
    } else if (match[4] !== undefined) {
      if (isSafeLinkHref(match[4])) {
        tokens.push({ type: 'link', label: match[4], href: match[4] });
      } else {
        tokens.push({ type: 'text', value: match[4] });
      }
    } else if (match[5] !== undefined) {
      tokens.push({ type: 'code', value: match[5] });
    } else if (match[6] !== undefined) {
      tokens.push({ type: 'bold', value: match[6] });
    } else if (match[7] !== undefined) {
      tokens.push({ type: 'strike', value: match[7] });
    } else if (match[8] !== undefined) {
      tokens.push({ type: 'italic', value: match[8] });
    }
    lastIndex = tokenRe.lastIndex;
  }

  if (lastIndex < src.length) {
    tokens.push({ type: 'text', value: src.slice(lastIndex) });
  }
  return tokens;
}

export function parseMarkdownLite(text = '') {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      if (blocks.length > 0 && blocks[blocks.length - 1].type !== 'spacer') {
        blocks.push({ type: 'spacer' });
      }
      i++;
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        inlines: parseInlineMarkdown(headingMatch[2])
      });
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(parseInlineMarkdown(lines[i].replace(/^[-*]\s+/, '')));
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(parseInlineMarkdown(lines[i].replace(/^\d+\.\s+/, '')));
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    blocks.push({
      type: 'paragraph',
      inlines: parseInlineMarkdown(line)
    });
    i++;
  }

  if (blocks.length > 0 && blocks[blocks.length - 1].type === 'spacer') {
    blocks.pop();
  }
  return blocks;
}
