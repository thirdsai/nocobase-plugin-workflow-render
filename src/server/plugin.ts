import { Plugin } from '@nocobase/server';
import PluginWorkflowServer from '@nocobase/plugin-workflow';

import RenderInstruction, { INSTRUCTION_TYPE } from './RenderInstruction';

export class PluginWorkflowRenderServer extends Plugin {
  async load() {
    const workflow = this.app.pm.get(PluginWorkflowServer) as PluginWorkflowServer;
    workflow.registerInstruction(INSTRUCTION_TYPE, RenderInstruction);
  }
}

export default PluginWorkflowRenderServer;
