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
import classNames from 'classnames';
import { max, min } from 'd3-array';
import { axisBottom, axisLeft } from 'd3-axis';
import { scaleBand, scaleLinear } from 'd3-scale';
import { select } from 'd3-selection';
import { F, L } from 'druid-query-toolkit';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import { Loader, PortalBubble, type PortalBubbleOpenOn } from '../../../../components';
import { useQueryManager } from '../../../../hooks';
import {
  bigIntsToNumbers,
  CHART_COLORS,
  formatEmpty,
  formatNumber,
  prettyFormatIsoDate,
} from '../../../../utils';
import { Issue } from '../../components';
import type { ExpressionMeta } from '../../models';
import { ModuleRepository } from '../../module-repository/module-repository';
import { updateFilterClause } from '../../utils';

import './bar-chart-module.scss';

const OVERALL_LABEL = 'Overall';

const MARGIN = { top: 20, right: 20, bottom: 70, left: 70 };

function formatDim(dim: unknown): string {
  if (dim instanceof Date) return prettyFormatIsoDate(dim);
  return formatEmpty(String(dim));
}

interface BarChartParameterValues {
  splitColumn: ExpressionMeta;
  timeBucket: string;
  measure: ExpressionMeta;
  measureToSort: ExpressionMeta;
  limit: number;
}

ModuleRepository.registerModule<BarChartParameterValues>({
  id: 'bar-chart',
  title: 'Bar chart',
  icon: IconNames.VERTICAL_BAR_CHART_DESC,
  parameters: {
    splitColumn: {
      type: 'expression',
      label: 'Bar column',
      transferGroup: 'show',
      required: true,
      important: true,
    },
    timeBucket: {
      type: 'option',
      label: 'Time bucket',
      options: ['PT1M', 'PT5M', 'PT1H', 'P1D', 'P1M'],
      optionLabels: {
        PT1M: '1 minute',
        PT5M: '5 minutes',
        PT1H: '1 hour',
        P1D: '1 day',
        P1M: '1 month',
      },
      defaultValue: 'PT1H',
      important: true,
      defined: ({ parameterValues, querySource }) =>
        parameterValues.splitColumn?.evaluateSqlType(querySource?.columns) === 'TIMESTAMP',
    },

    measure: {
      type: 'measure',
      label: 'Measure to show',
      transferGroup: 'show-agg',
      defaultValue: ({ querySource }) => querySource?.getFirstAggregateMeasure(),
      required: true,
      important: true,
    },
    measureToSort: {
      type: 'measure',
      label: 'Measure to sort',
      description: 'Default to shown measure',
    },
    limit: {
      type: 'number',
      label: 'Max bars to show',
      defaultValue: 5,
      required: true,
    },
  },
  component: function BarChartModule(props) {
    const {
      querySource,
      timezone,
      where,
      setWhere,
      moduleWhere,
      parameterValues,
      stage,
      runSqlQuery,
    } = props;
    const [svgElement, setSvgElement] = useState<SVGSVGElement | null>(null);
    const [hoveredIndex, setHoveredIndex] = useState<number | undefined>();
    const [selected, setSelected] = useState<{ data: any[]; index: number } | undefined>();

    const { splitColumn, timeBucket, measure, measureToSort, limit } = parameterValues;

    const dataQuery = useMemo(() => {
      const splitExpression = splitColumn ? splitColumn.expression : L(OVERALL_LABEL);

      return {
        query: querySource
          .getInitQuery(where.and(moduleWhere))
          .addSelect(
            splitExpression.applyIf(timeBucket, ex => F.timeFloor(ex, timeBucket)).as('dim'),
            {
              addToGroupBy: 'end',
              addToOrderBy: !measureToSort && timeBucket ? 'end' : undefined,
              direction: 'ASC',
            },
          )
          .addSelect(measure.expression.as('met'), {
            addToOrderBy: !measureToSort && !timeBucket ? 'end' : undefined,
            direction: 'DESC',
          })
          .applyIf(measureToSort, q =>
            q.addOrderBy(measureToSort.expression.toOrderByExpression('DESC')),
          )
          .changeLimitValue(limit),
        timezone,
      };
    }, [
      querySource,
      timezone,
      where,
      moduleWhere,
      splitColumn,
      timeBucket,
      measure,
      measureToSort,
      limit,
    ]);

    const [sourceDataState, queryManager] = useQueryManager({
      query: dataQuery,
      processQuery: async (query, signal) => {
        // Only 'met' is coerced, 'dim' is a dimension value that must keep its exact value
        return bigIntsToNumbers((await runSqlQuery(query, signal)).toObjectArray(), ['met']);
      },
    });

    const data = sourceDataState.data;

    // The selection is only valid for the data it was made on
    const selectedIndex = selected && selected.data === data ? selected.index : undefined;
    const setSelectedIndex = (index: number | undefined) => {
      setSelected(data && typeof index === 'number' ? { data, index } : undefined);
    };

    const innerStage = stage.applyMargin(MARGIN);

    let chart: ReactNode;
    let openOn: PortalBubbleOpenOn | undefined;
    if (data && !innerStage.isInvalid()) {
      const xScale = scaleBand<number>()
        .domain(data.map((_, i) => i))
        .range([0, innerStage.width])
        .padding(0.2);

      const yScale = scaleLinear()
        .domain([Math.min(0, min(data, d => d.met) ?? 0), Math.max(0, max(data, d => d.met) ?? 0)])
        .range([innerStage.height, 0])
        .nice();

      const barRect = (d: any, i: number) => {
        const y0 = yScale(0);
        const y1 = yScale(d.met);
        return {
          x: xScale(i)!,
          y: Math.min(y0, y1),
          width: xScale.bandwidth(),
          height: Math.abs(y0 - y1),
        };
      };

      chart = (
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          <g
            className="axis-y"
            ref={(node: any) => {
              select(node).call(
                axisLeft(yScale)
                  .ticks(5)
                  .tickFormat(v => formatNumber(v.valueOf())),
              );
            }}
          />
          <g
            className="axis-x"
            transform={`translate(0,${yScale(0)})`}
            ref={(node: any) => {
              select(node)
                .call(
                  axisBottom(xScale)
                    .tickSizeOuter(0)
                    .tickFormat(i => formatDim(data[i]?.dim)),
                )
                .selectAll('text')
                .attr('transform', 'rotate(30)')
                .attr('text-anchor', 'start');
            }}
          />
          {data.map((d, i) => (
            <rect
              key={i}
              className={classNames('bar', { hovered: hoveredIndex === i })}
              {...barRect(d, i)}
              fill={CHART_COLORS[0]}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(undefined)}
              onClick={() => setSelectedIndex(selectedIndex === i ? undefined : i)}
            />
          ))}
        </g>
      );

      const bubbleIndex = selectedIndex ?? hoveredIndex;
      const bubbleDatum = typeof bubbleIndex === 'number' ? data[bubbleIndex] : undefined;
      if (typeof bubbleIndex === 'number' && bubbleDatum) {
        const r = barRect(bubbleDatum, bubbleIndex);
        const label = bubbleDatum.dim;
        openOn = {
          title: formatDim(label),
          x: MARGIN.left + r.x + r.width / 2,
          y: MARGIN.top + r.y,
          text: (
            <>
              {formatNumber(bubbleDatum.met)}
              {typeof selectedIndex === 'number' && (
                <div className="button-bar">
                  {label !== OVERALL_LABEL && (
                    <Button
                      text="Zoom in"
                      intent={Intent.PRIMARY}
                      size="small"
                      onClick={() => {
                        if (splitColumn) {
                          setWhere(updateFilterClause(where, splitColumn.expression.equal(label)));
                        }
                        setSelectedIndex(undefined);
                      }}
                    />
                  )}
                  <Button text="Close" size="small" onClick={() => setSelectedIndex(undefined)} />
                </div>
              )}
            </>
          ),
        };
      }
    }

    const errorMessage = sourceDataState.getErrorMessage();
    return (
      <div className="bar-chart-module module">
        <svg
          className="chart-container"
          ref={setSvgElement}
          {...stage.toWidthHeight()}
          viewBox={stage.toViewBox()}
        >
          {chart}
        </svg>
        {errorMessage && <Issue issue={errorMessage} />}
        {sourceDataState.loading && (
          <Loader cancelText="Cancel query" onCancel={() => queryManager.cancelCurrent()} />
        )}
        {svgElement && (
          <PortalBubble
            className="module-bubble"
            openOn={openOn}
            offsetElement={svgElement}
            mute={typeof selectedIndex !== 'number'}
          />
        )}
      </div>
    );
  },
});
