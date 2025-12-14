/**
 * ShortcutHint Component
 * Displays keyboard shortcut hints next to UI elements
 */

import React from 'react';
import { useKeyboardShortcutsContext } from '../contexts/KeyboardShortcutsContext';

export const ShortcutHint = ({ shortcutId, className = '' }) => {
  const { shortcuts, formatKeyDisplay } = useKeyboardShortcutsContext();
  const shortcut = shortcuts[shortcutId];

  if (!shortcut || !shortcut.keys || shortcut.keys.length === 0) {
    return null;
  }

  // Use first key combination for display
  const displayKey = formatKeyDisplay(shortcut.keys[0]);

  return (
    <kbd className={`px-2 py-1 text-xs font-mono bg-gray-100 border border-gray-300 rounded ${className}`}>
      {displayKey}
    </kbd>
  );
};

export default ShortcutHint;

