/** 同一个文件的几个版本：后面步骤的行号按这里算。 */
export const V1 = `export async function loadUser(id: string) {
  const res = await fetch(\`/api/users/\${id}\`);
  return res.json();
}`;

/** 第 2 行之后逐字打出的检查。 */
export const CHECK = `  if (!res.ok) throw new HttpError(res.status);`;

export const V3 = `const RETRIES = 3;

export async function loadUser(id: string) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(\`/api/users/\${id}\`);
    if (res.ok) return res.json();
    const retryable = res.status >= 500;
    if (!retryable || attempt === RETRIES) throw new HttpError(res.status);
    await sleep(200 * 2 ** attempt);
  }
}`;
