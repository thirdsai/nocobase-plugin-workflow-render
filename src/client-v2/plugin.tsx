import type { Application } from '@nocobase/client-v2';
import { Plugin } from '@nocobase/client-v2';
import type { PluginWorkflowClientV2 } from '@nocobase/plugin-workflow/client-v2';

import RenderInstruction from './RenderInstruction';

export class PluginWorkflowRenderClientV2 extends Plugin<Record<string, never>, Application> {
  async load() {
    const workflow = this.app.pm.get('workflow') as PluginWorkflowClientV2 | undefined;
    workflow?.registerInstruction?.('thirds-render', RenderInstruction);
  }
}

export default PluginWorkflowRenderClientV2;
