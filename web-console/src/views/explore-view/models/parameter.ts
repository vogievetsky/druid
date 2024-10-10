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

/* eslint-disable @typescript-eslint/ban-types */

import { deleteKeys, mapRecord, mapRecordIfChanged } from '../../../utils';

import { ExpressionMeta } from './expression-meta';
import { Measure } from './measure';
import type { QuerySource } from './query-source';

export type OptionValue = string | number;

export type ModuleFunctor<T> =
  | T
  | ((options: { parameterValues: ParameterValues; querySource: QuerySource | undefined }) => T);

export function evaluateFunctor<T>(
  fn: ModuleFunctor<T> | undefined,
  parameterValues: ParameterValues,
  querySource: QuerySource | undefined,
): T | undefined {
  if (typeof fn === 'function') {
    return (fn as any)({ parameterValues, querySource });
  } else {
    return fn;
  }
}

export interface ParameterTypes {
  string: string;
  boolean: boolean;
  number: number;
  option: OptionValue;
  options: OptionValue[];
  expression: ExpressionMeta;
  expressions: ExpressionMeta[];
  measure: Measure;
  measures: Measure[];
}

interface TypedExtensions {
  boolean: {};
  string: {};
  number: {
    min?: number;
    max?: number;
  };
  option: {
    options: readonly OptionValue[];
    optionLabels?: { [key: string | number]: string };
  };
  options: {
    options: readonly OptionValue[];
    optionLabels?: { [key: string | number]: string };
    allowDuplicates?: boolean;
    nonEmpty?: boolean;
  };
  expression: {};
  expressions: {
    allowDuplicates?: boolean;
    nonEmpty?: boolean;
  };
  measure: {};
  measures: {
    allowDuplicates?: boolean;
    nonEmpty?: boolean;
  };
}

export type TypedParameterDefinition<Type extends keyof ParameterTypes> = TypedExtensions[Type] & {
  label?: ModuleFunctor<string>;
  type: Type;
  transferGroup?: string;
  defaultValue?: ModuleFunctor<ParameterTypes[Type] | undefined>;
  sticky?: boolean;
  required?: ModuleFunctor<boolean>;
  description?: ModuleFunctor<string>;
  placeholder?: string;
  defined?: ModuleFunctor<boolean>;
  visible?: ModuleFunctor<boolean>;

  /**
   * Validate the value of this parameter.
   *
   * @param value - Current parameter value or undefined if no value has been set.
   * @returns - An error message if the value is invalid, or undefined if the value is valid.
   */
  validate?: (value: ParameterTypes[Type] | undefined) => string | undefined;
};

export type ParameterDefinition =
  | TypedParameterDefinition<'string'>
  | TypedParameterDefinition<'boolean'>
  | TypedParameterDefinition<'number'>
  | TypedParameterDefinition<'option'>
  | TypedParameterDefinition<'options'>
  | TypedParameterDefinition<'expression'>
  | TypedParameterDefinition<'expressions'>
  | TypedParameterDefinition<'measure'>
  | TypedParameterDefinition<'measures'>;

/**
 * Returns the label for a plugin option.
 *
 * @param optionValue the option value to get the label for
 * @param parameterDefinition the parameter definition that the option belongs to
 * @returns the label for the option
 */
export function getModuleOptionLabel(
  optionValue: OptionValue,
  parameterDefinition: ParameterDefinition,
): string {
  const { optionLabels = {} } = parameterDefinition as any;

  return (
    optionLabels[optionValue] ??
    (typeof optionValue === 'string'
      ? optionValue
      : typeof optionValue !== 'undefined'
      ? String(optionValue)
      : 'Malformed option')
  );
}

export type ParameterValues = Readonly<Record<string, any>>;
export type Parameters = Readonly<Record<string, ParameterDefinition>>;

// -----------------------------------------------------

export function inflateParameterValues(
  parameterValues: ParameterValues | undefined,
  parameters: Parameters,
): ParameterValues {
  return mapRecord(parameters, (parameter, parameterName) =>
    inflateParameterValue(parameterValues?.[parameterName], parameter),
  );
}

function inflateParameterValue(value: unknown, parameter: ParameterDefinition): any {
  if (typeof value === 'undefined') return;
  switch (parameter.type) {
    case 'boolean':
      return Boolean(value);

    case 'number': {
      let v = Number(value);
      if (isNaN(v)) v = 0;
      if (typeof parameter.min === 'number') {
        v = Math.max(v, parameter.min);
      }
      if (typeof parameter.max === 'number') {
        v = Math.min(v, parameter.max);
      }
      return v;
    }

    case 'option':
      if (!parameter.options || !parameter.options.includes(value as OptionValue)) return;
      return value as OptionValue;

    case 'options': {
      if (!Array.isArray(value)) return [];
      const options = parameter.options || [];
      return value.filter(v => options.includes(v));
    }

    case 'expression':
      return ExpressionMeta.inflate(value);

    case 'measure':
      return Measure.inflate(value);

    case 'expressions':
      return ExpressionMeta.inflateArray(value);

    case 'measures':
      return Measure.inflateArray(value);

    default:
      return value as any;
  }
}

// -----------------------------------------------------

export function removeUndefinedParameterValues(
  parameterValues: ParameterValues,
  parameters: Parameters,
  querySource: QuerySource | undefined,
): ParameterValues {
  const keysToRemove = Object.keys(parameterValues).filter(key => {
    const parameter = parameters[key];
    if (!parameter) return true;
    return (
      typeof parameter.defined !== 'undefined' &&
      !evaluateFunctor(parameter.defined, parameterValues, querySource)
    );
  });
  return keysToRemove.length ? deleteKeys(parameterValues, keysToRemove) : parameterValues;
}

// -----------------------------------------------------

function defaultForType(parameterType: keyof ParameterTypes): any {
  switch (parameterType) {
    case 'boolean':
      return false;

    case 'expressions':
    case 'measures':
      return [];

    default:
      return;
  }
}

export function effectiveParameterDefault(
  parameter: ParameterDefinition,
  parameterValues: ParameterValues,
  querySource: QuerySource | undefined,
): any {
  if (
    typeof parameter.defined !== 'undefined' &&
    evaluateFunctor(parameter.defined, parameterValues, querySource) === false
  ) {
    return;
  }
  return (
    evaluateFunctor(parameter.defaultValue, parameterValues, querySource) ??
    defaultForType(parameter.type)
  );
}

// -----------------------------------------------------

export function renameColumnsInParameterValues(
  parameterValues: ParameterValues,
  parameters: Parameters,
  rename: Map<string, string>,
): ParameterValues {
  return mapRecordIfChanged(parameterValues, (parameterValue, k) =>
    renameColumnsInParameterValue(parameterValue, parameters[k], rename),
  );
}

function renameColumnsInParameterValue(
  parameterValue: any,
  parameter: ParameterDefinition,
  rename: Map<string, string>,
): any {
  if (typeof parameterValue !== 'undefined') {
    switch (parameter.type) {
      case 'expression':
        return (parameterValue as ExpressionMeta).applyRename(rename);

      case 'measure':
        return (parameterValue as Measure).applyRename(rename);

      case 'expressions':
      case 'measures':

      default:
        break;
    }
  }
  return parameterValue;
}
