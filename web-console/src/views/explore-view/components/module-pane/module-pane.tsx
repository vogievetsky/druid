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

import {
  Button,
  ButtonGroup,
  Menu,
  MenuItem,
  Popover,
  Position,
  ResizeSensor,
} from '@blueprintjs/core';
import { IconNames } from '@blueprintjs/icons';
import type { Column, QueryResult, SqlExpression, SqlQuery } from '@druid-toolkit/query';
import classNames from 'classnames';
import React, { useMemo, useState } from 'react';
import { useStore } from 'zustand';

import {
  isEmpty,
  localStorageGetJson,
  LocalStorageKeys,
  localStorageSetJson,
  mapRecord,
} from '../../../../utils';
import { highlightStore } from '../../highlight-store/highlight-store';
import type {
  Measure,
  ModuleState,
  ParameterDefinition,
  ParameterValues,
  QuerySource,
} from '../../models';
import { effectiveParameterDefault, Stage } from '../../models';
import { ModuleRepository } from '../../module-repository/module-repository';
import { adjustTransferValue, normalizeType } from '../../utils';
import { ControlPane } from '../control-pane/control-pane';
import { DroppableContainer } from '../droppable-container/droppable-container';
import { Issue } from '../issue/issue';
import { ModulePicker } from '../module-picker/module-picker';

import './module-pane.scss';

function getStickyParameterValuesForModule(moduleId: string): ParameterValues {
  return localStorageGetJson(LocalStorageKeys.EXPLORE_STICKY)?.[moduleId] || {};
}

function fillInDefaults(
  parameterValues: ParameterValues,
  parameters: Record<string, ParameterDefinition>,
  querySource: QuerySource,
): Record<string, any> {
  const parameterValuesWithDefaults = { ...parameterValues };
  Object.entries(parameters).forEach(([propName, propDefinition]) => {
    if (typeof parameterValuesWithDefaults[propName] !== 'undefined') return;
    parameterValuesWithDefaults[propName] = effectiveParameterDefault(propDefinition, querySource);
  });
  return parameterValuesWithDefaults;
}

export interface ModulePaneProps {
  moduleState: ModuleState;
  setModuleState(moduleState: ModuleState): void;
  onDelete(): void;
  querySource: QuerySource;
  where: SqlExpression;
  setWhere(where: SqlExpression): void;

  runSqlQuery(query: string | SqlQuery): Promise<QueryResult>;

  onAddToSourceQueryAsColumn?(expression: SqlExpression): void;
  onAddToSourceQueryAsMeasure?(measure: Measure): void;
}

export const ModulePane = function ModulePane(props: ModulePaneProps) {
  const {
    moduleState,
    setModuleState,
    onDelete,
    querySource,
    where,
    setWhere,
    runSqlQuery,
    onAddToSourceQueryAsColumn,
    onAddToSourceQueryAsMeasure,
  } = props;
  const { moduleId, parameterValues, showControls } = moduleState;
  const [stage, setStage] = useState<Stage | undefined>();

  const { dropHighlight } = useStore(highlightStore);

  const module = ModuleRepository.getModule(moduleId);

  function updateParameterValues(newParameterValues: ParameterValues) {
    // Evaluate sticky-ness
    if (module) {
      const currentExploreSticky = localStorageGetJson(LocalStorageKeys.EXPLORE_STICKY) || {};
      const currentModuleSticky = currentExploreSticky[moduleId] || {};
      const newModuleSticky = {
        ...currentModuleSticky,
        ...mapRecord(newParameterValues, (v, k) => (module.parameters[k]?.sticky ? v : undefined)),
      };

      localStorageSetJson(LocalStorageKeys.EXPLORE_STICKY, {
        ...currentExploreSticky,
        [moduleId]: isEmpty(newModuleSticky) ? undefined : newModuleSticky,
      });
    }

    setModuleState(
      moduleState.changeParameterValues({ ...parameterValues, ...newParameterValues }),
    );
  }

  const parameterValuesWithDefaults = useMemo(() => {
    if (!module) return {};
    return fillInDefaults(parameterValues, module.parameters, querySource);
  }, [parameterValues, module, querySource]);

  let content: React.ReactNode;
  if (module) {
    const modelIssue = undefined; // AutoForm.issueWithModel(moduleTileConfig.config, module.configFields);
    if (modelIssue) {
      content = <Issue issue={modelIssue} />;
    } else if (stage) {
      content = React.createElement(module.component, {
        stage,
        querySource,
        where,
        setWhere,
        parameterValues: parameterValuesWithDefaults,
        setParameterValues: updateParameterValues,
        runSqlQuery,
      });
    }
  } else {
    content = <Issue issue={`Unknown module id: ${moduleId}`} />;
  }

  function onShowColumn(column: Column) {
    setModuleState(moduleState.applyShowColumn(column));
  }

  function onShowMeasure(measure: Measure) {
    setModuleState(moduleState.applyShowMeasure(measure));
  }

  return (
    <div className={classNames('module-pane', showControls ? 'show-controls' : 'no-controls')}>
      <div className="module-top-bar">
        <ModulePicker
          selectedModuleId={moduleId}
          onSelectedModuleIdChange={newModuleId => {
            let newParameterValues = getStickyParameterValuesForModule(newModuleId);

            const oldModule = ModuleRepository.getModule(moduleId);
            const newModule = ModuleRepository.getModule(newModuleId);
            if (oldModule && newModule) {
              const oldModuleParameters = oldModule.parameters || {};
              const newModuleParameters = newModule.parameters || {};
              for (const paramName in oldModuleParameters) {
                const parameterValue = parameterValues[paramName];
                if (typeof parameterValue === 'undefined') continue;

                const oldParameterDefinition = oldModuleParameters[paramName];
                const transferGroup = oldParameterDefinition.transferGroup;
                if (typeof transferGroup !== 'string') continue;

                const normalizedType = normalizeType(oldParameterDefinition.type);
                const target = Object.entries(newModuleParameters).find(
                  ([_, def]) =>
                    def.transferGroup === transferGroup &&
                    normalizeType(def.type) === normalizedType,
                );
                if (!target) continue;

                newParameterValues = {
                  ...newParameterValues,
                  [target[0]]: adjustTransferValue(
                    parameterValue,
                    oldParameterDefinition.type,
                    target[1].type,
                  ),
                };
              }
            }

            dropHighlight();

            setModuleState(
              moduleState.change({ moduleId: newModuleId, parameterValues: newParameterValues }),
            );
          }}
        />
        <div className="bar-expander" />
        <ButtonGroup>
          <Popover
            position={Position.BOTTOM_RIGHT}
            content={
              <Menu>
                <MenuItem
                  icon={IconNames.RESET}
                  text="Reset visualization parameters"
                  onClick={() => {
                    setModuleState(
                      moduleState.changeParameterValues(
                        getStickyParameterValuesForModule(moduleId),
                      ),
                    );
                  }}
                />
                <MenuItem icon={IconNames.TRASH} text="Delete module" onClick={onDelete} />
              </Menu>
            }
          >
            <Button icon={IconNames.MORE} minimal />
          </Popover>
          <Button
            icon={IconNames.PANEL_STATS}
            minimal
            onClick={() => setModuleState(moduleState.change({ showControls: !showControls }))}
          />
        </ButtonGroup>
      </div>
      {showControls && module && (
        <div className="control-pane-container">
          <ControlPane
            querySource={querySource}
            onUpdateParameterValues={updateParameterValues}
            parameters={module.parameters}
            parameterValues={parameterValues}
            onAddToSourceQueryAsColumn={onAddToSourceQueryAsColumn}
            onAddToSourceQueryAsMeasure={onAddToSourceQueryAsMeasure}
          />
        </div>
      )}
      <ResizeSensor
        onResize={entries => {
          if (entries.length !== 1) return;
          const newStage = new Stage(entries[0].contentRect.width, entries[0].contentRect.height);
          if (newStage.equals(stage)) return;
          setStage(newStage);
        }}
      >
        <DroppableContainer
          className="module-inner-container"
          onDropColumn={onShowColumn}
          onDropMeasure={onShowMeasure}
        >
          {content}
        </DroppableContainer>
      </ResizeSensor>
    </div>
  );
};
