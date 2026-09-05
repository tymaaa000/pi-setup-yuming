/**
 * auto-name-session — 在用户使用 /new 命令新建会话时提示命名。
 *
 * 行为：
 *   - 仅在 session_start 事件且 reason 为 "new" 时提示命名（即用户显式使用 /new 命令）。
 *   - 启动 pi 时不提示，恢复会话时不提示。
 *   - 如果用户输入为空，则生成默认名称 "会话-YYYY-MM-DD-HH-MM-SS"。
 *   - 调用 pi.setSessionName() 设置名称。
 *   - 仅在交互模式（TUI）下提示，非交互模式（RPC、JSON、print）下跳过。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (event, ctx) => {
    // 只在交互模式下提示（TUI）
    if (ctx.mode !== "tui") {
      return;
    }

    // 只在用户明确使用 /new 命令时提示命名
    if (event.reason !== "new") {
      return;
    }

    // 如果已经有会话名称，跳过提示
    const existingName = pi.getSessionName();
    if (existingName) {
      return;
    }

    // 生成默认名称
    const now = new Date();
    const defaultName = `会话-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;

    // 提示用户输入
    const userInput = await ctx.ui.input("为本次对话命名：", defaultName);

    // 如果用户取消（返回 undefined 或空字符串），使用默认名称
    const sessionName = userInput?.trim() || defaultName;

    // 设置会话名称
    pi.setSessionName(sessionName);
    ctx.ui.notify(`对话已命名为：${sessionName}`, "info");
  });
}
