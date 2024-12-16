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

import { IconNames } from '@blueprintjs/icons';
import type { SqlExpression } from 'druid-query-toolkit';
import { C, F, fitFilterPatterns, L, SqlCase } from 'druid-query-toolkit';
import { useMemo } from 'react';

import { Loader } from '../../../../components';
import { useQueryManager } from '../../../../hooks';
import { capitalizeFirst, Duration, TZ_UTC } from '../../../../utils';
import { Issue } from '../../components';
import type { ExpressionMeta } from '../../models';
import { ModuleRepository } from '../../module-repository/module-repository';
import { getAutoGranularity, updateFilterClause } from '../../utils';

import type {
  ContinuousChartCurveType,
  ContinuousChartMarkType,
  Range,
  RangeDatum,
} from './continuous-chart-render';
import { ContinuousChartRender, OTHER_VALUE } from './continuous-chart-render';

const TIME_NAME = 't';
const MEASURE_NAME = 'm';
const STACK_NAME = 's';
const MIN_SLICE_WIDTH = 4;

function getRangeInExpression(
  expression: SqlExpression,
  timeColumnName: string,
): Range | undefined {
  const patterns = fitFilterPatterns(expression);
  for (const pattern of patterns) {
    if (pattern.type === 'timeInterval' && pattern.column === timeColumnName) {
      return [pattern.start.valueOf(), pattern.end.valueOf()];
    } else if (pattern.type === 'timeRelative' && pattern.column === timeColumnName) {
      return undefined; // ToDo: something cool here
    }
  }

  return;
}

interface TimeChartParameterValues {
  timeGranularity: string;
  splitColumn?: ExpressionMeta;
  numberToStack: number;
  showOthers: boolean;
  measure: ExpressionMeta;
  markType: ContinuousChartMarkType;
  curveType: ContinuousChartCurveType;
}

ModuleRepository.registerModule<TimeChartParameterValues>({
  id: 'time-chart',
  title: 'Time chart',
  icon: IconNames.TIMELINE_LINE_CHART,
  parameters: {
    timeGranularity: {
      type: 'option',
      options: ['auto', 'PT1M', 'PT5M', 'PT30M', 'PT1H', 'P1D'],
      defaultValue: 'auto',
      important: true,
      optionLabels: {
        auto: 'Auto',
        PT1M: 'Minute',
        PT5M: '5 minutes',
        PT30M: '30 minutes',
        PT1H: 'Hour',
        PT6H: '6 hours',
        P1D: 'Day',
      },
    },
    splitColumn: {
      type: 'expression',
      label: 'Stack by',
      transferGroup: 'show',
      important: true,
    },
    numberToStack: {
      type: 'number',
      label: 'Max stacks',
      defaultValue: 7,
      min: 2,
      required: true,
      visible: ({ parameterValues }) => Boolean(parameterValues.splitColumn),
    },
    showOthers: {
      type: 'boolean',
      defaultValue: true,
      visible: ({ parameterValues }) => Boolean(parameterValues.splitColumn),
    },
    measure: {
      type: 'measure',
      label: 'Measure to show',
      transferGroup: 'show-agg',
      important: true,
      defaultValue: ({ querySource }) => querySource?.getFirstAggregateMeasure(),
      required: true,
    },
    markType: {
      type: 'option',
      options: ['area', 'bar', 'line'],
      defaultValue: 'area',
      optionLabels: capitalizeFirst,
    },
    curveType: {
      type: 'option',
      options: ['smooth', 'linear', 'step'],
      defaultValue: 'smooth',
      optionLabels: capitalizeFirst,
      defined: ({ parameterValues }) => parameterValues.markType !== 'bar',
    },
  },
  component: function TimeChartModule(props) {
    const { querySource, where, setWhere, parameterValues, stage, runSqlQuery } = props;

    const timeColumnName = querySource.columns.find(column => column.sqlType === 'TIMESTAMP')?.name;
    const timeGranularity =
      parameterValues.timeGranularity === 'auto'
        ? getAutoGranularity(
            where,
            timeColumnName || '__time',
            Math.floor(Math.max(stage.width - 80, 10) / MIN_SLICE_WIDTH),
          )
        : parameterValues.timeGranularity;

    const { splitColumn, numberToStack, showOthers, measure } = parameterValues;

    const dataQuery = useMemo(() => {
      return {
        initQuery: querySource.getInitQuery(where),
        timeGranularity,
        measure,
        splitExpression: splitColumn?.expression,
        numberToStack,
        showOthers,
      };
    }, [querySource, where, timeGranularity, measure, splitColumn, numberToStack, showOthers]);

    const [sourceDataState, queryManager] = useQueryManager({
      query: dataQuery,
      processQuery: async (
        { initQuery, timeGranularity, measure, splitExpression, numberToStack, showOthers },
        cancelToken,
      ) => {
        if (!timeColumnName) {
          throw new Error(`Must have a column of type TIMESTAMP for the time chart to work`);
        }

        const granularity = new Duration(timeGranularity);

        const vs = splitExpression
          ? (
              await runSqlQuery(
                initQuery
                  .addSelect(splitExpression.cast('VARCHAR').as('v'), { addToGroupBy: 'end' })
                  .changeOrderByExpression(measure.expression.toOrderByExpression('DESC'))
                  .changeLimitValue(numberToStack),
                cancelToken,
              )
            ).getColumnByIndex(0)!
          : undefined;

        cancelToken.throwIfRequested();

        if (vs?.length === 0) {
          // If vs is empty then there is no data at all and no need to do a larger query
          return {
            effectiveVs: [],
            sourceData: [],
            measure,
            granularity,
          };
        }

        const dataset = (
          await runSqlQuery(
            initQuery
              .applyIf(splitExpression && vs && !showOthers, q =>
                q.addWhere(splitExpression!.cast('VARCHAR').in(vs!)),
              )
              .addSelect(F.timeFloor(C(timeColumnName), L(timeGranularity)).as(TIME_NAME), {
                addToGroupBy: 'end',
                addToOrderBy: 'end',
                direction: 'DESC',
              })
              .applyIf(splitExpression, q => {
                if (!splitExpression || !vs) return q; // Should never get here, doing this to make peace between eslint and TS
                return q.addSelect(
                  (showOthers
                    ? SqlCase.ifThenElse(splitExpression.in(vs), splitExpression, L(OTHER_VALUE))
                    : splitExpression
                  )
                    .cast('VARCHAR')
                    .as(STACK_NAME),
                  { addToGroupBy: 'end' },
                );
              })
              .addSelect(measure.expression.as(MEASURE_NAME)),
            cancelToken,
          )
        )
          .toObjectArray()
          .map(
            (b): RangeDatum => ({
              start: b[TIME_NAME].valueOf(),
              end: granularity.shift(b[TIME_NAME], TZ_UTC, 1).valueOf(),
              measure: b[MEASURE_NAME],
              stack: b[STACK_NAME],
            }),
          );

        const effectiveVs = vs && showOthers ? vs.concat(OTHER_VALUE) : vs;
        return {
          effectiveVs,
          sourceData: dataset,
          measure,
          granularity,
        };
      },
    });

    const domainRange = getRangeInExpression(where, timeColumnName || '__time');
    // console.log(`rendering time chart module with ${domainRange}`);

    const sourceData = sourceDataState.getSomeData();
    const errorMessage = sourceDataState.getErrorMessage();
    return (
      <div className="time-chart-module module">
        {sourceData && (
          <ContinuousChartRender
            data={sourceData.sourceData}
            stacks={sourceData.effectiveVs}
            granularity={sourceData.granularity}
            markType={parameterValues.markType}
            curveType={parameterValues.curveType}
            stage={stage}
            yAxis="right"
            domainRange={domainRange}
            onChangeRange={([start, end]) => {
              // console.log(`on change range: ${[start, end]}`);
              setWhere(
                updateFilterClause(
                  where,
                  F(
                    'TIME_IN_INTERVAL',
                    C(timeColumnName || '__time'),
                    `${new Date(start).toISOString()}/${new Date(end).toISOString()}`,
                  ),
                ),
              );
            }}
          />
        )}
        {errorMessage && <Issue issue={errorMessage} />}
        {sourceDataState.loading && (
          <Loader cancelText="Cancel query" onCancel={() => queryManager.cancelCurrent()} />
        )}
      </div>
    );
  },
});
