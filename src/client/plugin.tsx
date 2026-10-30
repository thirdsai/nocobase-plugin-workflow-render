import { Plugin } from '@nocobase/client';

import RenderInstruction from '../client-v2/RenderInstruction';

export class PluginWorkflowRenderClient extends Plugin {
  async load() {
    const workflow = this.app.pm.get('workflow') as any;
    workflow?.registerInstruction?.('thirds-render', RenderInstruction);
  }
}

export default PluginWorkflowRenderClient;
