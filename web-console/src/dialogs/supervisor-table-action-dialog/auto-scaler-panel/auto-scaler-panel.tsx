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

import { FormGroup, NumericInput, ResizeSensor, Slider } from '@blueprintjs/core';
import { extent, least, max } from 'd3-array';
import { axisBottom, axisLeft } from 'd3-axis';
import { scaleLinear } from 'd3-scale';
import { select } from 'd3-selection';
import { line } from 'd3-shape';
import type { ReactNode } from 'react';
import React, { useMemo, useState } from 'react';

import { Loader } from '../../../components/loader/loader';
import type { PortalBubbleOpenOn } from '../../../components/portal-bubble/portal-bubble';
import { PortalBubble } from '../../../components/portal-bubble/portal-bubble';
import { useQueryManager } from '../../../hooks';
import { Api } from '../../../singletons';
import { CHART_COLORS, formatNumber, Stage } from '../../../utils';

import './auto-scaler-panel.scss';

interface AutoScalerRow {
  lag: number;
  taskCount: number;
}

const CHART_MARGIN = { top: 15, right: 40, bottom: 45, left: 70 };

interface AutoScalerPanelProps {
  supervisorId: string;
}

export function getAutoScalerValidationError({
  taskCountMin,
  taskCountMax,
  maxProcessingRatePerTask,
  optimalTaskIdleRatio,
  criticalLag,
  currentTaskCount,
}: {
  taskCountMin: number;
  taskCountMax: number;
  maxProcessingRatePerTask: number;
  optimalTaskIdleRatio: number;
  criticalLag: number;
  currentTaskCount: number | undefined;
}): string | undefined {
  if (taskCountMin > taskCountMax) return 'Minimum task count must not exceed maximum task count';
  if (maxProcessingRatePerTask < 100) return 'Max processing rate / task must be at least 100';
  if (optimalTaskIdleRatio <= 0 || optimalTaskIdleRatio >= 1) {
    return 'Optimal task idle ratio must be greater than 0 and less than 1';
  }
  if (criticalLag < 1000) return 'Critical lag must be at least 1000';
  if (
    currentTaskCount !== undefined &&
    (currentTaskCount < taskCountMin || currentTaskCount > taskCountMax)
  ) {
    return 'Current task count must be within the minimum and maximum task count';
  }
  return undefined;
}

export const AutoScalerPanel = React.memo(function AutoScalerPanel(props: AutoScalerPanelProps) {
  const { supervisorId } = props;

  const [taskCountMin, setTaskCountMin] = useState<number>(1);
  const [taskCountMax, setTaskCountMax] = useState<number>(10);
  const [maxProcessingRatePerTask, setMaxProcessingRatePerTask] = useState<number>(1000);
  const [optimalTaskIdleRatio, setOptimalTaskIdleRatio] = useState<number>(0.2);
  const [lagWeight, setLagWeight] = useState<number>(0.4);
  // Idle weight is the complement of lag weight; one slider drives both.
  const idleWeight = Math.round((1 - lagWeight) * 10) / 10;
  const [criticalLag, setCriticalLag] = useState<number>(1000000);
  // Undefined means "let the server use the supervisor's live task count".
  const [currentTaskCount, setCurrentTaskCount] = useState<number | undefined>(undefined);

  const [stage, setStage] = useState<Stage | undefined>();
  const [svgElement, setSvgElement] = useState<SVGSVGElement | null>(null);
  const [hoveredRow, setHoveredRow] = useState<AutoScalerRow | undefined>();
  const query = useMemo(
    () => ({
      supervisorId,
      taskCountMin,
      taskCountMax,
      maxProcessingRatePerTask,
      optimalTaskIdleRatio,
      lagWeight,
      idleWeight,
      criticalLag,
      currentTaskCount,
    }),
    [
      supervisorId,
      taskCountMin,
      taskCountMax,
      maxProcessingRatePerTask,
      optimalTaskIdleRatio,
      lagWeight,
      idleWeight,
      criticalLag,
      currentTaskCount,
    ],
  );
  const validationError = getAutoScalerValidationError(query);

  const [dataState] = useQueryManager<
    {
      supervisorId: string;
      taskCountMin: number;
      taskCountMax: number;
      maxProcessingRatePerTask: number;
      optimalTaskIdleRatio: number;
      lagWeight: number;
      idleWeight: number;
      criticalLag: number;
      currentTaskCount: number | undefined;
    },
    AutoScalerRow[]
  >({
    query: validationError ? undefined : query,
    debounceIdle: 300,
    debounceLoading: 500,
    processQuery: async (params, signal) => {
      const resp = await Api.instance.post<{ data: AutoScalerRow[] }>(
        `/druid/indexer/v1/supervisor/${Api.encodePath(params.supervisorId)}/autoscaler/simulate`,
        {
          autoScalerStrategy: 'costBased',
          enableTaskAutoScaler: true,
          taskCountMin: params.taskCountMin,
          taskCountMax: params.taskCountMax,
          optimalTaskIdleRatio: params.optimalTaskIdleRatio,
          lagWeight: params.lagWeight,
          idleWeight: params.idleWeight,
          criticalLagThreshold: params.criticalLag,
        },
        {
          params: {
            maxProcessingRatePerTask: params.maxProcessingRatePerTask,
            currentTaskCount: params.currentTaskCount,
          },
          signal,
        },
      );
      return resp.data.data ?? (resp.data as any);
    },
  });

  const data = dataState.data;
  const innerStage = stage?.applyMargin(CHART_MARGIN);

  let chart: ReactNode;
  let hoveredOpenOn: PortalBubbleOpenOn | undefined;
  if (data && innerStage && !innerStage.isInvalid()) {
    const lagExtent = extent(data, d => d.lag);
    const xScale = scaleLinear()
      .domain(typeof lagExtent[0] === 'number' ? lagExtent : [0, 1])
      .range([0, innerStage.width])
      .nice();
    const yScale = scaleLinear()
      .domain([0, max(data, d => d.taskCount) ?? 1])
      .range([innerStage.height, 0])
      .nice();

    chart = (
      <g transform={`translate(${CHART_MARGIN.left},${CHART_MARGIN.top})`}>
        <g
          className="axis-x"
          transform={`translate(0,${innerStage.height})`}
          ref={(node: any) => {
            select(node).call(axisBottom(xScale).tickFormat(v => formatNumber(v.valueOf())));
          }}
        />
        <text
          className="axis-name"
          x={innerStage.width / 2}
          y={innerStage.height + 38}
          textAnchor="middle"
        >
          Lag (records)
        </text>
        <g
          className="axis-y"
          ref={(node: any) => {
            select(node).call(axisLeft(yScale).tickFormat(v => formatNumber(v.valueOf())));
          }}
        />
        <text
          className="axis-name"
          transform={`translate(-50,${innerStage.height / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          Task count
        </text>
        <path
          className="series-line"
          d={line<AutoScalerRow>()
            .x(d => xScale(d.lag))
            .y(d => yScale(d.taskCount))(data)!}
          stroke={CHART_COLORS[0]}
        />
        {hoveredRow && (
          <>
            <line
              className="hover-line"
              x1={xScale(hoveredRow.lag)}
              x2={xScale(hoveredRow.lag)}
              y1={0}
              y2={innerStage.height}
            />
            <circle
              cx={xScale(hoveredRow.lag)}
              cy={yScale(hoveredRow.taskCount)}
              r={3}
              fill={CHART_COLORS[0]}
            />
          </>
        )}
        <rect
          className="interaction-area"
          width={innerStage.width}
          height={innerStage.height}
          onMouseMove={e => {
            const lag = xScale.invert(e.clientX - e.currentTarget.getBoundingClientRect().x);
            setHoveredRow(least(data, d => Math.abs(d.lag - lag)));
          }}
          onMouseLeave={() => setHoveredRow(undefined)}
        />
      </g>
    );

    if (hoveredRow) {
      hoveredOpenOn = {
        title: `Lag: ${formatNumber(hoveredRow.lag)}`,
        x: CHART_MARGIN.left + xScale(hoveredRow.lag),
        y: CHART_MARGIN.top + yScale(hoveredRow.taskCount),
        text: `Task count: ${formatNumber(hoveredRow.taskCount)}`,
      };
    }
  }

  const errorMessage = validationError ?? dataState.getErrorMessage();

  return (
    <div className="auto-scaler-panel">
      <div className="auto-scaler-controls">
        <FormGroup label="Min task count" inline>
          <NumericInput
            value={taskCountMin}
            min={1}
            max={taskCountMax}
            onValueChange={v => setTaskCountMin(v)}
            buttonPosition="none"
            fill
          />
        </FormGroup>
        <FormGroup label="Max task count" inline>
          <NumericInput
            value={taskCountMax}
            min={taskCountMin}
            onValueChange={v => setTaskCountMax(v)}
            buttonPosition="none"
            fill
          />
        </FormGroup>
        <FormGroup label="Max processing rate / task" inline>
          <NumericInput
            value={maxProcessingRatePerTask}
            min={100}
            onValueChange={v => setMaxProcessingRatePerTask(v)}
            buttonPosition="none"
            fill
          />
        </FormGroup>
        <FormGroup label="Optimal task idle ratio" inline>
          <NumericInput
            value={optimalTaskIdleRatio}
            min={0.01}
            max={0.99}
            stepSize={0.1}
            minorStepSize={0.01}
            onValueChange={v => setOptimalTaskIdleRatio(v)}
            fill
          />
        </FormGroup>
        <FormGroup label="Current task count" inline>
          <NumericInput
            value={currentTaskCount ?? ''}
            min={taskCountMin}
            max={taskCountMax}
            placeholder="Supervisor's current"
            onValueChange={v => setCurrentTaskCount(isNaN(v) ? undefined : v)}
            buttonPosition="none"
            fill
          />
        </FormGroup>
        <FormGroup label="Critical lag (records)" inline>
          <NumericInput
            value={criticalLag}
            min={1000}
            onValueChange={v => setCriticalLag(v)}
            buttonPosition="none"
            fill
          />
        </FormGroup>
        <FormGroup label={`Lag ${lagWeight.toFixed(1)} / Idle ${idleWeight.toFixed(1)} weight`}>
          <Slider
            min={0}
            max={1}
            stepSize={0.1}
            labelStepSize={0.5}
            value={lagWeight}
            onChange={v => setLagWeight(Math.round(v * 10) / 10)}
          />
        </FormGroup>
      </div>
      <div className="auto-scaler-chart-area">
        {errorMessage && <div className="auto-scaler-error">{errorMessage}</div>}
        {dataState.loading && <Loader />}
        <ResizeSensor
          onResize={entries => {
            if (entries.length !== 1) return;
            const newStage = new Stage(entries[0].contentRect.width, entries[0].contentRect.height);
            if (newStage.equals(stage)) return;
            setStage(newStage);
          }}
        >
          <div className="auto-scaler-chart">
            {stage && (
              <svg ref={setSvgElement} {...stage.toWidthHeight()} viewBox={stage.toViewBox()}>
                {chart}
              </svg>
            )}
          </div>
        </ResizeSensor>
        {svgElement && <PortalBubble openOn={hoveredOpenOn} offsetElement={svgElement} mute />}
      </div>
    </div>
  );
});
