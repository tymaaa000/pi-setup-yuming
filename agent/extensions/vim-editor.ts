/**
 * Vim Mode — modal editor for Pi input.
 *
 * Normal mode: hjkl navigation, i/a/o to enter insert mode, Esc to abort
 * Insert mode: normal typing (default)
 *
 * Mode indicator shown at the right edge of the editor border.
 */

import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

type Mode = "normal" | "insert";

class VimEditor extends CustomEditor {
  private mode: Mode = "insert";

  handleInput(data: string): void {
    // Esc: toggle to normal mode, or pass through for app abort
    if (matchesKey(data, "escape")) {
      if (this.mode === "insert") {
        this.mode = "normal";
        return;
      }
      super.handleInput(data);
      return;
    }

    // Insert mode: pass everything through
    if (this.mode === "insert") {
      super.handleInput(data);
      return;
    }

    // Normal mode
    switch (data) {
      case "i": this.mode = "insert"; return;
      case "a": this.mode = "insert"; super.handleInput("\x1b[C"); return;
      case "A": this.mode = "insert"; super.handleInput("\x1b[F"); return;
      case "I": this.mode = "insert"; super.handleInput("\x1b[H"); return;
      case "o": this.mode = "insert"; super.handleInput("\x1b[F"); super.handleInput("\r"); return;
      case "O": this.mode = "insert"; super.handleInput("\x1b[H"); super.handleInput("\r"); super.handleInput("\x1b[A"); return;
      case "h": super.handleInput("\x1b[D"); return;
      case "j": super.handleInput("\x1b[B"); return;
      case "k": super.handleInput("\x1b[A"); return;
      case "l": super.handleInput("\x1b[C"); return;
      case "w": super.handleInput("\x1bf"); return;
      case "b": super.handleInput("\x1bF"); return;
      case "x": super.handleInput("\x1b[3~"); return;
      case "$": super.handleInput("\x1b[F"); return;
      case "0": super.handleInput("\x1b[H"); return;
    }

    // Suppress other printable characters in normal mode
    if (data.length === 1 && data.charCodeAt(0) >= 32) return;
    super.handleInput(data);
  }

  render(width: number): string[] {
    return super.render(width);
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setEditorComponent((tui, theme, keybindings) =>
      new VimEditor(tui, theme, keybindings)
    );
  });
}
