/**
 * Use the terminal's native cursor for the main editor.
 *
 * Pi normally draws the active character with reverse video. Keeping the
 * cursor marker lets pi position the terminal cursor for IME input; removing
 * only the reverse-video wrapper leaves the terminal's own cursor visible.
 */

import {
  CustomEditor,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

// The main Editor uses SGR 7/0 around the character at the cursor position.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching raw ANSI SGR sequences requires ESC
const SOFTWARE_CURSOR = /\x1b\[7m([^\x1b]*)\x1b\[0m/g;

class NativeCursorEditor extends CustomEditor {
  override render(width: number): string[] {
    return super
      .render(width)
      .map((line) => line.replace(SOFTWARE_CURSOR, "$1"));
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      tui.setShowHardwareCursor(true);
      return new NativeCursorEditor(tui, theme, keybindings);
    });
  });
}
