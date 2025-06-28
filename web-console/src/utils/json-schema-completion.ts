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

import type { JsonCompletionItem } from './json-completion';

export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema | JsonSchema[];
  enum?: any[];
  const?: any;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  if?: JsonSchema;
  then?: JsonSchema;
  else?: JsonSchema;
  $ref?: string;
  definitions?: Record<string, JsonSchema>;
  description?: string;
  examples?: any[];
  default?: any;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  patternProperties?: Record<string, JsonSchema>;
  [key: string]: any;
}

function resolveRef(schema: JsonSchema, ref: string): JsonSchema | undefined {
  const path = ref.split('/');
  if (path.shift() !== '#') return undefined;

  let current: any = schema;

  for (const segment of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[segment];
  }

  return current as JsonSchema;
}

function evaluateCondition(condition: JsonSchema, currentObject: any): boolean {
  if (!condition || typeof condition !== 'object') return true;

  if (condition.properties) {
    for (const [key, propSchema] of Object.entries(condition.properties)) {
      if (propSchema && typeof propSchema === 'object' && 'const' in propSchema) {
        if (currentObject[key] !== propSchema.const) return false;
      }
    }
  }

  return true;
}

function getSchemaAtPath(
  schema: JsonSchema,
  path: string[],
  currentObject: any,
  rootSchema: JsonSchema = schema,
): JsonSchema[] {
  if (path.length === 0) return [schema];

  const [first, ...rest] = path;
  const schemas: JsonSchema[] = [];

  // Handle $ref
  if (schema.$ref) {
    const resolved = resolveRef(rootSchema, schema.$ref);
    if (resolved) {
      schemas.push(...getSchemaAtPath(resolved, path, currentObject, rootSchema));
    }
  }

  // Handle allOf
  if (schema.allOf) {
    for (const subSchema of schema.allOf) {
      schemas.push(...getSchemaAtPath(subSchema, path, currentObject, rootSchema));
    }
  }

  // Handle if/then/else
  if (schema.if && schema.then) {
    if (evaluateCondition(schema.if, currentObject)) {
      schemas.push(...getSchemaAtPath(schema.then, path, currentObject, rootSchema));
    } else if (schema.else) {
      schemas.push(...getSchemaAtPath(schema.else, path, currentObject, rootSchema));
    }
  }

  // Handle oneOf
  if (schema.oneOf) {
    // For now, include all possibilities
    for (const subSchema of schema.oneOf) {
      schemas.push(...getSchemaAtPath(subSchema, path, currentObject, rootSchema));
    }
  }

  // Handle anyOf
  if (schema.anyOf) {
    for (const subSchema of schema.anyOf) {
      schemas.push(...getSchemaAtPath(subSchema, path, currentObject, rootSchema));
    }
  }

  // Handle properties
  if (schema.properties && schema.properties[first]) {
    schemas.push(
      ...getSchemaAtPath(schema.properties[first], rest, currentObject[first] || {}, rootSchema),
    );
  }

  // Handle array items
  if (schema.items && /^\d+$/.test(first)) {
    const index = parseInt(first, 10);
    if (Array.isArray(schema.items)) {
      // Tuple
      if (index < schema.items.length) {
        schemas.push(
          ...getSchemaAtPath(schema.items[index], rest, currentObject[index] || {}, rootSchema),
        );
      }
    } else {
      // Regular array
      schemas.push(...getSchemaAtPath(schema.items, rest, currentObject[index] || {}, rootSchema));
    }
  }

  return schemas;
}

function getCompletionsFromSchema(
  schema: JsonSchema,
  isKey: boolean,
  rootSchema: JsonSchema = schema,
): JsonCompletionItem[] {
  const completions: JsonCompletionItem[] = [];

  if (isKey) {
    // Looking for property names

    // Handle $ref
    if (schema.$ref) {
      const resolved = resolveRef(rootSchema, schema.$ref);
      if (resolved) {
        completions.push(...getCompletionsFromSchema(resolved, isKey, rootSchema));
      }
    }

    // Handle allOf
    if (schema.allOf) {
      for (const subSchema of schema.allOf) {
        completions.push(...getCompletionsFromSchema(subSchema, isKey, rootSchema));
      }
    }

    // Handle oneOf (when looking for keys, check if it's an object type)
    if (schema.oneOf) {
      for (const subSchema of schema.oneOf) {
        if (subSchema.type === 'object' || subSchema.properties) {
          completions.push(...getCompletionsFromSchema(subSchema, isKey, rootSchema));
        }
      }
    }

    // Handle properties
    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        completions.push({
          value: propName,
          documentation: propSchema.description,
        });
      }
    }

    // Handle additionalProperties
    if (
      schema.additionalProperties === true ||
      (schema.additionalProperties && typeof schema.additionalProperties === 'object')
    ) {
      const doc =
        typeof schema.additionalProperties === 'object'
          ? schema.additionalProperties.description
          : 'Additional property';
      completions.push({
        value: '<any string>',
        documentation: doc,
      });
    }

    // Handle patternProperties
    if (schema.patternProperties) {
      for (const [pattern, propSchema] of Object.entries(schema.patternProperties)) {
        // Extract a meaningful suggestion from the pattern
        let suggestion = pattern;
        if (pattern.startsWith('^') && pattern.includes('-')) {
          // e.g., "^X-" -> "X-<custom>"
          suggestion = pattern.slice(1).replace('$', '') + '<custom>';
        }
        completions.push({
          value: suggestion,
          documentation: propSchema.description,
        });
      }
    }
  } else {
    // Looking for values

    // Handle const
    if ('const' in schema) {
      completions.push({
        value: String(schema.const),
        documentation: schema.description,
      });
      return completions;
    }

    // Handle enum
    if (schema.enum) {
      for (const value of schema.enum) {
        completions.push({
          value: String(value),
          documentation: schema.description || 'Enum value',
        });
      }
      return completions;
    }

    // Handle examples
    if (schema.examples) {
      for (const example of schema.examples) {
        completions.push({
          value: String(example),
          documentation: schema.description ? `${schema.description} (example)` : 'Example value',
        });
      }
    }

    // Handle default
    if ('default' in schema) {
      completions.push({
        value: String(schema.default),
        documentation: schema.description ? `${schema.description} (default)` : 'Default value',
      });
    }

    // Handle type-specific completions
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];

    if (types.includes('boolean')) {
      completions.push(
        { value: 'true', documentation: schema.description },
        { value: 'false', documentation: schema.description },
      );
    }

    if (types.includes('null')) {
      completions.push({ value: 'null', documentation: schema.description });
    }

    // Handle anyOf/oneOf for values
    if (schema.anyOf) {
      for (const subSchema of schema.anyOf) {
        completions.push(...getCompletionsFromSchema(subSchema, isKey, rootSchema));
      }
    }

    if (schema.oneOf) {
      for (const subSchema of schema.oneOf) {
        completions.push(...getCompletionsFromSchema(subSchema, isKey, rootSchema));
      }
    }
  }

  return completions;
}

export function getSchemaCompletionsForPath(
  schema: JsonSchema,
  path: string[],
  isKey: boolean,
  currentObject: any,
): JsonCompletionItem[] {
  const schemas = getSchemaAtPath(schema, path, currentObject);
  const allCompletions: JsonCompletionItem[] = [];
  const seen = new Set<string>();

  for (const s of schemas) {
    const completions = getCompletionsFromSchema(s, isKey, schema);
    for (const completion of completions) {
      const key = JSON.stringify(completion.value);
      if (!seen.has(key)) {
        seen.add(key);
        allCompletions.push(completion);
      }
    }
  }

  // Apply conditional schemas at the current level
  if (schema.allOf) {
    for (const subSchema of schema.allOf) {
      if (subSchema.if && subSchema.then && evaluateCondition(subSchema.if, currentObject)) {
        const conditionalSchemas = getSchemaAtPath(subSchema.then, path, currentObject);
        for (const s of conditionalSchemas) {
          const completions = getCompletionsFromSchema(s, isKey, schema);
          for (const completion of completions) {
            const key = JSON.stringify(completion.value);
            if (!seen.has(key)) {
              seen.add(key);
              allCompletions.push(completion);
            }
          }
        }
      }
    }
  }

  return allCompletions;
}
