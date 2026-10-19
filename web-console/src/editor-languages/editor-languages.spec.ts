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

import type { CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import { CompletionContext } from '@codemirror/autocomplete';
import type { Language } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { TreeFragment } from '@lezer/common';
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight';

import { codeEditorHighlightStyle } from '../components/code-editor/code-editor-theme';

import { dsql, getDsqlLanguage } from './dsql';
import { PIPE_OPERATOR_COMPLETIONS } from './dsql-pipe-syntax';
import { editorTags } from './editor-tags';
import { hjson, hjsonLanguage } from './hjson';

const dsqlLanguage = getDsqlLanguage();

function tokenize(language: Language, text: string): [type: string, value: string][] {
  const tokens: [string, string][] = [];
  language.parser.parse(text).iterate({
    enter(node) {
      if (node.type.isTop) return;
      tokens.push([node.name, text.slice(node.from, node.to)]);
    },
  });
  return tokens;
}

function tokenOf(language: Language, text: string, value: string): string | undefined {
  return tokenize(language, text).find(t => t[1] === value)?.[0];
}

describe('editor languages', () => {
  it('highlights DruidSQL', () => {
    const sql = `--:ISSUE: bad
SELECT COUNT(*), "col", CAST(x AS VARCHAR), TRUE FROM t WHERE y <> 'lit' AND z = 3.5 -- comment
/* multi
line */ SELECT`;
    expect(tokenOf(dsqlLanguage, sql, '--:ISSUE: bad')).toEqual('Issue');
    expect(tokenOf(dsqlLanguage, sql, 'SELECT')).toEqual('Keyword');
    expect(tokenOf(dsqlLanguage, sql, 'COUNT')).toEqual('FunctionName');
    expect(tokenOf(dsqlLanguage, sql, '"col"')).toEqual('QuotedIdentifier');
    expect(tokenOf(dsqlLanguage, sql, 'VARCHAR')).toEqual('TypeName');
    expect(tokenOf(dsqlLanguage, sql, 'TRUE')).toEqual('Constant');
    expect(tokenOf(dsqlLanguage, sql, "'lit'")).toEqual('String');
    expect(tokenOf(dsqlLanguage, sql, '3.5')).toEqual('Number');
    expect(tokenOf(dsqlLanguage, sql, '<')).toEqual('Operator');
    expect(tokenOf(dsqlLanguage, sql, '-- comment')).toEqual('LineComment');
    expect(tokenOf(dsqlLanguage, sql, '/* multi\nline */')).toEqual('BlockComment');
    expect(tokenOf(dsqlLanguage, sql, 'x')).toEqual('Identifier');
    expect(tokenOf(dsqlLanguage, sql, '(x AS VARCHAR)')).toEqual('Parens');
  });

  it('highlights NULLS FIRST / NULLS LAST as keywords', () => {
    expect(tokenize(dsqlLanguage, 'ORDER BY 2 DESC NULLS LAST, 1 NULLS FIRST')).toEqual([
      ['Keyword', 'ORDER'],
      ['Keyword', 'BY'],
      ['Number', '2'],
      ['Keyword', 'DESC'],
      ['Keyword', 'NULLS'],
      ['Keyword', 'LAST'],
      ['Punctuation', ','],
      ['Number', '1'],
      ['Keyword', 'NULLS'],
      ['Keyword', 'FIRST'],
    ]);
  });

  it('highlights unterminated DruidSQL tokens', () => {
    expect(tokenOf(dsqlLanguage, 'SELECT /* not closed', '/* not closed')).toEqual('BlockComment');
    // An unterminated literal or quoted identifier lasts until the end of the line
    expect(tokenize(dsqlLanguage, `SELECT 'x AND y\nFROM "t`)).toEqual([
      ['Keyword', 'SELECT'],
      ['String', "'x AND y"],
      ['Keyword', 'FROM'],
      ['QuotedIdentifier', '"t'],
    ]);
    // A sign is an operator
    expect(tokenize(dsqlLanguage, 'SELECT a-1')).toEqual([
      ['Keyword', 'SELECT'],
      ['Identifier', 'a'],
      ['Operator', '-'],
      ['Number', '1'],
    ]);
  });

  it('highlights the available functions', () => {
    const availableSqlFunctions = new Map([['MY_FN', { args: ['x'], isAggregate: false }]]);
    expect(tokenOf(dsqlLanguage, 'SELECT MY_FN(x)', 'MY_FN')).toEqual('Identifier');
    expect(tokenOf(getDsqlLanguage(availableSqlFunctions), 'SELECT MY_FN(x)', 'MY_FN')).toEqual(
      'FunctionName',
    );
    expect(tokenOf(getDsqlLanguage(availableSqlFunctions), 'SELECT my_fn(x)', 'my_fn')).toEqual(
      'FunctionName',
    );
    expect(getDsqlLanguage(availableSqlFunctions)).toBe(getDsqlLanguage(availableSqlFunctions));
  });

  describe('pipe syntax', () => {
    // The words and what they are
    function words(text: string): string[] {
      return tokenize(dsqlLanguage, text)
        .filter(([type, value]) => /^\w+$/.test(value) && type !== 'Number')
        .map(([type, value]) => `${type === 'Keyword' ? 'K' : type[0]}:${value}`);
    }

    it('highlights the pipe symbol', () => {
      expect(tokenize(dsqlLanguage, 'FROM t|>WHERE a | b')).toEqual([
        ['Keyword', 'FROM'],
        ['Identifier', 't'],
        ['PipeOperator', '|>WHERE a | b'],
        ['PipeSymbol', '|>'],
        ['Keyword', 'WHERE'],
        ['Identifier', 'a'],
        ['Operator', '|'],
        ['Identifier', 'b'],
      ]);

      // In a color of its own, and like an operator elsewhere
      const sql = 'FROM t |> WHERE a';
      const classes = new Map<string, string>();
      highlightTree(dsqlLanguage.parser.parse(sql), codeEditorHighlightStyle, (from, to, cls) => {
        classes.set(sql.slice(from, to), cls);
      });
      expect(classes.get('|>')).toEqual(codeEditorHighlightStyle.style([editorTags.pipeSymbol]));
      expect(classes.get('|>')).not.toEqual(codeEditorHighlightStyle.style([tags.number]));

      const operatorClasses = new Map<string, string>();
      const highlighter = tagHighlighter([{ tag: tags.operator, class: 'operator' }]);
      highlightTree(dsqlLanguage.parser.parse(sql), highlighter, (from, to, cls) => {
        operatorClasses.set(sql.slice(from, to), cls);
      });
      expect(operatorClasses.get('|>')).toEqual('operator');
    });

    it('ends a pipe operator at the next pipe symbol, semicolon or closing parenthesis', () => {
      const pipeOperators = (text: string) =>
        tokenize(dsqlLanguage, text)
          .filter(([type]) => type === 'PipeOperator')
          .map(([, value]) => value);

      expect(pipeOperators('FROM t |> WHERE a |> SELECT b; SELECT 1')).toEqual([
        '|> WHERE a',
        '|> SELECT b',
      ]);
      expect(pipeOperators('SELECT * FROM (FROM t |> WHERE a) AS x |> SELECT (b)')).toEqual([
        '|> WHERE a',
        '|> SELECT (b)',
      ]);
    });

    it('leaves the words of pipe syntax alone outside of pipe operators', () => {
      expect(words('SELECT name, drop, aggregate, data, options FROM t; SELECT pattern')).toEqual([
        'K:SELECT',
        'I:name',
        'I:drop',
        'I:aggregate',
        'I:data',
        'I:options',
        'K:FROM',
        'I:t',
        'K:SELECT',
        'I:pattern',
      ]);
    });

    it('highlights the words of pipe syntax only in their place', () => {
      expect(
        words('FROM t |> AGGREGATE COUNT(*) AS drop |> DROP drop, name |> WHERE name = 1'),
      ).toEqual([
        'K:FROM',
        'I:t',
        'K:AGGREGATE',
        'F:COUNT',
        'K:AS',
        'I:drop',
        'K:DROP',
        'I:drop',
        'I:name',
        'K:WHERE',
        'I:name',
      ]);

      // NAME is a keyword after BY, but not in the query in parentheses
      expect(
        words('FROM t |> UNION ALL BY NAME (SELECT name FROM u GROUP BY name), (TABLE name)'),
      ).toEqual([
        'K:FROM',
        'I:t',
        'K:UNION',
        'K:ALL',
        'K:BY',
        'K:NAME',
        'K:SELECT',
        'I:name',
        'K:FROM',
        'I:u',
        'K:GROUP',
        'K:BY',
        'I:name',
        'F:TABLE', // As everywhere but in CREATE TABLE
        'I:name',
      ]);

      expect(
        words(
          'FROM t |> INTERSECT DISTINCT STRICT CORRESPONDING BY (strict) (SELECT strict FROM u)',
        ),
      ).toEqual([
        'K:FROM',
        'I:t',
        'K:INTERSECT',
        'K:DISTINCT',
        'K:STRICT',
        'K:CORRESPONDING',
        'K:BY',
        'I:strict',
        'K:SELECT',
        'I:strict',
        'K:FROM',
        'I:u',
      ]);

      // TABLE is otherwise a function
      expect(
        words('FROM t |> CREATE OR REPLACE TEMP TABLE IF NOT EXISTS options OPTIONS (x = 1)'),
      ).toEqual([
        'K:FROM',
        'I:t',
        'K:CREATE',
        'K:OR',
        'K:REPLACE',
        'K:TEMP',
        'K:TABLE',
        'K:IF',
        'K:NOT',
        'K:EXISTS',
        'I:options',
        'K:OPTIONS',
        'I:x',
      ]);
    });

    it('highlights the keywords in the parentheses of the pipe operators that have them', () => {
      expect(words('FROM t |> TABLESAMPLE SYSTEM (1 PERCENT) |> WHERE x IN (percent)')).toEqual([
        'K:FROM',
        'I:t',
        'K:TABLESAMPLE',
        'K:SYSTEM',
        'K:PERCENT',
        'K:WHERE',
        'I:x',
        'K:IN',
        'I:percent',
      ]);

      expect(
        words(`FROM t
|> MATCH_RECOGNIZE (
  ORDER BY ts
  MEASURES COUNT(*) AS n
  AFTER MATCH SKIP PAST LAST ROW
  PATTERN (up down)
  DEFINE up AS price > 1
)`),
      ).toEqual([
        'K:FROM',
        'I:t',
        'K:MATCH_RECOGNIZE',
        'K:ORDER',
        'K:BY',
        'I:ts',
        'K:MEASURES',
        'F:COUNT',
        'K:AS',
        'I:n',
        'K:AFTER',
        'K:MATCH',
        'K:SKIP',
        'K:PAST',
        'K:LAST',
        'K:ROW',
        'K:PATTERN',
        'I:up',
        'I:down',
        'K:DEFINE',
        'I:up',
        'K:AS',
        'I:price',
      ]);
    });

    it('highlights subpipelines', () => {
      expect(words('FROM t |> IF a THEN (|> DROP b) ELSEIF c THEN () ELSE ( |> WHERE d )')).toEqual(
        [
          'K:FROM',
          'I:t',
          'K:IF',
          'I:a',
          'K:THEN',
          'K:DROP',
          'I:b',
          'K:ELSEIF',
          'I:c',
          'K:THEN',
          'K:ELSE',
          'K:WHERE',
          'I:d',
        ],
      );
    });

    it('highlights the names of all the pipe operators', () => {
      for (const { label } of PIPE_OPERATOR_COMPLETIONS) {
        const sql = `FROM t |> ${label.toLowerCase()} x`;
        expect([sql, words(sql)]).toEqual([
          sql,
          [
            'K:FROM',
            'I:t',
            ...label
              .toLowerCase()
              .split(' ')
              .map(w => `K:${w}`),
            'I:x',
          ],
        ]);
      }
    });

    it('highlights the same after an edit as after parsing from scratch', () => {
      const text = `FROM t
|> UNPIVOT (v FOR n IN (a, b)) include
|> UNION ALL BY NAME (SELECT name FROM u)
|> AGGREGATE COUNT(*) AS c GROUP AND ORDER BY name DESC
|> CREATE TABLE IF NOT EXISTS options (a INT) OPTIONS (x = 1)`;
      // Small buffers so that the nodes of a short text are reused
      const parser = dsqlLanguage.parser.configure({ bufferLength: 2 });
      const tree = parser.parse(text);
      for (let at = 0; at <= text.length; at++) {
        for (const insert of [' ', 'x', '(', ')', '|>', ';']) {
          const newText = text.slice(0, at) + insert + text.slice(at);
          const fragments = TreeFragment.applyChanges(TreeFragment.addTree(tree), [
            { fromA: at, toA: at, fromB: at, toB: at + insert.length },
          ]);
          expect([newText, parser.parse(newText, fragments).toString()]).toEqual([
            newText,
            parser.parse(newText).toString(),
          ]);
        }
      }
    });
  });

  it('highlights Hjson', () => {
    const hjson = `{
  # comment
  key: "value\\n"
  n: -1.5e3
  flag: true
  list: [1, "two"]
  unquoted: some text
  multi: '''
    lines
  '''
}`;
    expect(tokenOf(hjsonLanguage, hjson, '# comment')).toEqual('LineComment');
    expect(tokenOf(hjsonLanguage, hjson, 'key')).toEqual('PropertyName');
    expect(tokenOf(hjsonLanguage, hjson, '"value\\n"')).toEqual('String');
    expect(tokenOf(hjsonLanguage, hjson, '\\n')).toEqual('Escape');
    expect(tokenOf(hjsonLanguage, hjson, '-1.5e3')).toEqual('Number');
    expect(tokenOf(hjsonLanguage, hjson, 'true')).toEqual('True');
    expect(tokenOf(hjsonLanguage, hjson, '[1, "two"]')).toEqual('Array');
    expect(tokenOf(hjsonLanguage, hjson, '"two"')).toEqual('String');
    expect(tokenOf(hjsonLanguage, hjson, 'some text')).toEqual('QuotelessString');
    expect(tokenOf(hjsonLanguage, hjson, "'''\n    lines\n  '''")).toEqual('MultilineString');
  });

  it('ends an unterminated Hjson string at the end of the line', () => {
    const hjson = '{\n  "a": "not closed\n  "b": 1\n}';
    expect(tokenOf(hjsonLanguage, hjson, '"not closed\n')).toEqual('String');
    expect(tokenOf(hjsonLanguage, hjson, '"b"')).toEqual('PropertyName');
    expect(tokenOf(hjsonLanguage, hjson, '1')).toEqual('Number');
  });

  it('highlights JSON', () => {
    const json = `{"auditTime": "2023-07-31T18:15:19.302Z", "url": "http://x:80", "n": 1, "z": null}`;
    expect(tokenOf(hjsonLanguage, json, '"auditTime"')).toEqual('PropertyName');
    expect(tokenOf(hjsonLanguage, json, '"2023-07-31T18:15:19.302Z"')).toEqual('String');
    expect(tokenOf(hjsonLanguage, json, '"http://x:80"')).toEqual('String');
    expect(tokenOf(hjsonLanguage, json, '1')).toEqual('Number');
    expect(tokenOf(hjsonLanguage, json, 'null')).toEqual('Null');
    expect(tokenize(hjsonLanguage, json).some(([type]) => type === '⚠')).toBe(false);
  });

  it('highlights quoteless Hjson values as a whole', () => {
    const hjson = `ip: 127.0.0.1
time: 2023-07-31T18:15:19.302Z
host: localhost:8091
url: http://example.com
count: 3
count2: 3 apples
flag: true, other: 1
page: Talk:Main`;
    for (const value of [
      '127.0.0.1',
      '2023-07-31T18:15:19.302Z',
      'localhost:8091',
      'http://example.com',
      '3 apples',
      'Talk:Main',
    ]) {
      expect(tokenOf(hjsonLanguage, hjson, value)).toEqual('QuotelessString');
    }
    expect(tokenOf(hjsonLanguage, hjson, '3')).toEqual('Number');
    expect(tokenOf(hjsonLanguage, hjson, 'true')).toEqual('True');
  });

  it('highlights Hjson without the root braces', () => {
    const hjson = `queryType: scan
dataSource: wikipedia`;
    expect(tokenOf(hjsonLanguage, hjson, 'queryType')).toEqual('PropertyName');
    expect(tokenOf(hjsonLanguage, hjson, 'dataSource')).toEqual('PropertyName');
    expect(tokenOf(hjsonLanguage, hjson, 'wikipedia')).toEqual('QuotelessString');
    expect(tokenOf(hjsonLanguage, 'just text', 'just text')).toEqual('QuotelessString');
  });

  it('styles Hjson keys like keywords and leaves the literals plain', () => {
    const json = '{"key": null, "flag": true, "s": "x"}';
    const classes = new Map<string, string>();
    highlightTree(hjsonLanguage.parser.parse(json), codeEditorHighlightStyle, (from, to, cls) => {
      classes.set(json.slice(from, to), cls);
    });
    expect(classes.get('"key"')).toEqual(codeEditorHighlightStyle.style([tags.keyword]));
    expect(classes.get('"x"')).toEqual(codeEditorHighlightStyle.style([tags.string]));
    expect(classes.has('null')).toBe(false);
    expect(classes.has('true')).toBe(false);
  });

  it('highlights a key that is being typed', () => {
    expect(tokenize(hjsonLanguage, '{\n  "a": 1\n  que')).toContainEqual(['PropertyName', 'que']);
  });

  describe('completions', () => {
    // Completes at the end of the text (marked with a |) the way the editor would
    function complete(
      extension: Extension,
      textWithCursor: string,
      readOnly = false,
    ): string[] | undefined {
      const pos = textWithCursor.search(/\|(?!>)/);
      const state = EditorState.create({
        doc: textWithCursor.slice(0, pos) + textWithCursor.slice(pos + 1),
        extensions: [extension, EditorState.readOnly.of(readOnly)],
      });
      const sources = state.languageDataAt<CompletionSource>('autocomplete', pos);
      if (!sources.length) return;
      const result = sources[0](
        new CompletionContext(state, pos, false),
      ) as CompletionResult | null;
      return result?.options.map(option => option.label);
    }

    it('comes with dsql', () => {
      expect(complete(dsql({ columns: ['my_column'] }), 'SELECT my_c|')).toContain('"my_column"');
      expect(complete(dsql(), 'SELECT COU|')).toContain('COUNT');
    });

    it('comes with hjson when given jsonCompletions', () => {
      const jsonCompletions = [
        { path: '$', isObject: true, completions: [{ value: 'queryType' }] },
      ];
      expect(complete(hjson({ jsonCompletions }), '{\n  que|')).toEqual(['queryType']);
      expect(hjson({ jsonCompletions })).toBe(hjson({ jsonCompletions }));
      expect(complete(hjson(), '{\n  que|')).toBeUndefined();
    });

    it('starts right after the pipe symbol and a space with dsql', () => {
      expect(complete(dsql(), 'FROM t |> |')).toContain('AGGREGATE');
      expect(complete(dsql(), 'FROM t\n|>\n|')).toContain('WHERE');
      expect(complete(dsql(), 'FROM t |>|')).toBeUndefined();
      expect(complete(dsql(), 'FROM t |> WHERE |')).toBeUndefined();
      expect(complete(dsql(), "SELECT '|> |")).toBeUndefined();
    });

    it('is off in read only editors', () => {
      expect(complete(dsql(), 'SELECT COU|', true)).toBeUndefined();
    });
  });
});
