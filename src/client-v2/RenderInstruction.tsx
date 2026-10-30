import { FilePdfOutlined } from '@ant-design/icons';
import { useFlowEngine } from '@nocobase/flow-engine';
import {
  Instruction,
  getCollectionFieldOptions,
  getCollectionManagerAdapter,
  parseCollectionName,
  type UseVariableOptions,
} from '@nocobase/plugin-workflow/client-v2';
import React from 'react';

import { tExpr, useT } from './locale';

type RenderNode = {
  key: string;
  title?: string;
  config?: { collection?: string; field?: string; fileCollection?: string };
};

export default class RenderInstruction extends Instruction {
  type = 'thirds-render';
  title = tExpr('Render PDF or image');
  group = 'extended';
  description = tExpr(
    'Render a record to a PDF or image with thirds.ai, save it to an attachment field, and pass the file to later nodes such as Mailer.',
  );
  icon = (<FilePdfOutlined />);

  FieldsetLoader = () => import('./components/RenderFieldset').then((m) => ({ default: m.RenderFieldset }));

  createDefaultConfig() {
    return {
      source: 'html',
      format: 'pdf',
      includeRecord: true,
      attachMode: 'replace',
      fileCollection: 'attachments',
      recordId: '{{$context.data.id}}',
      pdf: { format: 'A4', printBackground: true },
    };
  }

  /** The node result is a file record, so it shows up in Mailer's attachment picker. */
  useVariables = (node: RenderNode, options?: UseVariableOptions) => {
    const flowEngine = useFlowEngine();
    const t = useT();
    const config = node.config ?? {};
    let target = config.fileCollection || 'attachments';
    let dataSourceName = 'main';
    if (config.collection && config.field) {
      const [ds, collection] = parseCollectionName(config.collection) as [string, string];
      dataSourceName = ds || 'main';
      const cm = getCollectionManagerAdapter(flowEngine.context.dataSourceManager, dataSourceName);
      const field = cm.getCollectionAllFields(collection)?.find((f: any) => f.name === config.field);
      if (field?.target) target = field.target;
    }
    const collectionManager = getCollectionManagerAdapter(flowEngine.context.dataSourceManager, dataSourceName);
    const [result] = getCollectionFieldOptions({
      appends: [node.key],
      ...options,
      fields: [
        {
          collectionName: target,
          name: node.key,
          type: 'hasOne',
          target,
          uiSchema: { title: node.title },
        },
      ],
      compile: t,
      collectionManager,
    });
    return result;
  };
}
