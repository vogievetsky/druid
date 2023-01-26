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

import { Button, Classes, Dialog, Intent } from '@blueprintjs/core';
import React, { useState } from 'react';

import { AutoForm, FormJsonSelector, FormJsonTabs, JsonInput } from '../../components';
import { COMPACTION_CONFIG_FIELDS, getInputCatalogFields, InputCatalog } from '../../druid-models';
import { Api, AppToaster } from '../../singletons';
import { getDruidErrorMessage } from '../../utils';

import './input-catalog-dialog.scss';

export interface InputCatalogDialogProps {
  inputCatalog: InputCatalog | undefined;
  onClose(): void;
  onChange(): void;
}

export const InputCatalogDialog = React.memo(function InputCatalogDialog(
  props: InputCatalogDialogProps,
) {
  const { inputCatalog, onClose, onChange } = props;

  const [currentTab, setCurrentTab] = useState<FormJsonTabs>('form');
  const [currentCatalog, setCurrentCatalog] = useState<Partial<InputCatalog>>(
    inputCatalog || {
      dbSchema: 'input',
      spec: {
        type: 'input',
        properties: {},
        columns: [],
      },
    },
  );
  const [jsonError, setJsonError] = useState<Error | undefined>();

  const inputCatalogFields = getInputCatalogFields(!inputCatalog);
  const issueWithCurrentCatalog = AutoForm.issueWithModel(currentCatalog, inputCatalogFields);
  const disableSubmit = Boolean(jsonError || issueWithCurrentCatalog);

  return (
    <Dialog
      className="input-catalog-dialog"
      isOpen
      onClose={onClose}
      canOutsideClickClose={false}
      title="Input catalog"
    >
      <FormJsonSelector tab={currentTab} onChange={setCurrentTab} />
      <div className="content">
        {currentTab === 'form' ? (
          <AutoForm
            fields={inputCatalogFields}
            model={currentCatalog}
            onChange={m => setCurrentCatalog(m)}
          />
        ) : (
          <JsonInput
            value={currentCatalog}
            onChange={v => {
              setCurrentCatalog(v);
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
          {inputCatalog && (
            <Button
              text="Delete"
              intent={Intent.DANGER}
              onClick={async () => {
                if (!inputCatalog) return;
                try {
                  await Api.instance.delete(
                    `/druid/coordinator/v1/catalog/tables/${Api.encodePath(
                      inputCatalog.dbSchema,
                    )}/${Api.encodePath(inputCatalog.name)}`,
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
            text={inputCatalog ? 'Update' : 'Create'}
            intent={Intent.PRIMARY}
            disabled={disableSubmit}
            onClick={async () => {
              try {
                if (inputCatalog) {
                  // Update
                  const updateTime = inputCatalog?.updateTime;
                  await Api.instance.post(
                    `/druid/coordinator/v1/catalog/tables/${Api.encodePath(
                      inputCatalog.dbSchema,
                    )}/${Api.encodePath(inputCatalog.name)}${
                      updateTime ? `?version=${updateTime}` : ''
                    }`,
                    currentCatalog.spec,
                  );
                } else {
                  // Create
                  await Api.instance.post(`/druid/coordinator/v1/catalog/tables`, currentCatalog);
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
