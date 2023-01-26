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

import { Code } from '@blueprintjs/core';
import React from 'react';

import { ExternalLink, Field } from '../../components';
import { getLink } from '../../links';
import { deepGet, oneOf } from '../../utils';
import { FILTER_SUGGESTIONS } from '../input-source/input-source';

export interface TableMetadata<S = any> {
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
    segmentGranularity?: string;
    clusterKeys?: { column: string; desc?: boolean }[];
    targetSegmentRows?: number;
    tags?: Record<string, any>;
  };
  columns?: any[];
}

export const DATASOURCE_TABLE_SPEC_FIELDS: Field<DatasourceTableSpec>[] = [
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
    name: 'properties.targetSegmentRows',
    type: 'number',
    defaultValue: 5000000,
    info: <>Determines how many rows are in each segment.</>,
    hideInMore: true,
  },
];

export interface InputCatalog {
  dbSchema: 'input';
  name: string;
  creationTime?: number;
  updateTime?: number;
  state?: string;
  spec: {
    type: 'input';
    properties: {
      // Source ----------------
      source?: string;

      // for source: inline
      data?: string;

      // for source: local
      files?: string;
      file?: string;
      fileFilter?: string;
      baseDir?: string;

      // for source: http
      uris?: string;
      uri?: string;
      user?: string;
      password?: string;

      // ...more to come later

      // Format ---------------
      format?: string;

      // for format: csv
      delimiter?: string;
      skipRows?: number;
    };
    columns: { name: string; sqlType: string }[];
  };
}

export function getInputCatalogFields(editName: boolean): Field<InputCatalog>[] {
  return [
    {
      name: 'name',
      type: 'string',
      required: true,
      disabled: !editName,
      info: editName ? 'The name of the datasource' : undefined,
    },

    // Source ---------------
    {
      name: 'spec.properties.source',
      label: 'Source type',
      type: 'string',
      suggestions: ['local', 'http', 'inline'],
    },

    // source: inline
    {
      name: 'spec.properties.data',
      label: 'Inline data',
      type: 'string',
      defined: d => deepGet(d, 'spec.properties.source') === 'inline',
      placeholder: 'Paste your data here',
      multiline: true,
      info: <p>Put you inline data here</p>,
    },

    // source: http
    {
      name: 'spec.properties.uri',
      label: 'URI',
      type: 'string',
      placeholder: 'https://example.com/path/to/file1.ext',
      defined: d =>
        deepGet(d, 'spec.properties.source') === 'http' && !deepGet(d, 'spec.properties.uris'),
      info: (
        <p>
          The full URI of your file. To ingest from multiple URIs, use commas to separate each
          individual URI.
        </p>
      ),
    },
    {
      name: 'spec.properties.uris',
      label: 'URIs',
      type: 'string-array',
      placeholder: 'https://example.com/path/to/file1.ext, https://example.com/path/to/file2.ext',
      defined: d =>
        deepGet(d, 'spec.properties.source') === 'http' && !deepGet(d, 'spec.properties.uri'),
      info: (
        <p>
          The full URI of your file. To ingest from multiple URIs, use commas to separate each
          individual URI.
        </p>
      ),
    },
    {
      name: 'spec.properties.user',
      label: 'HTTP auth username',
      type: 'string',
      defined: d => deepGet(d, 'spec.properties.source') === 'http',
      placeholder: '(optional)',
      info: <p>Username to use for authentication with specified URIs</p>,
    },
    {
      name: 'spec.properties.password',
      label: 'HTTP auth password',
      type: 'string',
      defined: d => deepGet(d, 'spec.properties.source') === 'http',
      placeholder: '(optional)',
      info: <p>Password to use for authentication with specified URIs</p>,
    },

    // source: local
    {
      name: 'spec.properties.baseDir',
      label: 'Base directory',
      type: 'string',
      placeholder: '/path/to/files/',
      defined: d => deepGet(d, 'spec.properties.source') === 'local',
      info: (
        <>
          <ExternalLink href={`${getLink('DOCS')}/ingestion/native-batch.html#input-sources`}>
            baseDir
          </ExternalLink>
          <p>Specifies the directory to search recursively for files to be ingested.</p>
        </>
      ),
    },
    {
      name: 'spec.properties.fileFilter',
      label: 'File filter',
      type: 'string',
      defined: d => deepGet(d, 'spec.properties.source') === 'local',
      suggestions: FILTER_SUGGESTIONS,
      info: (
        <>
          <ExternalLink href={`${getLink('DOCS')}/ingestion/native-batch.html#local-input-source`}>
            filter
          </ExternalLink>
          <p>
            A wildcard filter for files. See{' '}
            <ExternalLink href="https://commons.apache.org/proper/commons-io/apidocs/org/apache/commons/io/filefilter/WildcardFileFilter.html">
              here
            </ExternalLink>{' '}
            for format information.
          </p>
        </>
      ),
    },

    // Format ---------------
    {
      name: 'spec.properties.format',
      label: 'Format type',
      type: 'string',
      suggestions: ['json', 'csv'],
    },

    // format: csv
    {
      name: 'spec.properties.skipRows',
      type: 'number',
      defaultValue: 0,
      defined: d => oneOf(deepGet(d, 'spec.properties.format'), 'csv', 'tsv'),
      min: 0,
      info: (
        <>
          If this is set, skip the first <Code>skipHeaderRows</Code> rows from each file.
        </>
      ),
    },
  ];
}
