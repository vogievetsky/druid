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
import { sum } from 'd3-array';
import type { PieArcDatum } from 'd3-shape';
import { arc, pie } from 'd3-shape';
import { C, F, L } from 'druid-query-toolkit';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import { Loader, PortalBubble, type PortalBubbleOpenOn } from '../../../../components';
import { useQueryManager } from '../../../../hooks';
import { ColorAssigner } from '../../../../singletons';
import { bigIntsToNumbers, formatEmpty, formatNumber, formatPercent } from '../../../../utils';
import { Issue } from '../../components';
import type { ExpressionMeta } from '../../models';
import { ModuleRepository } from '../../module-repository/module-repository';
import { updateFilterClause } from '../../utils';

import './pie-chart-module.scss';

const OVERALL_LABEL = 'Overall';

const LEGEND_ITEM_HEIGHT = 20;
const LABEL_OFFSET = 20;

interface PieDatum {
  name: string;
  value: number;
  __isOthers?: boolean;
}

interface PieChartParameterValues {
  splitColumn: ExpressionMeta;
  measure: ExpressionMeta;
  limit: number;
  showOthers: boolean;
}

ModuleRepository.registerModule<PieChartParameterValues>({
  id: 'pie-chart',
  title: 'Pie chart',
  icon: IconNames.PIE_CHART,
  parameters: {
    splitColumn: {
      type: 'expression',
      label: 'Slice column',
      transferGroup: 'show',
      required: true,
      important: true,
    },
    measure: {
      type: 'measure',
      transferGroup: 'show',
      defaultValue: ({ querySource }) => querySource?.getFirstAggregateMeasure(),
      required: true,
      important: true,
    },
    limit: {
      type: 'number',
      label: 'Max slices to show',
      defaultValue: 5,
      required: true,
    },
    showOthers: {
      type: 'boolean',
      defaultValue: true,
      label: 'Show others',
    },
  },
  component: function PieChartModule(props) {
    const { querySource, where, setWhere, moduleWhere, parameterValues, stage, runSqlQuery } =
      props;
    const [svgElement, setSvgElement] = useState<SVGSVGElement | null>(null);
    const [hoveredName, setHoveredName] = useState<string | undefined>();
    const [selected, setSelected] = useState<{ data: PieDatum[]; name: string } | undefined>();
    const [hiddenNames, setHiddenNames] = useState<ReadonlySet<string>>(new Set());

    const { splitColumn, measure, limit, showOthers } = parameterValues;

    const dataQueries = useMemo(() => {
      const splitExpression = splitColumn ? splitColumn.expression : L(OVERALL_LABEL);
      const effectiveWhere = where.and(moduleWhere);

      return {
        mainQuery: querySource
          .getInitQuery(effectiveWhere)
          .addSelect(F.cast(splitExpression, 'VARCHAR').as('name'), { addToGroupBy: 'end' })
          .addSelect(measure.expression.as('value'), {
            addToOrderBy: 'end',
            direction: 'DESC',
          })
          .changeLimitValue(limit + (showOthers ? 1 : 0)),
        limit,
        splitExpression: splitColumn?.expression,
        othersPartialQuery: showOthers
          ? querySource.getInitQuery(effectiveWhere).addSelect(measure.expression.as('value'))
          : undefined,
      };
    }, [querySource, where, moduleWhere, splitColumn, measure, limit, showOthers]);

    const [sourceDataState, queryManager] = useQueryManager({
      query: dataQueries,
      processQuery: async ({ mainQuery, limit, splitExpression, othersPartialQuery }, signal) => {
        const result = await runSqlQuery({ query: mainQuery }, signal);
        const data = bigIntsToNumbers(result.toObjectArray(), ['value']) as PieDatum[];

        if (splitExpression && othersPartialQuery) {
          const pieValues = result.getColumnByIndex(0)!;

          if (pieValues.length > limit) {
            const othersResult = await runSqlQuery({
              query: othersPartialQuery.addWhere(splitExpression.notIn(pieValues.slice(0, limit))),
            });
            data.push({
              name: 'Others',
              value: Number(othersResult.rows[0][0]),
              __isOthers: true,
            });
          }
        }

        return data;
      },
    });

    const data = sourceDataState.data;

    // The selection is only valid for the data it was made on
    const selectedName = selected && selected.data === data ? selected.name : undefined;

    const getColor = (name: string) =>
      splitColumn ? ColorAssigner.getColorForDimensionValue(splitColumn.name, name) : '#1890ff';

    let chart: ReactNode;
    let openOn: PortalBubbleOpenOn | undefined;
    if (data && !stage.isInvalid()) {
      const visibleData = data.filter(d => !hiddenNames.has(d.name));
      const total = sum(visibleData, d => d.value);
      const arcs = pie<PieDatum>()
        .value(d => d.value)
        .sort(null)(visibleData);

      const cx = stage.width / 2;
      const cy = stage.height / 2;
      const radius = Math.min(stage.width, stage.height) / 4;
      const arcFn = arc<PieArcDatum<PieDatum>>().innerRadius(0).outerRadius(radius);

      // Returns the point on the outer edge of the slice at its middle angle (0 angle is 12 o'clock)
      const pointOnSlice = (a: PieArcDatum<PieDatum>, r: number) => {
        const angle = (a.startAngle + a.endAngle) / 2;
        return { x: cx + Math.sin(angle) * r, y: cy - Math.cos(angle) * r };
      };

      chart = (
        <>
          <g className="legend" transform="translate(10,10)">
            {data.map((d, i) => (
              <g
                key={d.name}
                className={classNames('legend-item', { hidden: hiddenNames.has(d.name) })}
                transform={`translate(0,${i * LEGEND_ITEM_HEIGHT})`}
                onClick={() => {
                  const newHiddenNames = new Set(hiddenNames);
                  if (newHiddenNames.has(d.name)) {
                    newHiddenNames.delete(d.name);
                  } else {
                    newHiddenNames.add(d.name);
                  }
                  setHiddenNames(newHiddenNames);
                }}
              >
                <rect x={0} y={2} width={20} height={12} rx={3} fill={getColor(d.name)} />
                <text x={26} y={12}>
                  {formatEmpty(d.name)}
                </text>
              </g>
            ))}
          </g>
          {arcs.map(a => {
            const { name } = a.data;
            const color = getColor(name);
            const edge = pointOnSlice(a, radius);
            const elbow = pointOnSlice(a, radius + LABEL_OFFSET);
            const isRight = elbow.x >= cx;
            const labelX = elbow.x + (isRight ? LABEL_OFFSET : -LABEL_OFFSET);
            return (
              <g key={name}>
                <path
                  className={classNames('slice', { hovered: hoveredName === name })}
                  d={arcFn(a)!}
                  transform={`translate(${cx},${cy})`}
                  fill={color}
                  onMouseEnter={() => setHoveredName(name)}
                  onMouseLeave={() => setHoveredName(undefined)}
                  onClick={() => setSelected(selectedName === name ? undefined : { data, name })}
                />
                <polyline
                  className="label-line"
                  points={`${edge.x},${edge.y} ${elbow.x},${elbow.y} ${labelX},${elbow.y}`}
                  stroke={color}
                />
                <text
                  className="slice-label"
                  x={labelX + (isRight ? 4 : -4)}
                  y={elbow.y}
                  dy="0.35em"
                  textAnchor={isRight ? 'start' : 'end'}
                >
                  {formatEmpty(name)}
                </text>
              </g>
            );
          })}
        </>
      );

      const bubbleName = selectedName ?? hoveredName;
      const bubbleArc = arcs.find(a => a.data.name === bubbleName);
      if (bubbleArc) {
        const { name, value, __isOthers } = bubbleArc.data;
        const edge = pointOnSlice(bubbleArc, radius);
        openOn = {
          title: formatEmpty(name),
          x: edge.x,
          y: edge.y - 20,
          text: (
            <>
              {`${formatNumber(value)} (${formatPercent(total ? value / total : 0)})`}
              {selectedName && (
                <div className="button-bar">
                  {!__isOthers && (
                    <Button
                      text="Zoom in"
                      intent={Intent.PRIMARY}
                      size="small"
                      onClick={() => {
                        setWhere(updateFilterClause(where, C(splitColumn.name).equal(name)));
                        setSelected(undefined);
                      }}
                    />
                  )}
                  <Button text="Close" size="small" onClick={() => setSelected(undefined)} />
                </div>
              )}
            </>
          ),
        };
      }
    }

    const errorMessage = sourceDataState.getErrorMessage();
    return (
      <div className="pie-chart-module module">
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
            mute={!selectedName}
          />
        )}
      </div>
    );
  },
});
