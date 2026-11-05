import { ensureWebBuild } from '@joplo/server';

/** 测试前确保网页产物是最新的（服务也会检查，这里提前构建一次，避免并发构建）。 */
export default async function globalSetup() {
  await ensureWebBuild((m) => console.log(m));
}
