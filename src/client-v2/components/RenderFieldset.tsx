import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  CollectionCascader,
  FieldsSelect,
  WorkflowVariableInput,
  WorkflowVariableJsonTextArea,
  WorkflowVariableTextArea,
} from '@nocobase/plugin-workflow/client-v2';
import { Button, Checkbox, Col, Divider, Form, Input, InputNumber, Radio, Row, Select, Space, Typography } from 'antd';
import React from 'react';

import { useT } from '../locale';
import { STARTERS } from '../presets';

const PAGE_FORMATS = ['A4', 'A5', 'A6', 'A3', 'Letter', 'Legal', 'Tabloid'];

const isAttachmentField = (field: any) =>
  field?.interface === 'attachment' ||
  (['belongsToMany', 'hasMany', 'belongsTo'].includes(field?.type) && /attachment|file/i.test(String(field?.target ?? '')));

function StarterPicker() {
  const t = useT();
  const form = Form.useFormInstance();
  return (
    <Select
      placeholder={t('Insert a starter layout')}
      style={{ minWidth: 220 }}
      value={null}
      options={STARTERS.map((s) => ({ value: s.key, label: t(s.label) }))}
      onChange={(key) => {
        const s = STARTERS.find((x) => x.key === key);
        if (!s) return;
        form.setFieldValue(['config', 'html'], s.html);
        form.setFieldValue(['config', 'format'], s.format);
        if (s.qr) form.setFieldValue(['config', 'qrCodes'], s.qr);
        if (s.image) form.setFieldValue(['config', 'image'], s.image);
      }}
    />
  );
}

function QrCodesField() {
  const t = useT();
  return (
    <Form.Item
      label={t('QR codes')}
      extra={
        <>
          {t('Each QR code is made inside NocoBase as an image. Use it in HTML as')} <code>{'<img src="{{ qr.name | safe }}">'}</code>
        </>
      }
    >
      <Form.List name={['config', 'qrCodes']}>
        {(fields, { add, remove }) => (
          <Space direction="vertical" style={{ width: '100%' }}>
            {fields.map((field) => (
              <Row key={field.key} gutter={8} align="middle">
                <Col span={6}>
                  <Form.Item name={[field.name, 'name']} noStyle rules={[{ required: true }]}>
                    <Input placeholder={t('Name, for example code')} />
                  </Form.Item>
                </Col>
                <Col flex="auto">
                  <Form.Item name={[field.name, 'value']} noStyle rules={[{ required: true }]}>
                    <WorkflowVariableInput placeholder={t('Value or link to encode')} />
                  </Form.Item>
                </Col>
                <Col>
                  <Button aria-label={t('Delete')} icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                </Col>
              </Row>
            ))}
            <Button block icon={<PlusOutlined />} type="dashed" onClick={() => add({ name: '', value: '' })}>
              {t('Add QR code')}
            </Button>
          </Space>
        )}
      </Form.List>
    </Form.Item>
  );
}

export function RenderFieldset() {
  const t = useT();
  const form = Form.useFormInstance();
  const source = Form.useWatch(['config', 'source'], form) ?? 'html';
  const format = Form.useWatch(['config', 'format'], form) ?? 'pdf';
  const collection = Form.useWatch(['config', 'collection'], form);

  return (
    <>
      <Divider orientation="left">{t('Record')}</Divider>
      <Form.Item
        name={['config', 'collection']}
        label={t('Collection')}
        extra={t('The record to render and to save the file on.')}
      >
        <CollectionCascader />
      </Form.Item>
      {collection ? (
        <>
          <Form.Item name={['config', 'recordId']} label={t('Record ID')}>
            <WorkflowVariableInput placeholder="{{$context.data.id}}" />
          </Form.Item>
          <Row gutter={8}>
            <Col span={12}>
              <Form.Item name={['config', 'field']} label={t('Save to attachment field')}>
                <FieldsSelect collection={collection} filter={isAttachmentField} allowClear />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name={['config', 'attachMode']} label={t('When the field has files')} initialValue="replace">
                <Radio.Group
                  options={[
                    { value: 'replace', label: t('Replace') },
                    { value: 'append', label: t('Add') },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name={['config', 'includeRecord']} valuePropName="checked" initialValue={true}>
            <Checkbox>{t('Send the record to the template as record')}</Checkbox>
          </Form.Item>
          <Form.Item
            name={['config', 'recordFields']}
            label={t('Only these fields')}
            extra={t('Leave empty to send every field.')}
          >
            <FieldsSelect collection={collection} mode="multiple" allowClear filter={(f: any) => !isAttachmentField(f)} />
          </Form.Item>
        </>
      ) : null}

      <Divider orientation="left">{t('Layout')}</Divider>
      <Form.Item name={['config', 'source']} label={t('Source')} initialValue="html">
        <Radio.Group
          options={[
            { value: 'html', label: t('HTML') },
            { value: 'template', label: t('Saved thirds.ai template (coming in a later version)'), disabled: true },
          ]}
        />
      </Form.Item>
      {source === 'template' ? (
        <Row gutter={8}>
          <Col span={14}>
            <Form.Item name={['config', 'templateId']} label={t('Template ID')} rules={[{ required: true }]}>
              <Input placeholder="tpl_..." />
            </Form.Item>
          </Col>
          <Col span={5}>
            <Form.Item name={['config', 'templateVersion']} label={t('Version')}>
              <InputNumber min={1} style={{ width: '100%' }} placeholder={t('Latest')} />
            </Form.Item>
          </Col>
          <Col span={5}>
            <Form.Item name={['config', 'sizeId']} label={t('Size ID')}>
              <Input placeholder={t('Optional')} />
            </Form.Item>
          </Col>
        </Row>
      ) : (
        <Form.Item
          label={
            <Space>
              {t('HTML')}
              <StarterPicker />
            </Space>
          }
          extra={
            <Typography.Text type="secondary">
              {t('Insert NocoBase variables, or use template tags that thirds.ai fills from the data, such as')}{' '}
              <code>{'{{ title }}'}</code> <code>{"{{ record.amount | default('') }}"}</code>{' '}
              <code>{'{% for f in fields %}'}</code> <code>{'{{ qr.code | safe }}'}</code>.{' '}
              {t('A missing value stops the render, so give optional fields a default.')}
            </Typography.Text>
          }
        >
          <Form.Item name={['config', 'html']} noStyle rules={[{ required: true }]}>
            <WorkflowVariableTextArea autoSize={{ minRows: 8, maxRows: 24 }} placeholder="<h1>{{ title }}</h1>" />
          </Form.Item>
        </Form.Item>
      )}
      <Form.Item
        name={['config', 'data']}
        label={t('Extra data')}
        extra={t('A JSON object merged into the template data. record, title, fields and qr are added for you.')}
      >
        <WorkflowVariableJsonTextArea autoSize={{ minRows: 3 }} />
      </Form.Item>
      <QrCodesField />

      <Divider orientation="left">{t('Output')}</Divider>
      <Row gutter={8}>
        <Col span={10}>
          <Form.Item name={['config', 'format']} label={t('Format')} initialValue="pdf">
            <Radio.Group
              optionType="button"
              options={[
                { value: 'pdf', label: 'PDF' },
                { value: 'png', label: 'PNG' },
                { value: 'jpeg', label: 'JPEG' },
                { value: 'webp', label: 'WebP' },
              ]}
            />
          </Form.Item>
        </Col>
        <Col span={14}>
          <Form.Item name={['config', 'filename']} label={t('File name')} extra={t('The extension is added for you.')}>
            <WorkflowVariableInput placeholder="invoice-{{$context.data.id}}" />
          </Form.Item>
        </Col>
      </Row>
      {format === 'pdf' ? (
        <Row gutter={8}>
          <Col span={8}>
            <Form.Item name={['config', 'pdf', 'format']} label={t('Page size')} initialValue="A4">
              <Select options={PAGE_FORMATS.map((v) => ({ value: v, label: v }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name={['config', 'pdf', 'margin']} label={t('Margin')}>
              <Input placeholder="10mm" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name={['config', 'pdf', 'landscape']} label=" " valuePropName="checked">
              <Checkbox>{t('Landscape')}</Checkbox>
            </Form.Item>
          </Col>
        </Row>
      ) : (
        <Row gutter={8}>
          <Col span={8}>
            <Form.Item name={['config', 'image', 'width']} label={t('Width (px)')}>
              <InputNumber min={320} max={7680} style={{ width: '100%' }} placeholder="1280" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name={['config', 'image', 'height']} label={t('Height (px)')}>
              <InputNumber min={200} max={4320} style={{ width: '100%' }} placeholder="720" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name={['config', 'image', 'transparent']} label=" " valuePropName="checked">
              <Checkbox disabled={format === 'jpeg'}>{t('Transparent background')}</Checkbox>
            </Form.Item>
          </Col>
        </Row>
      )}
      <Row gutter={8}>
        <Col span={12}>
          <Form.Item name={['config', 'timeoutSeconds']} label={t('Timeout (seconds)')}>
            <InputNumber min={10} max={600} style={{ width: '100%' }} placeholder="120" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name={['config', 'ignoreFail']} label=" " valuePropName="checked">
            <Checkbox>{t('Continue the workflow if rendering fails')}</Checkbox>
          </Form.Item>
        </Col>
      </Row>
    </>
  );
}
