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

import { Button, Intent } from '@blueprintjs/core';
import { IconNames } from '@blueprintjs/icons';
import React from 'react';
import type { Filter } from 'react-table';
import ReactTable from 'react-table';

import {
  ACTION_COLUMN_ID,
  ACTION_COLUMN_LABEL,
  ACTION_COLUMN_WIDTH,
  ActionCell,
  RefreshButton,
  TableClickableCell,
  TableColumnSelector,
  TableFilterableCell,
  ViewControlBar,
} from '../../components';
import { AsyncActionDialog, InputCatalogDialog } from '../../dialogs/';
import type { CatalogEntry, ExternalTableSpec } from '../../druid-models';
import { STANDARD_TABLE_PAGE_SIZE, STANDARD_TABLE_PAGE_SIZE_OPTIONS } from '../../react-table';
import { Api } from '../../singletons';
import {
  deepGet,
  hasPopoverOpen,
  LocalStorageBackedVisibility,
  LocalStorageKeys,
  QueryManager,
  QueryState,
} from '../../utils';
import type { BasicAction } from '../../utils/basic-action';

import './inputs-view.scss';

const tableColumns: string[] = [
  'Lookup name',
  'Lookup tier',
  'Type',
  'Version',
  'Poll period',
  'Summary',
  ACTION_COLUMN_LABEL,
];

interface InputCatalogDialogOpenOn {
  readonly inputCatalog?: CatalogEntry<ExternalTableSpec>;
}

export interface InputsViewProps {}

export interface InputsViewState {
  inputCatalogsState: QueryState<CatalogEntry<ExternalTableSpec>[]>;
  inputFilter: Filter[];

  inputCatalogDialogOpenOn?: InputCatalogDialogOpenOn;
  deleteInputName?: string;

  visibleColumns: LocalStorageBackedVisibility;

  actions: BasicAction[];
}

export class InputsView extends React.PureComponent<InputsViewProps, InputsViewState> {
  private readonly inputsQueryManager: QueryManager<null, CatalogEntry<ExternalTableSpec>[]>;

  constructor(props: InputsViewProps) {
    super(props);
    this.state = {
      inputCatalogsState: QueryState.INIT,
      inputFilter: [],
      actions: [],

      visibleColumns: new LocalStorageBackedVisibility(
        LocalStorageKeys.LOOKUP_TABLE_COLUMN_SELECTION,
      ),
    };

    this.inputsQueryManager = new QueryManager({
      processQuery: async () => {
        return (
          await Api.instance.get<CatalogEntry<ExternalTableSpec>[]>(
            '/druid/coordinator/v1/catalog/schemas/ext/tables?format=metadata',
          )
        ).data;
      },
      onStateChange: inputCatalogsState => {
        this.setState({
          inputCatalogsState,
        });
      },
    });
  }

  componentDidMount(): void {
    this.inputsQueryManager.runQuery(null);
  }

  componentWillUnmount(): void {
    this.inputsQueryManager.terminate();
  }

  private getLookupActions(lookupTier: string, lookupId: string): BasicAction[] {
    return [
      {
        icon: IconNames.EDIT,
        title: 'Edit',
        onAction: () => {
          console.log(lookupTier, lookupId);
        },
      },
      {
        icon: IconNames.CROSS,
        title: 'Delete',
        intent: Intent.DANGER,
        onAction: () => {},
      },
    ];
  }

  private renderDeleteInputAction() {
    const { deleteInputName } = this.state;
    if (!deleteInputName) return;

    return (
      <AsyncActionDialog
        action={async () => {
          await Api.instance.delete(
            `/druid/coordinator/v1/catalog/tables/input/${Api.encodePath(deleteInputName)}`,
          );
        }}
        confirmButtonText="Delete input"
        successText="Input was deleted"
        failText="Could not delete input"
        intent={Intent.DANGER}
        onClose={() => {
          this.setState({ deleteInputName: undefined });
        }}
        onSuccess={() => {
          this.inputsQueryManager.rerunLastQuery();
        }}
      >
        <p>{`Are you sure you want to delete the input '${deleteInputName}'?`}</p>
      </AsyncActionDialog>
    );
  }

  private renderInputCatalogDialog() {
    const { inputCatalogDialogOpenOn } = this.state;
    if (!inputCatalogDialogOpenOn) return;

    return (
      <InputCatalogDialog
        existingCatalogEntry={inputCatalogDialogOpenOn.inputCatalog}
        onClose={() => this.setState({ inputCatalogDialogOpenOn: undefined })}
        onChange={() => {
          this.inputsQueryManager.rerunLastQuery();
        }}
      />
    );
  }

  // private onDetail(lookup: LookupEntry): void {
  //   const lookupId = lookup.id;
  //   const lookupTier = lookup.tier;
  //   this.setState({
  //     lookupTableActionDialogId: lookupId,
  //     actions: this.getLookupActions(lookupTier, lookupId),
  //   });
  // }

  private renderFilterableCell(field: string) {
    const { inputFilter } = this.state;

    return (row: { value: any }) => (
      <TableFilterableCell
        field={field}
        value={row.value}
        filters={inputFilter}
        onFiltersChange={filters => this.setState({ inputFilter: filters })}
      >
        {row.value}
      </TableFilterableCell>
    );
  }

  private renderInputsTable() {
    const { inputCatalogsState, inputFilter, visibleColumns } = this.state;
    const inputCatalogs = inputCatalogsState.data || [];

    return (
      <ReactTable
        data={inputCatalogs}
        loading={inputCatalogsState.loading}
        noDataText={
          !inputCatalogsState.loading && !inputCatalogs.length
            ? 'No inputs'
            : inputCatalogsState.getErrorMessage() || ''
        }
        filterable
        filtered={inputFilter}
        onFilteredChange={filtered => {
          this.setState({ inputFilter: filtered });
        }}
        defaultSorted={[{ id: 'input_name', desc: false }]}
        defaultPageSize={STANDARD_TABLE_PAGE_SIZE}
        pageSizeOptions={STANDARD_TABLE_PAGE_SIZE_OPTIONS}
        showPagination={inputCatalogs.length > STANDARD_TABLE_PAGE_SIZE}
        columns={[
          {
            Header: 'Input name',
            show: visibleColumns.shown('Lookup name'),
            id: 'input_name',
            accessor: d => deepGet(d, 'id.name'),
            filterable: true,
            width: 200,
            Cell: ({ value, original }) => (
              <TableClickableCell
                hoverIcon={IconNames.SEARCH_TEMPLATE}
                onClick={() =>
                  this.setState({
                    inputCatalogDialogOpenOn: {
                      inputCatalog: original,
                    },
                  })
                }
              >
                {value}
              </TableClickableCell>
            ),
          },
          {
            Header: 'Source',
            show: visibleColumns.shown('Lookup tier'),
            id: 'source',
            accessor: d => deepGet(d, 'spec.properties.source.type'),
            filterable: true,
            width: 400,
            Cell: this.renderFilterableCell('source'),
          },
          {
            Header: 'Format',
            show: visibleColumns.shown('Lookup tier'),
            id: 'format',
            accessor: d => deepGet(d, 'spec.properties.format.type'),
            filterable: true,
            width: 400,
            Cell: this.renderFilterableCell('format'),
          },
          {
            Header: ACTION_COLUMN_LABEL,
            show: visibleColumns.shown(ACTION_COLUMN_LABEL),
            id: ACTION_COLUMN_ID,
            width: ACTION_COLUMN_WIDTH,
            filterable: false,
            accessor: 'id',
            Cell: ({ original }) => {
              const lookupId = original.id;
              const lookupTier = original.tier;
              const lookupActions = this.getLookupActions(lookupTier, lookupId);
              return (
                <ActionCell
                  onDetail={() => {
                    console.log(original);
                  }}
                  actions={lookupActions}
                />
              );
            },
          },
        ]}
      />
    );
  }

  render(): JSX.Element {
    const { visibleColumns } = this.state;

    return (
      <div className="inputs-view app-view">
        <ViewControlBar label="Inputs">
          <RefreshButton
            onRefresh={auto => {
              if (auto && hasPopoverOpen()) return;
              this.inputsQueryManager.rerunLastQuery(auto);
            }}
            localStorageKey={LocalStorageKeys.LOOKUPS_REFRESH_RATE}
          />
          <Button
            icon={IconNames.PLUS}
            text="Add input"
            onClick={() =>
              this.setState({
                inputCatalogDialogOpenOn: {},
              })
            }
          />
          <TableColumnSelector
            columns={tableColumns}
            onChange={column =>
              this.setState(prevState => ({
                visibleColumns: prevState.visibleColumns.toggle(column),
              }))
            }
            tableColumnsHidden={visibleColumns.getHiddenColumns()}
          />
        </ViewControlBar>
        {this.renderInputsTable()}
        {this.renderDeleteInputAction()}
        {this.renderInputCatalogDialog()}
      </div>
    );
  }
}
