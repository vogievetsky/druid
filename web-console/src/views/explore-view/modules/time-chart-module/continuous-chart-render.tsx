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

import classNames from 'classnames';
import { max } from 'd3-array';
import { axisBottom, axisLeft } from 'd3-axis';
import { scaleLinear, scaleUtc } from 'd3-scale';
import { select } from 'd3-selection';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useMemo, useRef, useState } from 'react';

import type { PortalBubbleOpenOn } from '../../../../components';
import { PortalBubble } from '../../../../components';
import { useClock, useGlobalEventListener } from '../../../../hooks';
import type { Margin, Stage } from '../../../../utils';
import { clamp, day, formatNumber, minute, TZ_UTC } from '../../../../utils';

import './continuous-chart-render.scss';

const CHART_MARGIN: Margin = { top: 20, right: 10, bottom: 25, left: 70 };

const EXTEND_X_SCALE_DOMAIN_BY = 1;

// ---------------------------------------

export type Range = [number, number];

export interface BarUnit {
  start: number;
  end: number;
  measures: Record<string, number>;
}

export interface StackedBarUnit extends BarUnit {
  offset: Record<string, number>;
}

// ---------------------------------------

function offsetRange(dateRange: Range, offset: number): Range {
  return [dateRange[0] + offset, dateRange[1] + offset];
}

interface BubbleInfo {
  start: number;
  end: number;
  timeLabel: string;
}

interface SelectionRange {
  start: number;
  end: number;
  done?: boolean;
}

export interface ContinuousChartRenderProps {
  rows: BarUnit[];

  stage: Stage;
  domainRange: Range | undefined;
  changeRange(range: Range): void;
}

const SHOWN_MEASURE = 'Count';

export const ContinuousChartRender = function ContinuousChartRender(
  props: ContinuousChartRenderProps,
) {
  const {
    rows,

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
      selection.start.valueOf() === newSelection.start.valueOf() &&
      selection.end.valueOf() === newSelection.end.valueOf() &&
      selection.done === newSelection.done
    ) {
      return;
    }
    setSelection(newSelection);
  }

  const [bubbleInfo, setBubbleInfo] = useState<BubbleInfo | undefined>();

  const [shiftOffset, setShiftOffset] = useState<number | undefined>();

  const now = useClock(minute.canonicalLength);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const stackedRows: StackedBarUnit[] = useMemo(() => {
    return rows.map(row => ({ ...row, offset: {} }));
  }, [rows]);

  const innerStage = stage.applyMargin(CHART_MARGIN);

  const effectiveDateRange = domainRange || [rows[rows.length - 1].start, rows[0].end];

  const baseTimeScale = scaleUtc()
    .domain(effectiveDateRange)
    .range([EXTEND_X_SCALE_DOMAIN_BY, innerStage.width - EXTEND_X_SCALE_DOMAIN_BY]);
  const timeScale = shiftOffset
    ? baseTimeScale.copy().domain(offsetRange(effectiveDateRange, shiftOffset))
    : baseTimeScale;

  const maxNormalizedStat = max(rows, d => d.measures[SHOWN_MEASURE]);
  const statScale = scaleLinear()
    .rangeRound([innerStage.height, 0])
    .domain([0, (maxNormalizedStat ?? 1) * 1.05]);

  function handleMouseDown(e: ReactMouseEvent) {
    const svg = svgRef.current;
    if (!svg) return;
    e.preventDefault();

    if (selection) {
      setSelection(undefined);
    } else {
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.x - CHART_MARGIN.left;
      const y = e.clientY - rect.y - CHART_MARGIN.top;
      const time = baseTimeScale.invert(x).valueOf();
      const action = y > innerStage.height || e.shiftKey ? 'shift' : 'select';
      setBubbleInfo(undefined);
      setMouseDownAt({
        time,
        action,
      });
    }
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
            start: day.floor(new Date(mouseDownAt.time), TZ_UTC).valueOf(),
            end: day.ceil(new Date(b), TZ_UTC).valueOf(),
          });
        } else {
          setSelectionIfNeeded({
            start: day.floor(new Date(b), TZ_UTC).valueOf(),
            end: day.ceil(new Date(mouseDownAt.time), TZ_UTC).valueOf(),
          });
        }
      }
    } else if (!selection) {
      if (
        0 <= x &&
        x <= innerStage.width &&
        0 <= y &&
        y <= innerStage.height + CHART_MARGIN.bottom
      ) {
        console.log('here');
      } else {
        setBubbleInfo(undefined);
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
          changeRange(offsetRange(effectiveDateRange, shiftOffset));
        }
      } else {
        if (selection) {
          setSelection({ ...selection, done: true });
        }
      }
    } else if (0 <= x && x <= innerStage.width && 0 <= y && y <= innerStage.height) {
      console.log('woop');
    }
  });

  useGlobalEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && mouseDownAt) {
      setMouseDownAt(undefined);
      setSelection(undefined);
    }
  });

  if (innerStage.isInvalid()) return;

  function startEndToXWidth({ start, end }: StackedBarUnit) {
    const xStart = clamp(timeScale(start), 0, innerStage.width);
    const xEnd = clamp(timeScale(end), 0, innerStage.width);

    return {
      x: xStart,
      width: Math.max(xEnd - xStart - 1, 1),
    };
  }

  function segmentBarToRect(barUnit: StackedBarUnit) {
    const y0 = statScale(barUnit.offset[SHOWN_MEASURE] || 0);
    const y = statScale(barUnit.measures[SHOWN_MEASURE] + (barUnit.offset[SHOWN_MEASURE] || 0));

    return {
      ...startEndToXWidth(barUnit),
      y: y,
      height: y0 - y,
    };
  }

  let hoveredOpenOn: PortalBubbleOpenOn | undefined;

  if (bubbleInfo) {
    let title: string | undefined;
    let text: ReactNode;

    hoveredOpenOn = {
      x:
        CHART_MARGIN.left +
        timeScale(new Date((bubbleInfo.start.valueOf() + bubbleInfo.end.valueOf()) / 2)),
      y: CHART_MARGIN.top,
      title,
      text,
    };
  } else if (selection) {
    hoveredOpenOn = {
      x:
        CHART_MARGIN.left +
        timeScale(new Date((selection.start.valueOf() + selection.end.valueOf()) / 2)),
      y: CHART_MARGIN.top,
      title: `${selection.start} → ${selection.end}`,
      text: <>xxx</>,
    };
  }

  console.log(stackedRows);

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
            className="gridline-x"
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
          <g
            className="axis-x"
            transform={`translate(0,${innerStage.height})`}
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
          <g className="bar-group">
            {bubbleInfo && (
              <rect
                className="hover-highlight"
                {...startEndToXWidth(bubbleInfo as any)}
                y={0}
                height={innerStage.height}
              />
            )}
            {0 < nowX && nowX < innerStage.width && (
              <line className="now-line" x1={nowX} x2={nowX} y1={0} y2={innerStage.height + 8} />
            )}
            {stackedRows.map((stackedRow, i) => {
              return (
                <rect
                  key={i}
                  className={classNames('bar-unit')}
                  {...segmentBarToRect(stackedRow)}
                  fill="#497ee6"
                />
              );
            })}
            {selection && (
              <rect
                className={classNames('selection', { done: selection.done })}
                {...startEndToXWidth(selection as any)}
                y={0}
                height={innerStage.height}
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
        </g>
      </svg>
      {!rows.length && (
        <div className="empty-placeholder">
          <div className="no-data-text">There are no segments in the selected range</div>
        </div>
      )}
      {svgRef.current && (
        <PortalBubble
          className="continuous-chart-bubble"
          openOn={hoveredOpenOn}
          offsetElement={svgRef.current}
          onClose={selection?.done ? () => setSelection(undefined) : undefined}
          mute
          direction="up"
        />
      )}
    </div>
  );
};
