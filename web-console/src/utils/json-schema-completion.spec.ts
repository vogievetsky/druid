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

import { getSchemaCompletionsForPath } from './json-schema-completion';

describe('json-schema-completion', () => {
  describe('getSchemaCompletionsForPath', () => {
    const mockSchema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The name property',
        },
        type: {
          type: 'string',
          description: 'The type property',
          enum: ['A', 'B'],
        },
        config: {
          type: 'object',
          description: 'Configuration object',
          properties: {
            enabled: {
              type: 'boolean',
              description: 'Enable the feature',
            },
            timeout: {
              type: 'integer',
              description: 'Timeout in milliseconds',
            },
          },
        },
        items: {
          type: 'array',
          description: 'Array of items',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Item ID',
              },
              value: {
                type: 'number',
                description: 'Item value',
              },
            },
          },
        },
      },
      allOf: [
        {
          if: {
            properties: {
              type: { const: 'A' },
            },
          },
          then: {
            properties: {
              specialPropertyForA: {
                type: 'string',
                description: 'Only for type A',
              },
            },
          },
        },
      ],
    };

    const nestedSchema = {
      type: 'object',
      properties: {
        level1: {
          type: 'object',
          properties: {
            level2: {
              type: 'object',
              properties: {
                level3: {
                  type: 'object',
                  properties: {
                    deepProperty: {
                      type: 'string',
                      description: 'Deep nested property',
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    it('should return root level object completions for keys', () => {
      const completions = getSchemaCompletionsForPath(mockSchema, [], true, {});
      expect(completions).toEqual([
        { value: 'name', documentation: 'The name property' },
        { value: 'type', documentation: 'The type property' },
        { value: 'config', documentation: 'Configuration object' },
        { value: 'items', documentation: 'Array of items' },
      ]);
    });

    it('should return enum completions for type property', () => {
      const completions = getSchemaCompletionsForPath(mockSchema, ['type'], false, {});
      expect(completions).toEqual([
        { value: 'A', documentation: 'The type property' },
        { value: 'B', documentation: 'The type property' },
      ]);
    });

    it('should return nested object completions', () => {
      const completions = getSchemaCompletionsForPath(mockSchema, ['config'], true, {});
      expect(completions).toEqual([
        { value: 'enabled', documentation: 'Enable the feature' },
        { value: 'timeout', documentation: 'Timeout in milliseconds' },
      ]);
    });

    it('should handle array item properties', () => {
      const completions = getSchemaCompletionsForPath(mockSchema, ['items', '0'], true, {});
      expect(completions).toEqual([
        { value: 'id', documentation: 'Item ID' },
        { value: 'value', documentation: 'Item value' },
      ]);
    });

    it('should handle multiple array indices in path', () => {
      const completions = getSchemaCompletionsForPath(mockSchema, ['items', '3'], true, {});
      expect(completions).toEqual([
        { value: 'id', documentation: 'Item ID' },
        { value: 'value', documentation: 'Item value' },
      ]);
    });

    it('should apply conditional completions when condition is met', () => {
      const completions = getSchemaCompletionsForPath(mockSchema, [], true, { type: 'A' });
      expect(completions).toContainEqual({
        value: 'specialPropertyForA',
        documentation: 'Only for type A',
      });
    });

    it('should not apply conditional completions when condition is not met', () => {
      const completions = getSchemaCompletionsForPath(mockSchema, [], true, { type: 'B' });
      expect(completions).not.toContainEqual({
        value: 'specialPropertyForA',
        documentation: 'Only for type A',
      });
    });

    it('should handle deep nested paths', () => {
      const completions = getSchemaCompletionsForPath(
        nestedSchema,
        ['level1', 'level2', 'level3'],
        true,
        {},
      );
      expect(completions).toEqual([
        { value: 'deepProperty', documentation: 'Deep nested property' },
      ]);
    });

    it('should return empty array when no schema matches', () => {
      const completions = getSchemaCompletionsForPath(
        mockSchema,
        ['nonexistent', 'path'],
        true,
        {},
      );
      expect(completions).toEqual([]);
    });

    it('should distinguish between key and value completions', () => {
      // Looking for keys (isKey: true)
      const keyCompletions = getSchemaCompletionsForPath(mockSchema, [], true, {});
      expect(keyCompletions.map(c => c.value)).toContain('name');

      // Looking for values (isKey: false)
      const valueCompletions = getSchemaCompletionsForPath(mockSchema, [], false, {});
      expect(valueCompletions).toEqual([]);
    });

    it('should handle empty path array', () => {
      const completions = getSchemaCompletionsForPath(mockSchema, [], true, {});
      expect(completions).toEqual([
        { value: 'name', documentation: 'The name property' },
        { value: 'type', documentation: 'The type property' },
        { value: 'config', documentation: 'Configuration object' },
        { value: 'items', documentation: 'Array of items' },
      ]);
    });

    it('should handle complex array paths', () => {
      const complexSchema = {
        type: 'object',
        properties: {
          matrix: {
            type: 'array',
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  cell: {
                    type: 'string',
                    description: 'Cell value',
                  },
                },
              },
            },
          },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      value: {
                        type: 'string',
                        enum: ['itemValue'],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      // Test matrix path
      const matrixCompletions = getSchemaCompletionsForPath(
        complexSchema,
        ['matrix', '0', '1'],
        true,
        {},
      );
      expect(matrixCompletions).toEqual([{ value: 'cell', documentation: 'Cell value' }]);

      // Test nested array path for enum values
      const nestedCompletions = getSchemaCompletionsForPath(
        complexSchema,
        ['data', '2', 'items', '5', 'value'],
        false,
        {},
      );
      expect(nestedCompletions).toEqual([{ value: 'itemValue', documentation: 'Enum value' }]);
    });

    it('should handle oneOf schemas', () => {
      const oneOfSchema = {
        type: 'object',
        properties: {
          dataSource: {
            oneOf: [
              {
                type: 'string',
                description: 'Simple table name',
              },
              {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['table', 'lookup'],
                  },
                  name: {
                    type: 'string',
                  },
                },
              },
            ],
          },
        },
      };

      // When dataSource is a string
      const stringCompletions = getSchemaCompletionsForPath(oneOfSchema, ['dataSource'], false, {
        dataSource: 'myTable',
      });
      expect(stringCompletions).toEqual([]);

      // When dataSource is an object
      const objectCompletions = getSchemaCompletionsForPath(oneOfSchema, ['dataSource'], true, {
        dataSource: {},
      });
      expect(objectCompletions).toContainEqual({ value: 'type', documentation: undefined });
      expect(objectCompletions).toContainEqual({ value: 'name', documentation: undefined });
    });

    it('should handle anyOf schemas', () => {
      const anyOfSchema = {
        type: 'object',
        properties: {
          value: {
            anyOf: [
              {
                type: 'string',
                enum: ['foo', 'bar'],
              },
              {
                type: 'number',
                minimum: 0,
                maximum: 100,
              },
            ],
          },
        },
      };

      const completions = getSchemaCompletionsForPath(anyOfSchema, ['value'], false, {});
      expect(completions).toContainEqual({ value: 'foo', documentation: 'Enum value' });
      expect(completions).toContainEqual({ value: 'bar', documentation: 'Enum value' });
    });

    it('should handle $ref references', () => {
      const schemaWithRef = {
        type: 'object',
        properties: {
          filter: {
            $ref: '#/definitions/filter',
          },
        },
        definitions: {
          filter: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['selector', 'regex'],
              },
              dimension: {
                type: 'string',
                description: 'The dimension to filter',
              },
            },
          },
        },
      };

      const completions = getSchemaCompletionsForPath(schemaWithRef, ['filter'], true, {});
      expect(completions).toContainEqual({ value: 'type', documentation: undefined });
      expect(completions).toContainEqual({
        value: 'dimension',
        documentation: 'The dimension to filter',
      });
    });

    it('should handle additionalProperties', () => {
      const schemaWithAdditional = {
        type: 'object',
        properties: {
          config: {
            type: 'object',
            properties: {
              timeout: {
                type: 'number',
              },
            },
            additionalProperties: {
              type: 'string',
              description: 'Additional config value',
            },
          },
        },
      };

      const completions = getSchemaCompletionsForPath(schemaWithAdditional, ['config'], true, {});
      expect(completions).toContainEqual({ value: 'timeout', documentation: undefined });
      // Should also suggest that additional properties are allowed
      expect(completions).toContainEqual({
        value: '<any string>',
        documentation: 'Additional config value',
      });
    });

    it('should handle patternProperties', () => {
      const schemaWithPattern = {
        type: 'object',
        properties: {
          headers: {
            type: 'object',
            patternProperties: {
              '^X-': {
                type: 'string',
                description: 'Custom header',
              },
            },
          },
        },
      };

      const completions = getSchemaCompletionsForPath(schemaWithPattern, ['headers'], true, {});
      expect(completions).toContainEqual({
        value: 'X-<custom>',
        documentation: 'Custom header',
      });
    });

    it('should handle const values', () => {
      const schemaWithConst = {
        type: 'object',
        properties: {
          version: {
            const: '1.0.0',
            description: 'API version',
          },
        },
      };

      const completions = getSchemaCompletionsForPath(schemaWithConst, ['version'], false, {});
      expect(completions).toEqual([{ value: '1.0.0', documentation: 'API version' }]);
    });

    it('should handle boolean type completions', () => {
      const booleanSchema = {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean',
            description: 'Enable feature',
          },
        },
      };

      const completions = getSchemaCompletionsForPath(booleanSchema, ['enabled'], false, {});
      expect(completions).toEqual([
        { value: 'true', documentation: 'Enable feature' },
        { value: 'false', documentation: 'Enable feature' },
      ]);
    });

    it('should handle null type completions', () => {
      const nullSchema = {
        type: 'object',
        properties: {
          optional: {
            type: ['string', 'null'],
            description: 'Optional value',
          },
        },
      };

      const completions = getSchemaCompletionsForPath(nullSchema, ['optional'], false, {});
      expect(completions).toContainEqual({ value: 'null', documentation: 'Optional value' });
    });

    it('should combine allOf schemas', () => {
      const allOfSchema = {
        allOf: [
          {
            type: 'object',
            properties: {
              prop1: { type: 'string' },
            },
          },
          {
            type: 'object',
            properties: {
              prop2: { type: 'number' },
            },
          },
        ],
      } as any;

      const completions = getSchemaCompletionsForPath(allOfSchema, [], true, {});
      expect(completions).toContainEqual({ value: 'prop1', documentation: undefined });
      expect(completions).toContainEqual({ value: 'prop2', documentation: undefined });
    });

    it('should handle required properties', () => {
      const schemaWithRequired = {
        type: 'object',
        properties: {
          required1: { type: 'string' },
          required2: { type: 'string' },
          optional: { type: 'string' },
        },
        required: ['required1', 'required2'],
      };

      const completions = getSchemaCompletionsForPath(schemaWithRequired, [], true, {});
      // All properties should be suggested, but we could mark required ones differently
      expect(completions).toHaveLength(3);
      // In a real implementation, required properties might have different documentation
    });

    it('should handle examples in schema', () => {
      const schemaWithExamples = {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            examples: ['json', 'xml', 'csv'],
            description: 'Output format',
          },
        },
      };

      const completions = getSchemaCompletionsForPath(schemaWithExamples, ['format'], false, {});
      expect(completions).toContainEqual({
        value: 'json',
        documentation: 'Output format (example)',
      });
      expect(completions).toContainEqual({
        value: 'xml',
        documentation: 'Output format (example)',
      });
      expect(completions).toContainEqual({
        value: 'csv',
        documentation: 'Output format (example)',
      });
    });

    it('should handle default values', () => {
      const schemaWithDefaults = {
        type: 'object',
        properties: {
          timeout: {
            type: 'integer',
            default: 30000,
            description: 'Timeout in ms',
          },
        },
      };

      const completions = getSchemaCompletionsForPath(schemaWithDefaults, ['timeout'], false, {});
      expect(completions).toContainEqual({
        value: '30000',
        documentation: 'Timeout in ms (default)',
      });
    });

    it('should handle array with enum items', () => {
      const arrayEnumSchema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['important', 'urgent', 'low-priority'],
            },
          },
        },
      };

      const completions = getSchemaCompletionsForPath(arrayEnumSchema, ['tags', '0'], false, {});
      expect(completions).toContainEqual({ value: 'important', documentation: 'Enum value' });
      expect(completions).toContainEqual({ value: 'urgent', documentation: 'Enum value' });
      expect(completions).toContainEqual({ value: 'low-priority', documentation: 'Enum value' });
    });

    it('should handle tuple arrays', () => {
      const tupleSchema = {
        type: 'object',
        properties: {
          coordinate: {
            type: 'array',
            items: [
              { type: 'number', description: 'X coordinate' },
              { type: 'number', description: 'Y coordinate' },
              { type: 'string', enum: ['2D', '3D'], description: 'Dimension type' },
            ],
          },
        },
      };

      // First element
      let completions = getSchemaCompletionsForPath(tupleSchema, ['coordinate', '0'], false, {});
      expect(completions).toEqual([]);

      // Third element (with enum)
      completions = getSchemaCompletionsForPath(tupleSchema, ['coordinate', '2'], false, {});
      expect(completions).toContainEqual({ value: '2D', documentation: 'Dimension type' });
      expect(completions).toContainEqual({ value: '3D', documentation: 'Dimension type' });
    });
  });
});
