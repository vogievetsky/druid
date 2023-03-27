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

import { Button, ControlGroup, HTMLSelect, InputGroup } from '@blueprintjs/core';
import { IconNames } from '@blueprintjs/icons';
import React from 'react';

import type { CatalogColumn } from '../../druid-models';
import { deepSet } from '../../utils';

const DRUID_TYPES: string[] = ['STRING', 'LONG', 'FLOAT', 'DOUBLE'];

export interface CatalogColumnEntryProps {
  column: CatalogColumn;
  onChange(column: CatalogColumn): void;
  onMove(direction: number): void;
  onDelete(): void;
  first: boolean;
  last: boolean;
}

export const CatalogColumnEntry = function CatalogColumnEntry(props: CatalogColumnEntryProps) {
  const { column, onChange, onMove, onDelete, first, last } = props;

  return (
    <ControlGroup className="catalog-column-entry" fill>
      <InputGroup
        placeholder="Name"
        value={column.name}
        onChange={e => onChange(deepSet(column, 'name', e.target.value))}
        autoFocus={!column.name}
      />
      {column.name === '__time' ? (
        <HTMLSelect value="LONG" disabled>
          <option value="LONG">LONG</option>
        </HTMLSelect>
      ) : (
        <HTMLSelect
          value={column.dataType}
          onChange={e => onChange(deepSet(column, 'dataType', e.target.value))}
        >
          {DRUID_TYPES.map(v => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </HTMLSelect>
      )}
      <InputGroup
        placeholder="Description"
        value={column.properties?.description || ''}
        onChange={e =>
          onChange(deepSet(column, 'properties.description', e.target.value || undefined))
        }
      />
      <Button icon={IconNames.ARROW_UP} onClick={() => onMove(-1)} disabled={first} />
      <Button icon={IconNames.ARROW_DOWN} onClick={() => onMove(1)} disabled={last} />
      <Button icon={IconNames.TRASH} onClick={onDelete} />
    </ControlGroup>
  );
};
