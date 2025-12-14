/**
 * Keyboard Shortcuts Hook
 * Manages keyboard shortcuts with conflict detection and customization
 */

import { useEffect, useCallback, useRef } from 'react';

// Default shortcuts configuration
const DEFAULT_SHORTCUTS = {
  'quick-search': {
    keys: ['ctrl+k', 'cmd+k'],
    description: 'Quick search',
    action: null, // Will be set by context
    category: 'navigation'
  },
  'new-order': {
    keys: ['ctrl+n', 'cmd+n'],
    description: 'New order/sale',
    action: null,
    category: 'actions'
  },
  'print': {
    keys: ['ctrl+p', 'cmd+p'],
    description: 'Print',
    action: null,
    category: 'actions'
  },
  'save': {
    keys: ['ctrl+s', 'cmd+s'],
    description: 'Save',
    action: null,
    category: 'actions'
  },
  'close-modal': {
    keys: ['escape'],
    description: 'Close modal',
    action: null,
    category: 'navigation'
  },
  'help': {
    keys: ['f1'],
    description: 'Help',
    action: null,
    category: 'navigation'
  },
  'focus-search': {
    keys: ['f2'],
    description: 'Focus search',
    action: null,
    category: 'navigation'
  },
  'new-product': {
    keys: ['f3'],
    description: 'New product',
    action: null,
    category: 'actions'
  },
  'new-customer': {
    keys: ['f4'],
    description: 'New customer',
    action: null,
    category: 'actions'
  }
};

/**
 * Normalize key combination string
 */
const normalizeKey = (key) => {
  return key.toLowerCase()
    .replace(/\s+/g, '')
    .replace('control', 'ctrl')
    .replace('command', 'cmd')
    .replace('meta', 'cmd');
};

/**
 * Parse key combination string to object
 */
const parseKeyCombination = (keyString) => {
  const normalized = normalizeKey(keyString);
  const parts = normalized.split('+');
  
  return {
    ctrl: parts.includes('ctrl'),
    cmd: parts.includes('cmd'),
    alt: parts.includes('alt'),
    shift: parts.includes('shift'),
    key: parts[parts.length - 1] // Last part is the actual key
  };
};

/**
 * Check if key combination matches
 */
const matchesKeyCombination = (event, combination) => {
  // Return false if event.key is undefined
  if (!event.key || !combination.key) {
    return false;
  }

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const cmdKey = isMac ? event.metaKey : event.ctrlKey;
  
  return (
    (combination.ctrl && event.ctrlKey && !isMac) ||
    (combination.cmd && cmdKey) ||
    (!combination.ctrl && !combination.cmd && !event.ctrlKey && !event.metaKey) &&
    (combination.alt ? event.altKey : !event.altKey) &&
    (combination.shift ? event.shiftKey : !event.shiftKey) &&
    event.key.toLowerCase() === combination.key.toLowerCase()
  );
};

/**
 * Format key combination for display
 */
const formatKeyDisplay = (keyString) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const parts = keyString.split('+').map(part => {
    const normalized = normalizeKey(part);
    if (normalized === 'ctrl' && isMac) return '⌘';
    if (normalized === 'ctrl') return 'Ctrl';
    if (normalized === 'cmd') return '⌘';
    if (normalized === 'alt') return 'Alt';
    if (normalized === 'shift') return 'Shift';
    if (normalized.startsWith('f') && normalized.length <= 3) {
      return normalized.toUpperCase();
    }
    return normalized.toUpperCase();
  });
  
  return parts.join(isMac ? '' : '+');
};

/**
 * useKeyboardShortcuts Hook
 */
export const useKeyboardShortcuts = (shortcuts = {}, options = {}) => {
  const {
    enabled = true,
    preventDefault = true,
    stopPropagation = false
  } = options;

  const shortcutsRef = useRef({});
  const handlersRef = useRef({});

  // Update shortcuts ref
  useEffect(() => {
    shortcutsRef.current = { ...DEFAULT_SHORTCUTS, ...shortcuts };
  }, [shortcuts]);

  // Register shortcut handler
  const registerShortcut = useCallback((id, handler) => {
    handlersRef.current[id] = handler;
  }, []);

  // Unregister shortcut handler
  const unregisterShortcut = useCallback((id) => {
    delete handlersRef.current[id];
  }, []);

  // Handle keyboard events
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event) => {
      // Skip if event.key is undefined
      if (!event.key) {
        return;
      }

      // Skip if typing in input, textarea, or contenteditable
      const target = event.target;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('[contenteditable="true"]')
      ) {
        // Allow Escape and F keys even in inputs
        if (event.key !== 'Escape' && !event.key.startsWith('F')) {
          return;
        }
      }

      // Check each shortcut
      for (const [id, shortcut] of Object.entries(shortcutsRef.current)) {
        if (!shortcut.action && !handlersRef.current[id]) continue;

        // Check all key combinations for this shortcut
        for (const keyString of shortcut.keys) {
          const combination = parseKeyCombination(keyString);
          
          if (matchesKeyCombination(event, combination)) {
            if (preventDefault) {
              event.preventDefault();
            }
            if (stopPropagation) {
              event.stopPropagation();
            }

            // Execute handler
            const handler = handlersRef.current[id] || shortcut.action;
            if (handler) {
              handler(event);
            }
            
            return; // Only handle first match
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, preventDefault, stopPropagation]);

  return {
    registerShortcut,
    unregisterShortcut,
    formatKeyDisplay
  };
};

/**
 * Detect shortcut conflicts
 */
export const detectConflicts = (shortcuts) => {
  const conflicts = [];
  const keyMap = new Map();

  for (const [id, shortcut] of Object.entries(shortcuts)) {
    for (const keyString of shortcut.keys) {
      const normalized = normalizeKey(keyString);
      if (keyMap.has(normalized)) {
        conflicts.push({
          key: normalized,
          shortcuts: [keyMap.get(normalized), id]
        });
      } else {
        keyMap.set(normalized, id);
      }
    }
  }

  return conflicts;
};

export { DEFAULT_SHORTCUTS, normalizeKey, parseKeyCombination, formatKeyDisplay };

