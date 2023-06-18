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

import type { AxiosResponse, CancelToken } from 'axios';
import { L } from 'druid-query-toolkit';

import type { QueryContext } from '../../druid-models';
import { Execution } from '../../druid-models';
import { Api } from '../../singletons';
import {
  deepGet,
  DruidError,
  IntermediateQueryState,
  queryDruidSql,
  QueryManager,
} from '../../utils';

const WAIT_FOR_SEGMENT_METADATA_TIMEOUT = 180000; // 3 minutes to wait until segments appear in the metadata
const WAIT_FOR_SEGMENT_LOAD_TIMEOUT = 540000; // 9 minutes to wait for segments to load at all

export interface SubmitAsyncQueryOptions {
  query: string | Record<string, any>;
  context?: QueryContext;
  prefixLines?: number;
  cancelToken?: CancelToken;
  preserveOnTermination?: boolean;
  onSubmitted?: (id: string) => void;
}

export async function submitAsyncQuery(
  options: SubmitAsyncQueryOptions,
): Promise<Execution | IntermediateQueryState<Execution>> {
  const { query, context, prefixLines, cancelToken, preserveOnTermination, onSubmitted } = options;

  let sqlQuery: string;
  let jsonQuery: Record<string, any>;
  if (typeof query === 'string') {
    sqlQuery = query;
    jsonQuery = {
      query: sqlQuery,
      resultFormat: 'array',
      header: true,
      typesHeader: true,
      sqlTypesHeader: true,
      context: context,
    };
  } else {
    sqlQuery = query.query;

    if (context) {
      jsonQuery = {
        ...query,
        context: {
          ...(query.context || {}),
          ...context,
        },
      };
    } else {
      jsonQuery = query;
    }
  }

  let sqlAsyncResp: AxiosResponse;

  try {
    sqlAsyncResp = await Api.instance.post(`/druid/v2/sql/statements`, jsonQuery, { cancelToken });
  } catch (e) {
    const druidError = deepGet(e, 'response.data');
    if (!druidError) throw e;
    throw new DruidError(druidError, prefixLines);
  }

  const sqlAsyncPayload = sqlAsyncResp.data;

  const execution = Execution.fromAsyncStatus(sqlAsyncPayload, sqlQuery, context);

  if (onSubmitted) {
    onSubmitted(execution.id);
  }

  if (cancelToken) {
    cancelAsyncExecutionOnCancel(execution.id, cancelToken, Boolean(preserveOnTermination));
  }

  return new IntermediateQueryState(execution);
}

export interface ReattachAsyncQueryOptions {
  id: string;
  cancelToken?: CancelToken;
  preserveOnTermination?: boolean;
}

export async function reattachAsyncExecution(
  option: ReattachAsyncQueryOptions,
): Promise<Execution | IntermediateQueryState<Execution>> {
  const { id, cancelToken, preserveOnTermination } = option;
  let execution: Execution;

  try {
    execution = await getAsyncExecution(id, cancelToken);
  } catch (e) {
    throw new Error(`Reattaching to query failed due to: ${e.message}`);
  }

  if (cancelToken) {
    cancelAsyncExecutionOnCancel(execution.id, cancelToken, Boolean(preserveOnTermination));
  }

  return new IntermediateQueryState(execution);
}

export async function updateExecutionWithAsyncIfNeeded(
  execution: Execution,
  cancelToken?: CancelToken,
): Promise<Execution> {
  if (!execution.isWaitingForQuery()) return execution;

  // Inherit old payload so as not to re-query it
  return execution.updateWith(await getAsyncExecution(execution.id, cancelToken));
}

export async function getAsyncExecution(id: string, cancelToken?: CancelToken): Promise<Execution> {
  const encodedId = Api.encodePath(id);

  const statusResp = await Api.instance.get(`/druid/v2/sql/statements/${encodedId}`, {
    cancelToken,
  });

  return Execution.fromAsyncStatus(statusResp.data);
}

export async function updateExecutionWithDatasourceLoadedIfNeeded(
  execution: Execution,
  _cancelToken?: CancelToken,
): Promise<Execution> {
  if (
    !(execution.destination?.type === 'dataSource' && !execution.destination.loaded) ||
    execution.status !== 'SUCCESS'
  ) {
    return execution;
  }

  const endTime = execution.getEndTime();
  if (
    !endTime || // If endTime is not set (this is not expected to happen) then just bow out
    execution.stages?.getLastStage()?.partitionCount === 0 || // No data was meant to be written anyway, nothing to do
    endTime.valueOf() + WAIT_FOR_SEGMENT_LOAD_TIMEOUT < Date.now() // Enough time has passed since the query ran... don't bother waiting for segments to load.
  ) {
    return execution.markDestinationDatasourceLoaded();
  }

  // Ideally we would have a more accurate query here, instead of
  //   COUNT(*) FILTER (WHERE is_published = 1 AND is_available = 0)
  // we want to filter on something like
  //   COUNT(*) FILTER (WHERE is_should_be_available = 1 AND is_available = 0)
  // `is_published` does not quite capture what we want but this is the best we have for now.
  const segmentCheck = await queryDruidSql({
    query: `SELECT
  COUNT(*) AS num_segments,
  COUNT(*) FILTER (WHERE is_published = 1 AND is_available = 0) AS loading_segments
FROM sys.segments
WHERE datasource = ${L(execution.destination.dataSource)} AND is_overshadowed = 0`,
  });

  const numSegments: number = deepGet(segmentCheck, '0.num_segments') || 0;
  const loadingSegments: number = deepGet(segmentCheck, '0.loading_segments') || 0;

  // There appear to be no segments, since we checked above that something was written out we know that they have not shown up in the metadata yet
  if (numSegments === 0) {
    if (endTime.valueOf() + WAIT_FOR_SEGMENT_METADATA_TIMEOUT < Date.now()) {
      // Enough time has passed since the query ran... give up waiting for segments to show up in metadata.
      return execution.markDestinationDatasourceLoaded();
    }

    return execution;
  }

  // There are segments, and we are still waiting for some of them to load
  if (loadingSegments > 0) return execution;

  return execution.markDestinationDatasourceLoaded();
}

function cancelAsyncExecutionOnCancel(
  id: string,
  cancelToken: CancelToken,
  preserveOnTermination = false,
): void {
  void cancelToken.promise
    .then(cancel => {
      if (preserveOnTermination && cancel.message === QueryManager.TERMINATION_MESSAGE) return;
      return cancelAsyncExecution(id);
    })
    .catch(() => {});
}

export function cancelAsyncExecution(id: string): Promise<void> {
  return Api.instance.delete(`/druid/v2/sql/statements/${Api.encodePath(id)}`);
}
