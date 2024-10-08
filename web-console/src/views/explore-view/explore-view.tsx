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

import './modules';

import {
  Button,
  ButtonGroup,
  Intent,
  Menu,
  MenuDivider,
  MenuItem,
  Popover,
  Position,
} from '@blueprintjs/core';
import { IconNames } from '@blueprintjs/icons';
import type { Column, QueryResult, SqlExpression } from '@druid-toolkit/query';
import { QueryRunner, SqlQuery } from '@druid-toolkit/query';
import type { CancelToken } from 'axios';
import classNames from 'classnames';
import copy from 'copy-to-clipboard';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { Loader } from '../../components';
import { ShowValueDialog } from '../../dialogs/show-value-dialog/show-value-dialog';
import { useHashAndLocalStorageHybridState, useQueryManager } from '../../hooks';
import { Api, AppToaster } from '../../singletons';
import { DruidError, LocalStorageKeys, queryDruidSql } from '../../utils';

import {
  DroppableContainer,
  FilterPane,
  HighlightBubble,
  ModulePane,
  ResourcePane,
  SourcePane,
  SourceQueryPane,
} from './components';
import type { Measure, ModuleState } from './models';
import { ExploreState, QuerySource } from './models';
import { rewriteAggregate, rewriteMaxDataTime } from './query-macros';
import type { Rename } from './utils';
import { QueryLog } from './utils';

import './explore-view.scss';

const QUERY_LOG = new QueryLog();

// ---------------------------------------

const queryRunner = new QueryRunner({
  inflateDateStrategy: 'fromSqlTypes',
  executor: async (sqlQueryPayload, isSql, cancelToken) => {
    if (!isSql) throw new Error('should never get here');
    QUERY_LOG.addQuery(sqlQueryPayload.query);
    return Api.instance.post('/druid/v2/sql', sqlQueryPayload, { cancelToken });
  },
});

async function runSqlQuery(
  query: string | SqlQuery,
  cancelToken?: CancelToken,
): Promise<QueryResult> {
  try {
    return await queryRunner.runQuery({
      query,
      defaultQueryContext: {
        sqlStringifyArrays: false,
      },
      cancelToken,
    });
  } catch (e) {
    throw new DruidError(e);
  }
}

async function introspectSource(source: string, cancelToken?: CancelToken): Promise<QuerySource> {
  const query = SqlQuery.parse(source);
  const introspectResult = await runSqlQuery(QuerySource.makeLimitZeroIntrospectionQuery(query));

  cancelToken?.throwIfRequested();
  const baseIntrospectResult = QuerySource.isSingleStarQuery(query)
    ? introspectResult
    : await runSqlQuery(
        QuerySource.makeLimitZeroIntrospectionQuery(QuerySource.stripToBaseSource(query)),
        cancelToken,
      );

  return QuerySource.fromIntrospectResult(
    query,
    baseIntrospectResult.header,
    introspectResult.header,
  );
}

export const ExploreView = React.memo(function ExploreView() {
  const [shownText, setShownText] = useState<string | undefined>();
  const filterPane = useRef<{ filterOn(column: Column): void }>();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [exploreState, setExploreState] = useHashAndLocalStorageHybridState<ExploreState>(
    '#explore/v/',
    LocalStorageKeys.EXPLORE_STATE,
    ExploreState.DEFAULT_STATE,
    s => {
      return ExploreState.fromJS(s);
    },
  );

  // -------------------------------------------------------
  // If no table selected, change to first table if possible
  async function initWithFirstTable() {
    const tables = await queryDruidSql<{ TABLE_NAME: string }>({
      query: `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'TABLE' LIMIT 1`,
    });

    const firstTableName = tables[0].TABLE_NAME;
    if (firstTableName) {
      setExploreState(exploreState.initToTable(firstTableName));
    }
  }

  useEffect(() => {
    if (exploreState.isInitState()) {
      void initWithFirstTable();
    }
  });

  // -------------------------------------------------------

  const { source, parsedSource, parseError, where, showSourceQuery, moduleStates, showHelpers } =
    exploreState;

  const [querySourceState] = useQueryManager<string, QuerySource>({
    query: parsedSource ? String(parsedSource) : undefined,
    processQuery: introspectSource,
  });

  // -------------------------------------------------------
  // If we have a TIMESTAMP column and no filter add a filter

  useEffect(() => {
    const columns = querySourceState.data?.columns;
    if (!columns) return;
    const newExploreState = exploreState.addInitTimeFilterIfNeeded(columns);
    if (exploreState !== newExploreState) {
      setExploreState(newExploreState);
    }
  }, [querySourceState.data]);

  // -------------------------------------------------------

  useEffect(() => {
    const querySource = querySourceState.data;
    if (!querySource) return;
    const newExploreState = exploreState.restrictToQuerySource(querySource);
    if (exploreState !== newExploreState) {
      setExploreState(newExploreState);
    }
  }, [querySourceState.data]);

  function setModuleState(index: number, moduleState: ModuleState) {
    setExploreState(exploreState.changeModuleState(index, moduleState));
  }

  function setSource(source: SqlQuery | string, rename?: Rename) {
    setExploreState(exploreState.changeSource(source, rename));
  }

  function setTable(tableName: string) {
    setExploreState(exploreState.changeToTable(tableName));
  }

  function setWhere(where: SqlExpression) {
    setExploreState(exploreState.change({ where }));
  }

  function onShowColumn(column: Column) {
    setExploreState(exploreState.applyShowColumn(column));
  }

  function onShowMeasure(measure: Measure) {
    setExploreState(exploreState.applyShowMeasure(measure));
  }

  function onShowSourceQuery() {
    setExploreState(exploreState.change({ showSourceQuery: true }));
  }

  const querySource = querySourceState.getSomeData();

  const runSqlPlusQuery = useMemo(() => {
    return async (query: string | SqlQuery, cancelToken?: CancelToken) => {
      if (!querySource) throw new Error('no querySource');
      const parsedQuery = SqlQuery.parse(query);
      return (
        await runSqlQuery(
          await rewriteMaxDataTime(rewriteAggregate(parsedQuery, querySource.measures)),
          cancelToken,
        )
      ).attachQuery({ query: '' }, parsedQuery);
    };
  }, [querySource]);

  return (
    <div
      className={classNames('explore-view', {
        'show-source-query': showSourceQuery,
      })}
    >
      {showSourceQuery && (
        <SourceQueryPane
          source={source}
          onSourceChange={setSource}
          onClose={() => setExploreState(exploreState.change({ showSourceQuery: false }))}
        />
      )}
      {parseError && (
        <div className="source-error">
          <p>{parseError}</p>
          {source === '' && (
            <p>
              <SourcePane
                selectedSource={undefined}
                onSelectTable={setTable}
                disabled={Boolean(querySource && querySourceState.loading)}
              />
            </p>
          )}
          {!showSourceQuery && (
            <p>
              <Button text="Show source query" onClick={onShowSourceQuery} />
            </p>
          )}
        </div>
      )}
      {parsedSource && (
        <div
          className={classNames('explore-container', showHelpers ? 'show-helpers' : 'no-helpers')}
        >
          <SourcePane
            selectedSource={parsedSource}
            onSelectTable={setTable}
            onShowSourceQuery={onShowSourceQuery}
            fill
            minimal
            disabled={Boolean(querySource && querySourceState.loading)}
          />
          <div className="filter-pane-container">
            <FilterPane
              ref={filterPane}
              querySource={querySource}
              filter={where}
              onFilterChange={setWhere}
              runSqlQuery={runSqlPlusQuery}
              onAddToSourceQueryAsColumn={expression => {
                if (!querySource) return;
                setExploreState(
                  exploreState.changeSource(
                    querySource.addColumn(querySource.transformToBaseColumns(expression)),
                    undefined,
                  ),
                );
              }}
              onMoveToSourceQueryAsClause={(expression, changeWhere) => {
                if (!querySource) return;
                setExploreState(
                  exploreState
                    .change({ where: changeWhere })
                    .changeSource(
                      querySource.addWhereClause(querySource.transformToBaseColumns(expression)),
                      undefined,
                    ),
                );
              }}
            />
            <ButtonGroup className="action-buttons">
              <Popover
                position={Position.BOTTOM_RIGHT}
                content={
                  <Menu>
                    <MenuItem
                      icon={IconNames.DUPLICATE}
                      text="Copy last query"
                      disabled={!QUERY_LOG.length()}
                      onClick={() => {
                        copy(QUERY_LOG.getLastQuery()!, { format: 'text/plain' });
                        AppToaster.show({
                          message: `Copied query to clipboard`,
                          intent: Intent.SUCCESS,
                        });
                      }}
                    />
                    <MenuItem
                      icon={IconNames.HISTORY}
                      text="Show query log"
                      onClick={() => {
                        setShownText(QUERY_LOG.getFormatted());
                      }}
                    />
                    <MenuDivider />
                    <MenuItem
                      icon={IconNames.DUPLICATE}
                      text="Duplicate last module"
                      onClick={() => {
                        setExploreState(exploreState.duplicateLastModule());
                      }}
                    />
                    <MenuItem icon={IconNames.LAYOUT} text="Layout">
                      <MenuItem
                        text="Vertical"
                        onClick={() => {
                          setExploreState(exploreState.change({ layout: 'vertical' }));
                        }}
                      />
                      <MenuItem
                        text="Horizontal"
                        onClick={() => {
                          setExploreState(exploreState.change({ layout: 'horizontal' }));
                        }}
                      />
                    </MenuItem>
                    <MenuDivider />
                    <MenuItem
                      icon={IconNames.TRASH}
                      text="Clear all view state"
                      intent={Intent.DANGER}
                      onClick={() => {
                        localStorage.removeItem(LocalStorageKeys.EXPLORE_STATE);
                        location.hash = '#explore';
                        location.reload();
                      }}
                    />
                  </Menu>
                }
              >
                <Button minimal icon={IconNames.MORE} />
              </Popover>
              <Button
                icon={IconNames.PANEL_STATS}
                minimal
                onClick={() => setExploreState(exploreState.change({ showHelpers: !showHelpers }))}
              />
            </ButtonGroup>
          </div>
          <div className="resource-pane-cnt">
            {!querySource && querySourceState.loading && 'Loading...'}
            {querySource && (
              <ResourcePane
                querySource={querySource}
                onQueryChange={setSource}
                onFilter={c => {
                  filterPane.current?.filterOn(c);
                }}
                runSqlQuery={runSqlPlusQuery}
                onShowColumn={onShowColumn}
                onShowMeasure={onShowMeasure}
              />
            )}
          </div>
          {querySourceState.error ? (
            <div className="query-source-error">{querySourceState.getErrorMessage()}</div>
          ) : querySource ? (
            moduleStates.length ? (
              <div
                className={classNames('modules-pane', exploreState.getLayout())}
                ref={containerRef}
              >
                {moduleStates.map((moduleState, i) => (
                  <ModulePane
                    key={i}
                    moduleState={moduleState}
                    setModuleState={moduleState => setModuleState(i, moduleState)}
                    onDelete={() => setExploreState(exploreState.removeModule(i))}
                    querySource={querySource}
                    where={where}
                    setWhere={setWhere}
                    runSqlQuery={runSqlPlusQuery}
                    onAddToSourceQueryAsColumn={expression => {
                      if (!querySource) return;
                      setExploreState(
                        exploreState.changeSource(
                          querySource.addColumn(querySource.transformToBaseColumns(expression)),
                          undefined,
                        ),
                      );
                    }}
                    onAddToSourceQueryAsMeasure={measure => {
                      if (!querySource) return;
                      setExploreState(
                        exploreState.changeSource(
                          querySource.addMeasure(
                            measure.changeExpression(
                              querySource.transformToBaseColumns(measure.expression),
                            ),
                          ),
                          undefined,
                        ),
                      );
                    }}
                  />
                ))}
              </div>
            ) : (
              <DroppableContainer
                className="no-module-placeholder"
                onDropColumn={onShowColumn}
                onDropMeasure={onShowMeasure}
              >
                <span>Drag and drop a column or measure here</span>
              </DroppableContainer>
            )
          ) : querySourceState.loading ? (
            <Loader className="query-source-loader" loadingText="Introspecting query source" />
          ) : undefined}
          {showHelpers && (
            <div className="helper-bar">
              <p>Helper bar</p>
              <p>ToDo: fill me in!</p>
            </div>
          )}
        </div>
      )}
      {shownText && (
        <ShowValueDialog
          title="Query history"
          str={shownText}
          onClose={() => {
            setShownText(undefined);
          }}
        />
      )}
      <HighlightBubble referenceContainer={containerRef.current} />
    </div>
  );
});
