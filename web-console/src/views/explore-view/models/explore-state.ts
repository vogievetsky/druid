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

import type { Column } from '@druid-toolkit/query';
import {
  filterPatternToExpression,
  SqlExpression,
  SqlLiteral,
  SqlQuery,
} from '@druid-toolkit/query';

import { changeByIndex, filterMapIfChanged } from '../../../utils';
import type { Rename } from '../utils';
import { renameColumnsInExpression } from '../utils';

import { ExpressionMeta } from './expression-meta';
import type { Measure } from './measure';
import { ModuleState } from './module-state';
import { QuerySource } from './query-source';

type ExploreModuleLayout = 'horizontal' | 'vertical';

interface ExploreStateValue {
  source: string;
  showSourceQuery?: boolean;
  where: SqlExpression;
  moduleStates: ReadonlyArray<ModuleState>;
  layout?: ExploreModuleLayout;
  helpers?: ReadonlyArray<ExpressionMeta>;
  showHelpers?: boolean;
}

export class ExploreState {
  static DEFAULT_STATE: ExploreState;

  static fromJS(js: any) {
    let moduleStatesJS: any[] = [];
    if (Array.isArray(js.moduleStates)) {
      moduleStatesJS = js.moduleStates;
    } else if (js.moduleId && js.parameterValues) {
      moduleStatesJS = [js];
    }
    return new ExploreState({
      ...js,
      where: SqlExpression.maybeParse(js.where) || SqlLiteral.TRUE,
      moduleStates: moduleStatesJS.map(ModuleState.fromJS),
      helpers: ExpressionMeta.inflateArray(js.helpers || []),
    });
  }

  public readonly source: string;
  public readonly showSourceQuery: boolean;
  public readonly where: SqlExpression;
  public readonly moduleStates: ReadonlyArray<ModuleState>;
  public readonly layout?: ExploreModuleLayout;
  public readonly helpers: ReadonlyArray<ExpressionMeta>;
  public readonly showHelpers: boolean;

  public readonly parsedSource: SqlQuery | undefined;
  public readonly parseError: string | undefined;

  constructor(value: ExploreStateValue) {
    this.source = value.source;
    this.showSourceQuery = Boolean(value.showSourceQuery);
    this.where = value.where;
    this.moduleStates = value.moduleStates;
    this.layout = value.layout;
    this.helpers = value.helpers || [];
    this.showHelpers = Boolean(value.showHelpers);

    if (this.source === '') {
      this.parseError = 'Please select source or enter a source query';
    } else {
      try {
        this.parsedSource = SqlQuery.parse(this.source);
      } catch (e) {
        this.parseError = e.message;
      }
    }
  }

  valueOf(): ExploreStateValue {
    const value: ExploreStateValue = {
      source: this.source,
      where: this.where,
      moduleStates: this.moduleStates,
      layout: this.layout,
    };
    if (this.showSourceQuery) value.showSourceQuery = true;
    if (this.helpers.length) value.helpers = this.helpers;
    if (this.showHelpers) value.showHelpers = true;
    return value;
  }

  public change(newValues: Partial<ExploreStateValue>): ExploreState {
    return new ExploreState({
      ...this.valueOf(),
      ...newValues,
    });
  }

  public changeSource(newSource: SqlQuery | string, rename: Rename | undefined): ExploreState {
    const toChange: Partial<ExploreStateValue> = {
      source: String(newSource),
    };

    if (rename) {
      toChange.where = renameColumnsInExpression(this.where, rename);
      toChange.moduleStates = this.moduleStates.map(moduleState => moduleState.applyRename(rename));
      toChange.helpers = this.helpers.map(helper => helper.applyRename(rename));
    }

    return this.change(toChange);
  }

  public getLayout(): ExploreModuleLayout {
    return this.layout || 'vertical';
  }

  public changeToTable(tableName: string): ExploreState {
    return this.changeSource(SqlQuery.create(tableName), undefined);
  }

  public initToTable(tableName: string): ExploreState {
    const { moduleStates } = this;
    return this.change({
      source: SqlQuery.create(tableName).toString(),
      moduleStates: moduleStates.length ? moduleStates : [ModuleState.INIT_STATE],
    });
  }

  public addInitTimeFilterIfNeeded(columns: readonly Column[]): ExploreState {
    if (!this.parsedSource) return this;
    if (!QuerySource.isSingleStarQuery(this.parsedSource)) return this; // Only trigger for `SELECT * FROM ...` queries
    if (!this.where.equal(SqlLiteral.TRUE)) return this;

    // Either find the `__time::TIMESTAMP` column or use the first column if it is a TIMESTAMP
    const timeColumn =
      columns.find(c => c.isTimeColumn()) ||
      (columns[0].sqlType === 'TIMESTAMP' ? columns[0] : undefined);
    if (!timeColumn) return this;

    return this.change({
      where: filterPatternToExpression({
        type: 'timeRelative',
        column: timeColumn.name,
        negated: false,
        anchor: 'maxDataTime',
        rangeDuration: 'P1D',
        startBound: '[',
        endBound: ')',
      }),
    });
  }

  public restrictToQuerySource(querySource: QuerySource): ExploreState {
    const { where, moduleStates } = this;
    const newWhere = querySource.restrictWhere(where);
    const newModuleStates = filterMapIfChanged(moduleStates, moduleState =>
      moduleState.restrictToQuerySource(querySource),
    );
    if (where === newWhere && moduleStates === newModuleStates) return this;

    return this.change({
      where: newWhere,
      moduleStates: newModuleStates,
    });
  }

  public changeModuleState(index: number, moduleState: ModuleState): ExploreState {
    return this.change({
      moduleStates: changeByIndex(this.moduleStates, index, () => moduleState),
    });
  }

  public removeModule(index: number): ExploreState {
    return this.change({
      moduleStates: changeByIndex(this.moduleStates, index, () => undefined),
    });
  }

  public applyShowColumn(column: Column): ExploreState {
    const { moduleStates } = this;
    if (moduleStates.length) {
      return this.change({
        moduleStates: changeByIndex(moduleStates, moduleStates.length - 1, moduleState =>
          moduleState.applyShowColumn(column),
        ),
      });
    } else {
      return this.change({
        moduleStates: [ModuleState.INIT_STATE.applyShowColumn(column)],
      });
    }
  }

  public applyShowMeasure(measure: Measure): ExploreState {
    const { moduleStates } = this;
    if (moduleStates.length) {
      return this.change({
        moduleStates: changeByIndex(moduleStates, moduleStates.length - 1, moduleState =>
          moduleState.applyShowMeasure(measure),
        ),
      });
    } else {
      return this.change({
        moduleStates: [ModuleState.INIT_STATE.applyShowMeasure(measure)],
      });
    }
  }

  public isInitState(): boolean {
    return (
      this.source === '' &&
      this.where instanceof SqlLiteral &&
      !this.moduleStates.length &&
      !this.helpers.length
    );
  }

  public duplicateLastModule(): ExploreState {
    const { moduleStates } = this;
    if (!moduleStates.length) return this;
    return this.change({
      moduleStates: moduleStates.concat(moduleStates[moduleStates.length - 1]),
    });
  }

  public removeHelper(index: number): ExploreState {
    return this.change({ helpers: changeByIndex(this.helpers, index, () => undefined) });
  }

  public addHelper(helper: ExpressionMeta): ExploreState {
    return this.change({ helpers: this.helpers.concat(helper) });
  }
}

ExploreState.DEFAULT_STATE = new ExploreState({
  source: '',
  where: SqlLiteral.TRUE,
  moduleStates: [],
});
