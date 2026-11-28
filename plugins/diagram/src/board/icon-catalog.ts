/**
 * Pure-data tech icon ID catalog and alias resolver (zero React / DOM imports — safe for Node compile entrypoint).
 */
export const TECH_ICONS = [
  'aws', 'aws-lambda', 'aws-s3', 'aws-ec2', 'aws-rds', 'aws-dynamodb', 'aws-sqs', 'aws-cloudfront', 'aws-apigw',
  'gcp', 'azure', 'cloudflare', 'workers', 'vercel', 'supabase', 'firebase',
  'docker', 'kubernetes', 'k8s-pod', 'k8s-deploy', 'k8s-svc', 'k8s-ing', 'k8s-cm', 'k8s-pv',
  'helm', 'terraform', 'nginx', 'envoy', 'linux', 'git', 'github', 'github-actions', 'gitlab', 'jenkins', 'ansible', 'consul', 'vault', 'argo',
  'postgres', 'mysql', 'sqlite', 'mongodb', 'redis', 'kafka', 'rabbitmq', 'elasticsearch',
  'clickhouse', 'duckdb', 'snowflake', 'spark', 'airflow', 'prisma', 'graphql',
  'typescript', 'javascript', 'python', 'go', 'rust', 'java', 'swift', 'cpp', 'nodejs', 'bun', 'deno', 'wasm',
  'react', 'nextjs', 'vue', 'svelte', 'tailwind', 'vite', 'fastapi', 'pytorch', 'grpc', 'pnpm', 'figma',
  'prometheus', 'grafana', 'otel', 'datadog', 'sentry', 'stripe', 'slack', 'notion', 'linear', 'discord',
] as const;

export type TechIconId = (typeof TECH_ICONS)[number];

const SET = new Set<string>(TECH_ICONS);
const ALIASES: Record<string, TechIconId> = {
  amazon: 'aws', amazonwebservices: 'aws', lambda: 'aws-lambda', s3: 'aws-s3', ec2: 'aws-ec2',
  rds: 'aws-rds', dynamodb: 'aws-dynamodb', sqs: 'aws-sqs', cloudfront: 'aws-cloudfront', apigw: 'aws-apigw', apigateway: 'aws-apigw',
  googlecloud: 'gcp', cloudflareworkers: 'workers', k8s: 'kubernetes', pod: 'k8s-pod', deploy: 'k8s-deploy',
  service: 'k8s-svc', ingress: 'k8s-ing', configmap: 'k8s-cm', volume: 'k8s-pv',
  postgresql: 'postgres', pg: 'postgres', mongo: 'mongodb', elastic: 'elasticsearch',
  ts: 'typescript', js: 'javascript', py: 'python', golang: 'go', node: 'nodejs',
  next: 'nextjs', tailwindcss: 'tailwind', opentelemetry: 'otel', gh: 'github',
  actions: 'github-actions', githubactions: 'github-actions', webassembly: 'wasm', argocd: 'argo',
};

export function resolveTechIconId(name: unknown): TechIconId | null {
  if (typeof name !== 'string' || !name) return null;
  const raw = name.trim().toLowerCase();
  if (SET.has(raw)) return raw as TechIconId;
  const k = raw.replace(/[^a-z0-9]/g, '');
  return ALIASES[k] ?? null;
}
