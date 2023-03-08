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

import type { Field } from '../../components';
import { deepGet, oneOf } from '../../utils';

export interface OverlordDynamicConfig {
  selectStrategy?: {
    type: string;
    affinityConfig?: AffinityConfig;
    workerCategorySpec?: WorkerCategorySpec;
  };
  autoScaler?: AutoScalerConfig;
}

export interface AffinityConfig {
  affinity?: Record<string, string[]>;
  strong?: boolean;
}

export interface WorkerCategorySpec {
  categoryMap?: Record<string, any>;
  strong?: boolean;
}

export interface AutoScalerConfig {
  type: string;
  minNumWorkers: number;
  maxNumWorkers: number;
  envConfig: {
    // ToDo: verify
    // availabilityZone: 'us-east-1a';
    // nodeData: {
    //   amiId: '${AMI}';
    //   instanceType: 'c3.8xlarge';
    //   minInstances: 1;
    //   maxInstances: 1;
    //   securityGroupIds: ['${IDs}'];
    //   keyName: '${KEY_NAME}';
    // };
    // userData: {
    //   impl: 'string';
    //   data: '${SCRIPT_COMMAND}';
    //   versionReplacementString: ':VERSION:';
    //   version: null;
    // };

    numInstances: number;
    projectId: string;
    zoneName: string;
    managedInstanceGroupName: string;
  };
}

export const OVERLORD_DYNAMIC_CONFIG_FIELDS: Field<OverlordDynamicConfig>[] = [
  {
    name: 'selectStrategy.type',
    type: 'string',
    defaultValue: 'equalDistribution',
    suggestions: [
      'equalDistribution',
      'equalDistributionWithCategorySpec',
      'fillCapacity',
      'fillCapacityWithCategorySpec',
    ],
  },

  // AffinityConfig
  {
    name: 'selectStrategy.affinityConfig.strong',
    type: 'boolean',
    defaultValue: false,
    defined: c =>
      oneOf(
        deepGet(c, 'selectStrategy.type') ?? 'equalDistribution',
        'equalDistribution',
        'fillCapacity',
      ),
  },
  {
    name: 'selectStrategy.affinityConfig.affinity',
    type: 'json',
    placeholder: `{"datasource1":["host1:port","host2:port"], "datasource2":["host3:port"]}`,
    defined: c =>
      oneOf(
        deepGet(c, 'selectStrategy.type') ?? 'equalDistribution',
        'equalDistribution',
        'fillCapacity',
      ),
  },

  // WorkerCategorySpec
  {
    name: 'selectStrategy.workerCategorySpec.strong',
    type: 'boolean',
    defaultValue: false,
    defined: c =>
      oneOf(
        deepGet(c, 'selectStrategy.type'),
        'equalDistributionWithCategorySpec',
        'fillCapacityWithCategorySpec',
      ),
  },
  {
    name: 'selectStrategy.workerCategorySpec.categoryMap',
    type: 'json',
    defaultValue: '{}',
    defined: c =>
      oneOf(
        deepGet(c, 'selectStrategy.type'),
        'equalDistributionWithCategorySpec',
        'fillCapacityWithCategorySpec',
      ),
  },

  {
    name: 'autoScaler.type',
    label: 'Auto scaler type',
    type: 'string',
    suggestions: [undefined, 'ec2', 'gce'],
  },
  {
    name: 'autoScaler.minNumWorkers',
    type: 'number',
    defaultValue: 0,
    defined: c => oneOf(deepGet(c, 'autoScaler.type'), 'ec2', 'gce'),
  },
  {
    name: 'autoScaler.maxNumWorkers',
    type: 'number',
    defaultValue: 0,
    defined: c => oneOf(deepGet(c, 'autoScaler.type'), 'ec2', 'gce'),
  },

  // GCE
  {
    name: 'autoScaler.numInstances',
    type: 'number',
    defined: c => deepGet(c, 'autoScaler.type') === 'gce',
  },
  {
    name: 'autoScaler.projectId',
    type: 'string',
    defined: c => deepGet(c, 'autoScaler.type') === 'gce',
  },
  {
    name: 'autoScaler.zoneName',
    type: 'string',
    defined: c => deepGet(c, 'autoScaler.type') === 'gce',
  },
  {
    name: 'autoScaler.managedInstanceGroupName',
    type: 'string',
    defined: c => deepGet(c, 'autoScaler.type') === 'gce',
  },
];
