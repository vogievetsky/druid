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
import { IconNames } from '@blueprintjs/icons';
import React, { useState } from 'react';

import type { FormJsonTabs } from '../../components';
import { AutoForm, CatalogColumnEntry, FormJsonSelector, JsonInput } from '../../components';
import type { CatalogColumn, CatalogEntry, DatasourceTableSpec } from '../../druid-models';
import { DATASOURCE_TABLE_SPEC_FIELDS } from '../../druid-models';
import { Api, AppToaster } from '../../singletons';
import { getDruidErrorMessage, swapElements } from '../../utils';

import './datasource-catalog-dialog.scss';

export interface DatasourceCatalogDialogProps {
  existingCatalogEntry: CatalogEntry<DatasourceTableSpec> | undefined;
  initDatasource: string | undefined;
  onClose(): void;
  onChange(): void;
}

export const DatasourceCatalogDialog = React.memo(function DatasourceCatalogDialog(
  props: DatasourceCatalogDialogProps,
) {
  const { existingCatalogEntry, initDatasource, onClose, onChange } = props;

  const [currentTab, setCurrentTab] = useState<FormJsonTabs>('form');
  const [newName, setNewName] = useState(existingCatalogEntry?.id?.name || initDatasource || '');
  const [currentSpec, setCurrentSpec] = useState<Partial<DatasourceTableSpec>>(
    existingCatalogEntry?.spec || {
      type: 'datasource',
      properties: {
        segmentGranularity: 'P1D',
      },
      columns: [
        {
          name: '__time',
          sqlType: 'TIMESTAMP',
          properties: {
            description: 'The primary time column',
          },
        },
      ],
    },
  );
  const [jsonError, setJsonError] = useState<Error | undefined>();

  const issueWithCurrentCatalog = AutoForm.issueWithModel(
    currentSpec,
    DATASOURCE_TABLE_SPEC_FIELDS,
  );
  const disableSubmit = Boolean(jsonError || issueWithCurrentCatalog);
  const columns = currentSpec.columns || [];
  const lastColumnIndex = columns.length - 1;

  function changeColumns(columns: CatalogColumn[]): void {
    setCurrentSpec({ ...currentSpec, columns });
  }

  const isNew = !existingCatalogEntry && !initDatasource;
  return (
    <Dialog
      className="datasource-catalog-dialog"
      isOpen
      onClose={onClose}
      canOutsideClickClose={false}
      title={isNew ? 'New catalog entry' : `Catalog entry for: ${newName}`}
    >
      {isNew && (
        <FormGroup className="table-name-group" label="Table name">
          <InputGroup value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
        </FormGroup>
      )}
      <FormJsonSelector tab={currentTab} onChange={setCurrentTab} />
      <div className="content">
        {currentTab === 'form' ? (
          <>
            <AutoForm
              fields={DATASOURCE_TABLE_SPEC_FIELDS}
              model={currentSpec}
              onChange={m => setCurrentSpec(m)}
            />
            <FormGroup label="Columns">
              {columns.map((column, i) => (
                <CatalogColumnEntry
                  key={i}
                  column={column}
                  onMove={direction => changeColumns(swapElements(columns, i, i + direction))}
                  onChange={c => changeColumns(columns.map((col, j) => (i === j ? c : col)))}
                  onDelete={() => changeColumns(columns.filter((_, j) => i !== j))}
                  first={i === 0}
                  last={i === lastColumnIndex}
                />
              ))}
              <Button
                fill
                icon={IconNames.PLUS}
                onClick={() =>
                  changeColumns(
                    columns.concat([
                      {
                        name: '',
                        sqlType: 'VARCHAR',
                      },
                    ]),
                  )
                }
              />
            </FormGroup>
          </>
        ) : (
          <JsonInput
            value={currentSpec}
            onChange={v => {
              setCurrentSpec(v);
              setJsonError(undefined);
            }}
            onError={setJsonError}
            issueWithValue={value => AutoForm.issueWithModel(value, DATASOURCE_TABLE_SPEC_FIELDS)}
            height="100%"
          />
        )}
      </div>
      <div className={Classes.DIALOG_FOOTER}>
        <div className={Classes.DIALOG_FOOTER_ACTIONS}>
          {Boolean(existingCatalogEntry) && (
            <Button
              text="Delete"
              intent={Intent.DANGER}
              onClick={async () => {
                if (!existingCatalogEntry) return;
                try {
                  await Api.instance.delete(
                    `/druid/coordinator/v1/catalog/schemas/druid/tables/${Api.encodePath(
                      existingCatalogEntry.id.name,
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
            text={existingCatalogEntry ? 'Update' : 'Create'}
            intent={Intent.PRIMARY}
            disabled={disableSubmit}
            onClick={async () => {
              try {
                if (existingCatalogEntry) {
                  // Update
                  const updateTime = existingCatalogEntry.updateTime;
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
