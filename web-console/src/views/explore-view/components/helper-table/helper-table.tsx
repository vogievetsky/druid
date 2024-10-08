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

import { Button, ButtonGroup } from '@blueprintjs/core';
import { IconNames } from '@blueprintjs/icons';
import type { QueryResult, SqlQuery } from '@druid-toolkit/query';
import { F, SqlExpression } from '@druid-toolkit/query';
import type { CancelToken } from 'axios';
import React, { useMemo, useState } from 'react';

import { ClearableInput, Loader } from '../../../../components';
import { useQueryManager } from '../../../../hooks';
import type { NumberLike } from '../../../../utils';
import { caseInsensitiveContains, filterMap, formatNumber } from '../../../../utils';
import type { ExpressionMeta, QuerySource } from '../../models';
import { ColumnValue } from '../column-value/column-value';

import './helper-table.scss';

const HEADER_HEIGHT = 30;
const ROW_HEIGHT = 28;

export interface HelperTableProps {
  querySource: QuerySource;
  where: SqlExpression;
  expression: ExpressionMeta;
  runSqlQuery(query: string | SqlQuery, cancelToken?: CancelToken): Promise<QueryResult>;
  onDelete(): void;
}

export const HelperTable = React.memo(function HelperTable(props: HelperTableProps) {
  const { querySource, where, expression, runSqlQuery, onDelete } = props;
  const [showSearch] = useState(false);
  const [searchString, setSearchString] = useState('');

  const valuesQuery = useMemo(
    () =>
      querySource
        .getInitQuery(
          SqlExpression.and(
            where,
            searchString ? F('ICONTAINS_STRING', expression.expression, searchString) : undefined,
          ),
        )
        .addSelect(expression.expression.as('v'), { addToGroupBy: 'end' })
        .addSelect(F.count().as('c'), { addToOrderBy: 'end', direction: 'DESC' })
        .changeLimitValue(101)
        .toString(),
    [querySource.query, where, expression, searchString],
  );

  const [valuesState] = useQueryManager<string, ReadonlyArray<{ v: string; c: NumberLike }>>({
    query: valuesQuery,
    debounceIdle: 100,
    debounceLoading: 500,
    processQuery: async (query, cancelToken) => {
      const vs = await runSqlQuery(query, cancelToken);
      return (vs.toObjectArray() as any) || [];
    },
  });

  const values = valuesState.getSomeData();
  return (
    <div
      className="helper-table"
      style={{ maxHeight: values ? HEADER_HEIGHT + ROW_HEIGHT * values.length : undefined }}
    >
      <div className="helper-header">
        <div className="helper-title">{expression.name}</div>
        <ButtonGroup minimal>
          <Button icon={IconNames.SEARCH} minimal />
          <Button icon={IconNames.CROSS} minimal onClick={onDelete} />
        </ButtonGroup>
      </div>
      {showSearch && (
        <ClearableInput value={searchString} onChange={setSearchString} placeholder="Search" />
      )}
      <div className="values-container">
        {values && (
          <div className="values">
            {filterMap(values, (d, i) => {
              if (!caseInsensitiveContains(d.v, searchString)) return;
              return (
                <div className="row" key={i}>
                  <ColumnValue value={d.v} />
                  <div className="value">{formatNumber(d.c)}</div>
                </div>
              );
            })}
          </div>
        )}
        {valuesState.loading && <Loader />}
      </div>
    </div>
  );
});
