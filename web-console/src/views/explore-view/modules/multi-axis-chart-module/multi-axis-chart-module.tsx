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
import { Duration, Timezone } from 'chronoshift';
import { extent, least, max, min } from 'd3-array';
import { axisBottom, axisLeft, axisRight } from 'd3-axis';
import { scaleLinear, scaleUtc } from 'd3-scale';
import { select } from 'd3-selection';
import { line } from 'd3-shape';
import { C, F, L } from 'druid-query-toolkit';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import { Loader, PortalBubble, type PortalBubbleOpenOn } from '../../../../components';
import { useGlobalEventListener, useQueryManager } from '../../../../hooks';
import {
  bigIntsToNumbers,
  clamp,
  filterMap,
  formatIsoDateRange,
  formatNumber,
  getAutoGranularity,
  getChartColor,
  prettyFormatIsoDateWithMsIfNeeded,
  tickFormatWithTimezone,
  timezoneAwareTicks,
} from '../../../../utils';
import { Issue } from '../../components';
import type { ExpressionMeta } from '../../models';
import { ModuleRepository } from '../../module-repository/module-repository';
import { updateFilterClause } from '../../utils';

import './multi-axis-chart-module.scss';

const Y_AXIS_WIDTH = 60;

function getTimeDomain(
  minTime: number | undefined,
  maxTime: number | undefined,
  granularity: string,
): [number, number] {
  if (typeof minTime !== 'number' || typeof maxTime !== 'number') return [0, 1];
  if (minTime < maxTime) return [minTime, maxTime];

  // There is only one time bucket so center it in a domain that is one bucket wide
  const halfBucket = new Duration(granularity).getCanonicalLength() / 2;
  return [minTime - halfBucket, minTime + halfBucket];
}

interface Brush {
  data: any[];
  start: number;
  end: number;
  finalized: boolean;
}

interface MultiAxisChartParameterValues {
  measures: ExpressionMeta[];
  granularity: string;
}

ModuleRepository.registerModule<MultiAxisChartParameterValues>({
  id: 'multi-axis-chart',
  title: 'Multi-axis chart',
  icon: IconNames.SERIES_ADD,
  parameters: {
    measures: {
      type: 'measures',
      label: 'Measures to show',
      transferGroup: 'show',
      defaultValue: ({ querySource }) => querySource?.getFirstAggregateMeasureArray(),
      nonEmpty: true,
      required: true,
      important: true,
    },
    granularity: {
      type: 'option',
      options: ['auto', 'PT1M', 'PT5M', 'PT30M', 'PT1H', 'P1D'],
      optionLabels: g => (g === 'auto' ? 'Auto' : new Duration(g).getDescription(true)),
      defaultValue: 'auto',
    },
  },
  component: function MultiAxisChartModule(props) {
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
    const [brush, setBrush] = useState<Brush | undefined>();
    const [hoverTime, setHoverTime] = useState<number | undefined>();

    const timeColumnName = querySource.columns.find(column => column.sqlType === 'TIMESTAMP')?.name;
    const timeGranularity =
      parameterValues.granularity === 'auto'
        ? getAutoGranularity(where, timeColumnName || '__time', 200)
        : parameterValues.granularity;

    const { measures } = parameterValues;

    const dataQuery = useMemo(() => {
      return {
        query: querySource
          .getInitQuery(where.and(moduleWhere))
          .addSelect(F.timeFloor(C(timeColumnName || '__time'), L(timeGranularity)).as('time'), {
            addToGroupBy: 'end',
            addToOrderBy: 'end',
            direction: 'ASC',
          })
          .applyForEach(measures, (q, measure) => q.addSelect(measure.expression.as(measure.name))),
        timezone,
      };
    }, [querySource, timezone, where, moduleWhere, timeColumnName, timeGranularity, measures]);

    const [sourceDataState, queryManager] = useQueryManager({
      query: dataQuery,
      processQuery: async (query, signal) => {
        if (!timeColumnName) {
          throw new Error(`Must have a column of type TIMESTAMP for the multi-axis chart to work`);
        }

        return bigIntsToNumbers(
          (await runSqlQuery(query, signal)).toObjectArray(),
          measures.map(measure => measure.name),
        );
      },
    });

    const data = sourceDataState.data;

    // The brush is only valid for the data it was made on
    const effectiveBrush = brush && brush.data === data ? brush : undefined;

    const margin = {
      top: 30,
      right: 10 + Math.max(measures.length - 1, 0) * Y_AXIS_WIDTH,
      bottom: 25,
      left: 10 + Y_AXIS_WIDTH,
    };
    const innerStage = stage.applyMargin(margin);

    const times: number[] = useMemo(() => (data || []).map(d => d.time.valueOf()), [data]);
    const [minTime, maxTime] = extent(times);
    const timeScale = scaleUtc()
      .domain(getTimeDomain(minTime, maxTime, timeGranularity))
      .range([0, Math.max(innerStage.width, 0)]);

    const measureScales = useMemo(
      () =>
        measures.map(({ name }) =>
          scaleLinear()
            .domain([
              Math.min(0, min(data || [], d => d[name]) ?? 0),
              Math.max(0, max(data || [], d => d[name]) ?? 0),
            ])
            .range([Math.max(innerStage.height, 0), 0])
            .nice(),
        ),
      [data, measures, innerStage.height],
    );

    function getTimeFromMouse(e: { clientX: number }): number | undefined {
      if (!svgElement) return;
      const rect = svgElement.getBoundingClientRect();
      const x = clamp(e.clientX - rect.x - margin.left, 0, innerStage.width);
      return timeScale.invert(x).valueOf();
    }

    function clearBrush() {
      setBrush(undefined);
    }

    useGlobalEventListener('mousemove', (e: MouseEvent) => {
      if (!svgElement || !data) return;
      if (effectiveBrush && !effectiveBrush.finalized) {
        const time = getTimeFromMouse(e);
        if (typeof time === 'number') setBrush({ ...effectiveBrush, end: time });
        return;
      }

      const rect = svgElement.getBoundingClientRect();
      const x = e.clientX - rect.x - margin.left;
      const y = e.clientY - rect.y - margin.top;
      if (
        0 <= x &&
        x <= innerStage.width &&
        0 <= y &&
        y <= innerStage.height &&
        svgElement.contains(e.target as Node)
      ) {
        const time = timeScale.invert(x).valueOf();
        setHoverTime(least(times, t => Math.abs(t - time)));
      } else if (typeof hoverTime === 'number') {
        setHoverTime(undefined);
      }
    });

    useGlobalEventListener('mouseup', () => {
      if (!effectiveBrush || effectiveBrush.finalized) return;
      if (effectiveBrush.start === effectiveBrush.end) {
        clearBrush();
      } else {
        setBrush({
          ...effectiveBrush,
          start: Math.min(effectiveBrush.start, effectiveBrush.end),
          end: Math.max(effectiveBrush.start, effectiveBrush.end),
          finalized: true,
        });
      }
    });

    useGlobalEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearBrush();
    });

    let chart: ReactNode;
    let openOn: PortalBubbleOpenOn | undefined;
    if (data && !innerStage.isInvalid()) {
      const [domainStart, domainEnd] = timeScale.domain();

      chart = (
        <g transform={`translate(${margin.left},${margin.top})`}>
          <g
            className="axis-x"
            transform={`translate(0,${innerStage.height})`}
            ref={(node: any) => {
              select(node).call(
                axisBottom(timeScale)
                  .tickValues(timezoneAwareTicks(domainStart, domainEnd, 10, timezone))
                  .tickFormat(x => tickFormatWithTimezone(x as Date, timezone)),
              );
            }}
          />
          {measures.map(({ name }, i) => {
            const x = i === 0 ? 0 : innerStage.width + (i - 1) * Y_AXIS_WIDTH;
            return (
              <g key={i} className="axis-y" transform={`translate(${x},0)`}>
                <g
                  ref={(node: any) => {
                    select(node).call(
                      (i === 0 ? axisLeft : axisRight)(measureScales[i])
                        .ticks(5)
                        .tickFormat(v => formatNumber(v.valueOf())),
                    );
                  }}
                />
                <text
                  className="axis-name"
                  y={-12}
                  textAnchor={i === 0 ? 'end' : 'start'}
                  fill={getChartColor(i)}
                >
                  {name}
                </text>
              </g>
            );
          })}
          <rect
            className="interaction-area"
            width={innerStage.width}
            height={innerStage.height}
            onMouseDown={e => {
              e.preventDefault();
              const time = getTimeFromMouse(e);
              if (typeof time !== 'number') return;
              setBrush({ data, start: time, end: time, finalized: false });
            }}
          />
          {measures.map(({ name }, i) => (
            <path
              key={i}
              className="series-line"
              d={line<any>()
                .defined(d => typeof d[name] === 'number')
                .x(d => timeScale(d.time.valueOf()))
                .y(d => measureScales[i](d[name]))(data)!}
              stroke={getChartColor(i)}
            />
          ))}
          {measures.flatMap(({ name }, i) =>
            filterMap(data, (d, j) => {
              // Lines are not visible for isolated points so mark them with a dot
              if (
                typeof d[name] !== 'number' ||
                typeof data[j - 1]?.[name] === 'number' ||
                typeof data[j + 1]?.[name] === 'number'
              ) {
                return;
              }
              return (
                <circle
                  key={`${i}_${j}`}
                  className="single-point"
                  cx={timeScale(d.time.valueOf())}
                  cy={measureScales[i](d[name])}
                  r={2}
                  fill={getChartColor(i)}
                />
              );
            }),
          )}
          {typeof hoverTime === 'number' && !effectiveBrush && (
            <line
              className="hover-line"
              x1={timeScale(hoverTime)}
              x2={timeScale(hoverTime)}
              y1={0}
              y2={innerStage.height}
            />
          )}
          {effectiveBrush && (
            <rect
              className="brush"
              x={timeScale(Math.min(effectiveBrush.start, effectiveBrush.end))}
              width={Math.abs(timeScale(effectiveBrush.end) - timeScale(effectiveBrush.start))}
              y={0}
              height={innerStage.height}
            />
          )}
        </g>
      );

      if (effectiveBrush) {
        const duration = new Duration(timeGranularity);
        const start = duration.floor(new Date(effectiveBrush.start), Timezone.UTC);
        const end = duration.ceil(new Date(effectiveBrush.end), Timezone.UTC);

        openOn = {
          title: formatIsoDateRange(start, end, Timezone.UTC),
          x: margin.left + timeScale((effectiveBrush.start + effectiveBrush.end) / 2),
          y: 50,
          text: effectiveBrush.finalized ? (
            <div className="button-bar">
              <Button
                text="Zoom in"
                intent={Intent.PRIMARY}
                size="small"
                onClick={() => {
                  if (!timeColumnName) return;
                  setWhere(
                    updateFilterClause(
                      where,
                      F(
                        'TIME_IN_INTERVAL',
                        C(timeColumnName),
                        `${start.toISOString()}/${end.toISOString()}`,
                      ),
                    ),
                  );
                  clearBrush();
                }}
              />
              <Button text="Close" size="small" onClick={clearBrush} />
            </div>
          ) : undefined,
        };
      } else if (typeof hoverTime === 'number') {
        const datum = data.find(d => d.time.valueOf() === hoverTime);
        if (datum) {
          openOn = {
            title: prettyFormatIsoDateWithMsIfNeeded(new Date(hoverTime)),
            x: margin.left + timeScale(hoverTime),
            y: margin.top,
            text: measures.map(({ name }, i) => (
              <div key={i}>
                <span className="series-swatch" style={{ background: getChartColor(i) }} />
                {`${name}: ${formatNumber(datum[name])}`}
              </div>
            )),
          };
        }
      }
    }

    const errorMessage = sourceDataState.getErrorMessage();
    return (
      <div className="multi-axis-chart-module module">
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
            className="module-bubble multi-axis-chart-bubble"
            openOn={openOn}
            offsetElement={svgElement}
            mute={!effectiveBrush?.finalized}
          />
        )}
      </div>
    );
  },
});
