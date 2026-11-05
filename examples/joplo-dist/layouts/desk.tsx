import { layout, Outlet, Slot } from '@joplo/kit';
import { Link } from '@joplo/kit/ui';

/** 开发者桌面：终端、Agent 会话、npm 网站三个窗口，用顶栏切换。 */
export default layout(
  <div className="flex h-full flex-col">
    <header className="flex items-center gap-6 border-b border-[#d0d0d0] px-6 py-3">
      <strong>开发机</strong>
      <nav className="flex gap-4">
        <Link id="nav_terminal" href="/terminal" unmodeled>终端</Link>
        <Link id="nav_agent" href="/agent" unmodeled>Claude Code</Link>
        <Link id="nav_npm" href="/npm" unmodeled>npmjs.com</Link>
      </nav>
    </header>
    <main className="flex flex-1 flex-col gap-4 p-6">
      <Outlet />
    </main>
    <Slot name="overlay" />
  </div>,
);
