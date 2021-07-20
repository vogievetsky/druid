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

import { Button, Classes, Dialog, Intent } from '@blueprintjs/core';
import { sum } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import { QueryResult } from 'druid-query-toolkit';
import React from 'react';
import ReactTable, { Column } from 'react-table';

import { formatDuration, formatInteger, formatPercent } from '../../../utils';

import './query-metrics-dialog.scss';

export type QueryExecutionMetrics = Readonly<{
  queryStart: number;
  queryMs: number;
  cpuNanos: number;
  threads: number;
  segments: number;
  rows: number;
  servers: number;
}>;

export type QueryMetrics = Readonly<{
  queryId: string;
  metrics: QueryExecutionMetrics;
}>;

interface TileEntry<T> {
  name: keyof T;
  label: string;
  formatter: (v: any) => string;
}

const TILE_ENTRIES: TileEntry<QueryExecutionMetrics>[] = [
  { name: 'queryMs', label: 'Query time', formatter: formatDuration },
  { name: 'rows', label: 'Rows scanned', formatter: formatInteger },
  { name: 'servers', label: 'Servers', formatter: formatInteger },
  { name: 'cpuNanos', label: 'CPU time', formatter: t => formatDuration(t / 1000) },
  { name: 'threads', label: 'Threads', formatter: formatInteger },
  { name: 'segments', label: 'Segments', formatter: formatInteger },
];

function aggregateQueryExecutionMetrics(
  queryExecutionMetrics: QueryExecutionMetrics[],
): QueryExecutionMetrics {
  const mainQueryMetrics = queryExecutionMetrics[0];
  if (!mainQueryMetrics) throw new Error('must have at least the main query');
  if (queryExecutionMetrics.length === 1) return mainQueryMetrics;

  return {
    queryStart: mainQueryMetrics.queryStart,
    queryMs: mainQueryMetrics.queryMs,
    cpuNanos: sum(queryExecutionMetrics, d => d.cpuNanos),
    threads: sum(queryExecutionMetrics, d => d.threads),
    segments: sum(queryExecutionMetrics, d => d.segments),
    rows: sum(queryExecutionMetrics.slice(1), d => d.rows),
    servers: mainQueryMetrics.servers,
  };
}

export interface QueryMetricsDialogProps {
  queryResult: QueryResult;
  onClose: () => void;
}

export const QueryMetricsDialog = React.memo(function QueryMetricsDialog(
  props: QueryMetricsDialogProps,
) {
  const { queryResult, onClose } = props;

  let totalsCont: any;
  let queries: any;
  if (queryResult.sqlQuery || queryResult.sqlQueryId) {
    const metrics: QueryMetrics[] = [
      {
        queryId: 'xxx',
        metrics: {
          segments: 30,
          servers: 2,
          threads: 8,
          rows: 1000000,
          cpuNanos: 9999999,
          queryStart: 1620000000,
          queryMs: 2234,
        },
      },
      {
        queryId: 'xxx',
        metrics: {
          segments: 20,
          servers: 2,
          threads: 8,
          rows: 1200000,
          cpuNanos: 9999999,
          queryStart: 1620000050,
          queryMs: 123,
        },
      },
      {
        queryId: 'xxx',
        metrics: {
          segments: 50,
          servers: 2,
          threads: 8,
          rows: 1200000,
          cpuNanos: 9999999,
          queryStart: 1620001000,
          queryMs: 234,
        },
      },
    ];

    const totals = aggregateQueryExecutionMetrics(metrics.map(x => x.metrics));
    totalsCont = TILE_ENTRIES.map(({ name, label, formatter }) => {
      return (
        <div className="total" key={name}>
          <div className="label">{label}</div>
          <div className="value">{formatter(totals[name])}</div>
        </div>
      );
    });

    const timelineScale = scaleLinear().domain([
      totals.queryStart,
      totals.queryStart + totals.queryMs,
    ]);

    if (metrics.length > 1) {
      queries = (
        <ReactTable
          data={metrics}
          defaultPageSize={10}
          columns={TILE_ENTRIES.map(
            ({ name, label, formatter }) =>
              ({
                Header: label,
                id: name,
                accessor: ({ metrics }) => metrics[name],
                Cell: ({ value }) => formatter(value),
              } as Column<QueryMetrics>),
          ).concat({
            Header: 'Timeline',
            id: 'trace',
            Cell: function TimelineCell({ original, index }) {
              const { queryStart, queryMs } = original.metrics;
              return (
                <div className="timeline">
                  <div
                    className="timeline-bar"
                    style={{
                      left: formatPercent(timelineScale(queryStart)),
                      width: formatPercent(
                        timelineScale(queryStart + queryMs) - timelineScale(queryStart),
                      ),
                      opacity: index ? undefined : 0.5,
                    }}
                  />
                </div>
              );
            },
          })}
        />
      );
    }
  }

  return (
    <Dialog
      className="query-metrics-dialog"
      onClose={onClose}
      title="Query metrics"
      isOpen
      canEscapeKeyClose
    >
      <div className={Classes.DIALOG_BODY}>
        <div className="totals">{totalsCont}</div>
        {queries}
      </div>
      <div className={Classes.DIALOG_FOOTER}>
        <div className={Classes.DIALOG_FOOTER_ACTIONS}>
          <Button intent={Intent.PRIMARY} onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
});
