import { tExpr as flowTExpr, useFlowEngine } from '@nocobase/flow-engine';

export const NAMESPACE = '@thirdsai/plugin-workflow-render';

export function useT() {
  const flowEngine = useFlowEngine();
  return (key: string, options?: Record<string, any>) =>
    flowEngine.context.t(key, { ns: [NAMESPACE, 'workflow', 'client'], nsMode: 'fallback', ...options });
}

export function tExpr(key: string, options?: Record<string, any>) {
  return flowTExpr(key, { ns: [NAMESPACE, 'workflow', 'client'], nsMode: 'fallback', ...options });
}
