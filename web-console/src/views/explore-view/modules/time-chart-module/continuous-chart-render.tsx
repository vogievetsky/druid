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
import { max, sum } from 'd3-array';
import { axisBottom, axisLeft } from 'd3-axis';
import { scaleLinear, scaleOrdinal, scaleUtc } from 'd3-scale';
import { schemeDark2 } from 'd3-scale-chromatic';
import { select } from 'd3-selection';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useMemo, useRef, useState } from 'react';

import type { PortalBubbleOpenOn } from '../../../../components';
import { PortalBubble } from '../../../../components';
import { useClock, useGlobalEventListener } from '../../../../hooks';
import type { Duration, Margin, Stage } from '../../../../utils';
import {
  clamp,
  filterMap,
  formatIsoDateRange,
  formatNumber,
  formatStartDuration,
  minute,
  TZ_UTC,
} from '../../../../utils';

import './continuous-chart-render.scss';

const CHART_MARGIN: Margin = { top: 20, right: 10, bottom: 25, left: 70 };

const EXTEND_X_SCALE_DOMAIN_BY = 1;

// ---------------------------------------

export type Range = [number, number];

export interface BarUnit {
  start: number;
  end: number;
  measure: number;
  stack: string | undefined;
}

export interface StackedBarUnit extends BarUnit {
  offset: number;
}

// ---------------------------------------

function offsetRange(dateRange: Range, offset: number, roundEnd?: (n: number) => number): Range {
  const d = dateRange[1] - dateRange[0];
  let newEnd = dateRange[1] + offset;
  if (roundEnd) newEnd = roundEnd(newEnd);
  return [newEnd - d, newEnd];
}

interface SelectionRange {
  start: number;
  end: number;
  finalized?: boolean;
  selectedBar?: StackedBarUnit;
}

export interface ContinuousChartRenderProps {
  rows: BarUnit[];
  granularity: Duration;

  stage: Stage;
  domainRange: Range | undefined;
  changeRange(range: Range): void;
}

export const ContinuousChartRender = function ContinuousChartRender(
  props: ContinuousChartRenderProps,
) {
  const {
    rows,
    granularity,

    stage,
    domainRange,
    changeRange,
  } = props;
  const [mouseDownAt, setMouseDownAt] = useState<
    { time: number; action: 'select' | 'shift' } | undefined
  >();
  const [selection, setSelection] = useState<SelectionRange | undefined>();

  function setSelectionIfNeeded(newSelection: SelectionRange) {
    if (
      selection &&
      selection.start === newSelection.start &&
      selection.end === newSelection.end &&
      selection.finalized === newSelection.finalized &&
      selection.selectedBar === newSelection.selectedBar
    ) {
      return;
    }
    setSelection(newSelection);
  }

  const [shiftOffset, setShiftOffset] = useState<number | undefined>();

  const now = useClock(minute.canonicalLength);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const stackedRows: StackedBarUnit[] = useMemo(() => {
    let lastStart: number | undefined;
    let offset: number;
    return rows.map(row => {
      if (lastStart !== row.start) {
        offset = 0;
        lastStart = row.start;
      }
      const withOffset = { ...row, offset };
      offset += row.measure;
      return withOffset;
    });
  }, [rows]);

  function findStackedBar(time: number, measure: number): StackedBarUnit | undefined {
    return stackedRows.find(
      r => r.start <= time && time < r.end && r.offset <= measure && measure < r.measure + r.offset,
    );
  }

  const stackScale = useMemo(() => {
    return scaleOrdinal(schemeDark2);
  }, []);

  const innerStage = stage.applyMargin(CHART_MARGIN);

  const effectiveDateRange = domainRange || [rows[rows.length - 1].start, rows[0].end];

  const baseTimeScale = scaleUtc()
    .domain(effectiveDateRange)
    .range([EXTEND_X_SCALE_DOMAIN_BY, innerStage.width - EXTEND_X_SCALE_DOMAIN_BY]);
  const timeScale = shiftOffset
    ? baseTimeScale.copy().domain(offsetRange(effectiveDateRange, shiftOffset))
    : baseTimeScale;

  const maxMeasure = max(stackedRows, d => d.measure + d.offset);
  const statScale = scaleLinear()
    .rangeRound([innerStage.height, 0])
    .domain([0, (maxMeasure ?? 1) * 1.05]);

  function handleMouseDown(e: ReactMouseEvent) {
    const svg = svgRef.current;
    if (!svg) return;
    e.preventDefault();

    setSelection(undefined);
    if (selection?.finalized) return;

    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.x - CHART_MARGIN.left;
    const y = e.clientY - rect.y - CHART_MARGIN.top;
    const time = baseTimeScale.invert(x).valueOf();
    const action = y > innerStage.height || e.shiftKey ? 'shift' : 'select';
    setMouseDownAt({
      time,
      action,
    });
  }

  useGlobalEventListener('mousemove', (e: MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.x - CHART_MARGIN.left;
    const y = e.clientY - rect.y - CHART_MARGIN.top;

    if (mouseDownAt) {
      e.preventDefault();

      const b = baseTimeScale.invert(x).valueOf();
      if (mouseDownAt.action === 'shift' || e.shiftKey) {
        setShiftOffset(mouseDownAt.time.valueOf() - b.valueOf());
      } else {
        if (mouseDownAt.time < b) {
          setSelectionIfNeeded({
            start: granularity.floor(new Date(mouseDownAt.time), TZ_UTC).valueOf(),
            end: granularity.ceil(new Date(b), TZ_UTC).valueOf(),
          });
        } else {
          setSelectionIfNeeded({
            start: granularity.floor(new Date(b), TZ_UTC).valueOf(),
            end: granularity.ceil(new Date(mouseDownAt.time), TZ_UTC).valueOf(),
          });
        }
      }
    } else if (!selection?.finalized) {
      if (0 <= x && x <= innerStage.width && 0 <= y && y <= innerStage.height) {
        const time = baseTimeScale.invert(x).valueOf();
        const measure = statScale.invert(y);

        const start = granularity.floor(new Date(time), TZ_UTC);
        const end = granularity.shift(start, TZ_UTC, 1);

        setSelectionIfNeeded({
          start: start.valueOf(),
          end: end.valueOf(),
          selectedBar: findStackedBar(time, measure),
        });
      } else {
        setSelection(undefined);
      }
    }
  });

  useGlobalEventListener('mouseup', (e: MouseEvent) => {
    if (!mouseDownAt) return;
    e.preventDefault();
    setMouseDownAt(undefined);

    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.x - CHART_MARGIN.left;
    const y = e.clientY - rect.y - CHART_MARGIN.top;

    if (shiftOffset || selection) {
      setShiftOffset(undefined);
      if (mouseDownAt.action === 'shift' || e.shiftKey) {
        if (shiftOffset) {
          changeRange(
            offsetRange(effectiveDateRange, shiftOffset, n =>
              granularity.round(new Date(n), TZ_UTC).valueOf(),
            ),
          );
        }
      } else {
        if (selection) {
          setSelection({ ...selection, finalized: true });
        }
      }
    } else if (0 <= x && x <= innerStage.width && 0 <= y && y <= innerStage.height) {
      const time = baseTimeScale.invert(x).valueOf();
      const measure = statScale.invert(y);

      const clickedBar = findStackedBar(time, measure);
      if (clickedBar) {
        setSelection({
          start: clickedBar.start,
          end: clickedBar.end,
          selectedBar: clickedBar,
          finalized: true,
        });
      }
    }
  });

  useGlobalEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && mouseDownAt) {
      setMouseDownAt(undefined);
      setSelection(undefined);
    }
  });

  if (innerStage.isInvalid()) return;

  function startEndToXWidth({ start, end }: { start: number; end: number }) {
    let xStart = timeScale(start);
    let xEnd = timeScale(end);
    if (xEnd < 0 || innerStage.width < xStart) return;

    xStart = clamp(xStart, 0, innerStage.width);
    xEnd = clamp(xEnd, 0, innerStage.width);
    return {
      x: xStart,
      width: Math.max(xEnd - xStart - 1, 1),
    };
  }

  function barToYHeight({ measure, offset }: StackedBarUnit) {
    const y0 = statScale(offset);
    const y = statScale(measure + offset);

    return {
      y: y,
      height: y0 - y,
    };
  }

  function barToRect(barUnit: StackedBarUnit) {
    const xWidth = startEndToXWidth(barUnit);
    if (!xWidth) return;
    return {
      ...xWidth,
      ...barToYHeight(barUnit),
    };
  }

  let hoveredOpenOn: PortalBubbleOpenOn | undefined;
  if (selection) {
    const { start, end, selectedBar } = selection;

    let title: string;
    let info: string;
    if (selectedBar) {
      title = formatStartDuration(new Date(selectedBar.start), granularity);
      info = formatNumber(selectedBar.measure);
    } else {
      if (granularity.shift(new Date(start), TZ_UTC).valueOf() === end) {
        title = formatStartDuration(new Date(start), granularity);
      } else {
        title = formatIsoDateRange(new Date(start), new Date(end));
      }

      const selectedBars = stackedRows.filter(row => start <= row.start && row.start < end);
      if (selectedBars.length) {
        info = formatNumber(sum(selectedBars, b => b.measure));
      } else {
        info = 'No data';
      }
    }

    hoveredOpenOn = {
      x: CHART_MARGIN.left + timeScale((selection.start + selection.end) / 2),
      y: CHART_MARGIN.top,
      title,
      text: (
        <>
          {selectedBar?.stack && <div>{selectedBar?.stack}</div>}
          <div>{info}</div>
          {selection.finalized && (
            <div className="button-bar">
              <Button
                icon={IconNames.ZOOM_IN}
                text="Zoom in"
                intent={Intent.PRIMARY}
                small
                onClick={() => {
                  if (!selection) return;
                  setSelection(undefined);
                  changeRange([selection.start, selection.end]);
                }}
              />
            </div>
          )}
        </>
      ),
    };
  }

  const nowX = timeScale(now);
  return (
    <div className="continuous-chart-render">
      <svg
        ref={svgRef}
        width={stage.width}
        height={stage.height}
        viewBox={`0 0 ${stage.width} ${stage.height}`}
        preserveAspectRatio="xMinYMin meet"
        onMouseDown={handleMouseDown}
      >
        <g transform={`translate(${CHART_MARGIN.left},${CHART_MARGIN.top})`}>
          <g
            className="h-gridline"
            transform="translate(0,0)"
            ref={(node: any) =>
              select(node).call(
                axisLeft(statScale)
                  .tickValues(statScale.ticks(3).filter(v => v !== 0))
                  .tickSize(-innerStage.width)
                  .tickFormat(() => '')
                  .tickSizeOuter(0),
              )
            }
          />
          <g className="bar-group">
            {selection && (
              <rect
                className="hover-highlight"
                {...startEndToXWidth(selection)}
                y={0}
                height={innerStage.height}
              />
            )}
            {0 < nowX && nowX < innerStage.width && (
              <line className="now-line" x1={nowX} x2={nowX} y1={0} y2={innerStage.height + 8} />
            )}
            {filterMap(stackedRows, stackedRow => {
              const r = barToRect(stackedRow);
              if (!r) return;
              return (
                <rect
                  key={`${stackedRow.start}/${stackedRow.end}/${stackedRow.stack}`}
                  className="bar-unit"
                  {...r}
                  style={
                    typeof stackedRow.stack !== 'undefined'
                      ? {
                          fill: stackScale(stackedRow.stack),
                        }
                      : undefined
                  }
                />
              );
            })}
            {selection?.selectedBar && (
              <rect
                className={classNames('selection', { done: selection.finalized })}
                {...barToRect(selection.selectedBar)}
              />
            )}
            {!!shiftOffset && (
              <rect
                className="shifter"
                x={shiftOffset > 0 ? timeScale(effectiveDateRange[1]) : 0}
                y={0}
                height={innerStage.height}
                width={
                  shiftOffset > 0
                    ? innerStage.width - timeScale(effectiveDateRange[1])
                    : timeScale(effectiveDateRange[0])
                }
              />
            )}
          </g>
          <g
            className="axis-x"
            transform={`translate(0,${innerStage.height + 1})`}
            ref={(node: any) => select(node).call(axisBottom(timeScale))}
          />
          <rect
            className={classNames('time-shift-indicator', {
              shifting: typeof shiftOffset === 'number',
            })}
            x={0}
            y={innerStage.height}
            width={innerStage.width}
            height={CHART_MARGIN.bottom}
          />
          <g
            className="axis-y"
            ref={(node: any) =>
              select(node).call(
                axisLeft(statScale)
                  .ticks(3)
                  .tickFormat(e => formatNumber(e.valueOf())),
              )
            }
          />
        </g>
      </svg>
      {!rows.length && (
        <div className="empty-placeholder">
          <div className="no-data-text">There is no data in the selected range</div>
        </div>
      )}
      {svgRef.current && (
        <PortalBubble
          className="continuous-chart-bubble"
          openOn={hoveredOpenOn}
          offsetElement={svgRef.current}
          onClose={selection?.finalized ? () => setSelection(undefined) : undefined}
          mute
          direction="up"
        />
      )}
    </div>
  );
};
