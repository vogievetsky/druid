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

import React from 'react';

import type { Field } from '../../components';
import { deepGet } from '../../utils';
import type { InputFormat } from '../input-format/input-format';
import type { InputSource } from '../input-source/input-source';

export interface CatalogEntry<S = any> {
  id: {
    schema: string;
    name: string;
  };
  creationTime: number;
  updateTime: number;
  state: 'ACTIVE' | 'DELETING';
  spec: S;
}

export interface DatasourceTableSpec {
  type: 'datasource';
  properties: {
    description?: string;
    segmentGranularity?: string;
    clusterKeys?: { column: string; desc?: boolean }[];
    sealed?: boolean;
    hiddenColumns?: string[];
    targetSegmentRows?: number;
    tags?: Record<string, any>;
  };
  columns?: CatalogColumn[];
}

export interface ExternalTableSpec {
  type: 'extern';
  properties?: {
    description?: string;
    source?: InputSource;
    format?: InputFormat;
  };
  columns?: CatalogColumn[];
}

export interface CatalogColumn {
  name: string;
  dataType: string;
  properties?: {
    description?: string;
  };
}

export const DATASOURCE_TABLE_SPEC_FIELDS: Field<DatasourceTableSpec>[] = [
  {
    name: 'properties.description',
    type: 'string',
    info: <>A general description on the table.</>,
  },
  {
    name: 'properties.segmentGranularity',
    type: 'string',
    suggestions: ['PT1H', 'P1D', 'P1M', 'P1Y', 'ALL'],
    info: (
      <>
        <p>Supported values include:</p>
        <ul>
          <li>ISO periods: PT5M, PT1S</li>
          <li>Names used in partition specs: DAY, FIVE_MINUTE</li>
          <li>Descriptive names: 5 minutes, 6 hours</li>
        </ul>
      </>
    ),
  },
  {
    name: 'properties.clusterKeys',
    type: 'string-array',
    info: 'Cluster by columns',
    warpedInKey: 'column',
  },
  {
    name: 'properties.sealed',
    type: 'boolean',
    defaultValue: false,
  },
  {
    name: 'properties.hiddenColumns',
    type: 'string-array',
    defined: s => !deepGet(s, 'properties.sealed'),
  },
  {
    name: 'properties.targetSegmentRows',
    type: 'number',
    defaultValue: 5000000,
    info: <>Determines how many rows are in each segment.</>,
    hideInMore: true,
  },
];

export const EXTERNAL_TABLE_SPEC_FIELDS: Field<ExternalTableSpec>[] = [
  {
    name: 'properties.description',
    type: 'string',
    info: <>A general description on the table.</>,
  },
  {
    name: 'properties.source',
    type: 'json',
    info: <>The input source.</>,
  },
  {
    name: 'properties.format',
    type: 'json',
    info: <>The input format.</>,
  },
];
