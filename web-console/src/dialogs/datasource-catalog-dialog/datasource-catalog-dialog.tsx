/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Button, Classes, Dialog, FormGroup, InputGroup, Intent } from '@blueprintjs/core';
import React, { useState } from 'react';

import { AutoForm, FormJsonSelector, FormJsonTabs, JsonInput } from '../../components';
import {
  COMPACTION_CONFIG_FIELDS,
  DATASOURCE_TABLE_SPEC_FIELDS,
  DatasourceTableSpec,
  TableMetadata,
} from '../../druid-models';
import { Api, AppToaster } from '../../singletons';
import { getDruidErrorMessage } from '../../utils';

import './datasource-catalog-dialog.scss';

export interface DatasourceCatalogDialogProps {
  existingTableMetadata: TableMetadata<DatasourceTableSpec> | undefined;
  onClose(): void;
  onChange(): void;
}

export const DatasourceCatalogDialog = React.memo(function DatasourceCatalogDialog(
  props: DatasourceCatalogDialogProps,
) {
  const { existingTableMetadata, onClose, onChange } = props;

  const [currentTab, setCurrentTab] = useState<FormJsonTabs>('form');
  const [newName, setNewName] = useState(existingTableMetadata?.id?.name || '');
  const [currentSpec, setCurrentSpec] = useState<Partial<DatasourceTableSpec>>(
    existingTableMetadata?.spec || {
      type: 'datasource',
      properties: {
        segmentGranularity: 'P1D',
      },
    },
  );
  const [jsonError, setJsonError] = useState<Error | undefined>();

  const issueWithCurrentCatalog = AutoForm.issueWithModel(
    currentSpec,
    DATASOURCE_TABLE_SPEC_FIELDS,
  );
  const disableSubmit = Boolean(jsonError || issueWithCurrentCatalog);

  return (
    <Dialog
      className="datasource-catalog-dialog"
      isOpen
      onClose={onClose}
      canOutsideClickClose={false}
      title="Datasource catalog"
    >
      <FormGroup className="table-name-group" label="Table name">
        <InputGroup
          value={newName}
          onChange={e => setNewName(e.target.value)}
          readOnly={Boolean(existingTableMetadata)}
        />
      </FormGroup>
      <FormJsonSelector tab={currentTab} onChange={setCurrentTab} />
      <div className="content">
        {currentTab === 'form' ? (
          <AutoForm
            fields={DATASOURCE_TABLE_SPEC_FIELDS}
            model={currentSpec}
            onChange={m => setCurrentSpec(m)}
          />
        ) : (
          <JsonInput
            value={currentSpec}
            onChange={v => {
              setCurrentSpec(v);
              setJsonError(undefined);
            }}
            onError={setJsonError}
            issueWithValue={value => AutoForm.issueWithModel(value, COMPACTION_CONFIG_FIELDS)}
            height="100%"
          />
        )}
      </div>
      <div className={Classes.DIALOG_FOOTER}>
        <div className={Classes.DIALOG_FOOTER_ACTIONS}>
          {Boolean(existingTableMetadata) && (
            <Button
              text="Delete"
              intent={Intent.DANGER}
              onClick={async () => {
                if (!existingTableMetadata) return;
                try {
                  await Api.instance.delete(
                    `/druid/coordinator/v1/catalog/schemas/druid/tables/${Api.encodePath(
                      existingTableMetadata.id.name,
                    )}`,
                  );
                } catch (e) {
                  AppToaster.show({
                    message: getDruidErrorMessage(e),
                    intent: Intent.DANGER,
                  });
                  return;
                }
                onChange();
                onClose();
              }}
            />
          )}
          <Button text="Close" onClick={onClose} />
          <Button
            text={existingTableMetadata ? 'Update' : 'Create'}
            intent={Intent.PRIMARY}
            disabled={disableSubmit}
            onClick={async () => {
              try {
                if (existingTableMetadata) {
                  // Update
                  const updateTime = existingTableMetadata.updateTime;
                  await Api.instance.post(
                    `/druid/coordinator/v1/catalog/schemas/druid/tables/${Api.encodePath(newName)}${
                      updateTime ? `?version=${updateTime}` : ''
                    }`,
                    currentSpec,
                  );
                } else {
                  // Create
                  await Api.instance.post(
                    `/druid/coordinator/v1/catalog/schemas/druid/tables/${Api.encodePath(newName)}`,
                    currentSpec,
                  );
                }
              } catch (e) {
                AppToaster.show({
                  message: getDruidErrorMessage(e),
                  intent: Intent.DANGER,
                });
                return;
              }
              onChange();
              onClose();
            }}
          />
        </div>
      </div>
    </Dialog>
  );
});
