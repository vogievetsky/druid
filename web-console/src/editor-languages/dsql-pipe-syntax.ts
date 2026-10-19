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

// The pipe operators of pipe syntax as documented in https://github.com/google/googlesql/blob/master/docs/pipe-syntax.md
// (the syntax that Druid is heading for), as far as highlighting and completing their keywords goes

/**
 * The keywords of a pipe operator. Keywords are in upper case and a phrase is keywords separated by single spaces.
 */
export interface PipeOperatorSyntax {
  /** The operator names: the keywords right after the pipe symbol that say which pipe operator it is */
  names: readonly string[];

  /** What to complete right after the pipe symbol, the names by default */
  completions?: readonly string[];

  /** Shown next to the completions */
  syntax: string;
  description: string;

  /**
   * The keywords that come right after a keyword (or a phrase) of the operator, when nothing else can. The last keyword
   * of the operator name is the key for what comes right after the name.
   */
  follows?: Readonly<Record<string, readonly string[]>>;

  /** Keywords (or phrases) that can come anywhere else in the operator */
  clauses?: readonly string[];

  /** Whether the operator goes on inside its parentheses (rather than them holding a query or an expression) */
  inParentheses?: boolean;
}

function setOperation(name: string, description: string): PipeOperatorSyntax {
  const modifiers = ['BY NAME', 'STRICT CORRESPONDING', 'CORRESPONDING'];
  const follows: Record<string, readonly string[]> = {
    [name]: ['ALL', 'DISTINCT'],
    'ALL': modifiers,
    'DISTINCT': modifiers,
    'NAME': ['ON'],
    'CORRESPONDING': ['BY'],
    'CORRESPONDING BY': [],
  };

  // STRICT does not go with a mode (the last word of which is one of these)
  for (const mode of ['INNER', 'LEFT', 'FULL', 'OUTER']) {
    for (const allOrDistinct of ['ALL', 'DISTINCT']) {
      follows[`${mode} ${name} ${allOrDistinct}`] = ['BY NAME', 'CORRESPONDING'];
    }
  }

  return {
    names: ['', 'INNER', 'LEFT', 'LEFT OUTER', 'FULL', 'FULL OUTER'].map(mode =>
      mode ? `${mode} ${name}` : name,
    ),
    completions: [`${name} ALL`, `${name} DISTINCT`],
    syntax: `|> [INNER | {LEFT | FULL} [OUTER]]
   ${name} {ALL | DISTINCT}
   [BY NAME [ON (column, ...)]
     | [STRICT] CORRESPONDING [BY (column, ...)]]
   (query) [, (query), ...]`,
    description,
    follows,
  };
}

// Ends the syntax of the operators that sort (the lines of the syntax fit in the doc panel)
const ORDER_SUFFIX = '\n\norder_suffix: {ASC | DESC} [NULLS {FIRST | LAST}]';
const ORDER_CLAUSES = ['ASC', 'DESC', 'NULLS FIRST', 'NULLS LAST'];

/**
 * The pipe operators in the order of the docs, which puts the common ones first
 */
export const PIPE_OPERATORS: readonly PipeOperatorSyntax[] = [
  {
    names: ['SELECT'],
    syntax: `|> SELECT expression [[AS] alias] [, ...]
   [WINDOW name AS window_spec, ...]`,
    description: 'Keeps only the listed expressions as the columns.',
    clauses: ['AS', 'WINDOW'],
  },
  {
    names: ['EXTEND'],
    syntax: `|> EXTEND expression [[AS] alias] [, ...]
   [WINDOW name AS window_spec, ...]`,
    description: 'Adds computed columns and keeps the existing ones.',
    clauses: ['AS', 'WINDOW'],
  },
  {
    names: ['SET'],
    syntax: '|> SET column = expression [, ...]',
    description: 'Replaces the values of columns.',
  },
  {
    names: ['DROP'],
    syntax: '|> DROP column [, ...]',
    description: 'Removes columns.',
  },
  {
    names: ['RENAME'],
    syntax: '|> RENAME old_column_name [AS] new_column_name [, ...]',
    description: 'Renames columns.',
    clauses: ['AS'],
  },
  {
    names: ['AS'],
    syntax: '|> AS alias',
    description: 'Gives the table a name that the following pipe operators can refer to.',
  },
  {
    names: ['WHERE'],
    syntax: '|> WHERE boolean_expression',
    description: 'Filters the rows.',
  },
  {
    names: ['AGGREGATE'],
    syntax: `|> AGGREGATE [aggregate_expression [[AS] alias]
     [order_suffix] [, ...]]
   [GROUP [AND ORDER] BY expression [[AS] alias]
     [order_suffix] [, ...]]${ORDER_SUFFIX}`,
    description:
      'Aggregates all the rows, or the rows of each group. GROUP AND ORDER BY also sorts by the groups.',
    clauses: ['GROUP BY', 'GROUP AND ORDER BY', 'AS', ...ORDER_CLAUSES],
  },
  {
    names: ['DISTINCT'],
    syntax: '|> DISTINCT',
    description: 'Removes duplicate rows.',
  },
  {
    names: [
      '',
      'INNER',
      'CROSS',
      'LEFT',
      'LEFT OUTER',
      'RIGHT',
      'RIGHT OUTER',
      'FULL',
      'FULL OUTER',
    ].map(type => (type ? `${type} JOIN` : 'JOIN')),
    completions: ['JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN'],
    syntax: `|> [join_type] JOIN from_item [[AS] alias]
   [ON condition | USING (column, ...)]`,
    description: 'Joins the rows with the rows of another table.',
    clauses: ['AS', 'ON', 'USING'],
  },
  {
    names: ['CALL'],
    syntax: '|> CALL table_function (argument [, ...]) [[AS] alias]',
    description: 'Calls a table function, with the table as its first table argument.',
    clauses: ['AS'],
  },
  {
    names: ['ORDER BY'],
    syntax: `|> ORDER BY expression [order_suffix] [, ...]${ORDER_SUFFIX}`,
    description: 'Sorts the rows.',
    clauses: ORDER_CLAUSES,
  },
  {
    names: ['LIMIT'],
    syntax: '|> LIMIT count [OFFSET skip_rows]',
    description: 'Keeps only the given number of rows, after skipping some.',
    clauses: ['OFFSET'],
  },
  setOperation('UNION', 'Adds the rows of other queries.'),
  {
    names: ['RECURSIVE UNION'],
    completions: ['RECURSIVE UNION ALL', 'RECURSIVE UNION DISTINCT'],
    syntax: `|> RECURSIVE UNION {ALL | DISTINCT} [BY NAME]
   (query | subpipeline) [AS alias]`,
    description:
      'Runs a recursive query: adds the rows that the query or subpipeline makes out of the rows added last, until there are no new ones.',
    follows: { UNION: ['ALL', 'DISTINCT'], ALL: ['BY NAME'], DISTINCT: ['BY NAME'] },
    clauses: ['AS'],
  },
  setOperation('INTERSECT', 'Keeps only the rows that the other queries also return.'),
  setOperation('EXCEPT', 'Removes the rows that any of the other queries returns.'),
  {
    names: ['TABLESAMPLE'],
    syntax: `|> TABLESAMPLE {BERNOULLI | SYSTEM | RESERVOIR}
   (sample_size {PERCENT | ROWS}
     [PARTITION BY expression, ...])
   [WITH WEIGHT [[AS] alias]] [REPEATABLE (seed)]`,
    description: 'Keeps a random sample of the rows.',
    follows: { TABLESAMPLE: ['BERNOULLI', 'SYSTEM', 'RESERVOIR'] },
    clauses: ['PERCENT', 'ROWS', 'PARTITION BY', 'WITH WEIGHT', 'AS', 'REPEATABLE'],
    inParentheses: true,
  },
  {
    names: ['WITH'],
    syntax: '|> WITH [RECURSIVE] alias AS (query) [, ...]',
    description: 'Defines common table expressions that the following pipe operators can use.',
    follows: { WITH: ['RECURSIVE'] },
    clauses: ['AS'],
  },
  {
    names: ['PIVOT'],
    syntax: `|> PIVOT (aggregate_expression [[AS] prefix]
     FOR input_column
     IN (value [[AS] pivot_column] [, ...]))
   [[AS] alias]`,
    description: 'Turns rows into columns.',
    clauses: ['FOR', 'IN', 'AS'],
    inParentheses: true,
  },
  {
    names: ['UNPIVOT'],
    syntax: `|> UNPIVOT [INCLUDE NULLS | EXCLUDE NULLS]
   (values_column FOR name_column IN (column [, ...]))
   [[AS] alias]`,
    description: 'Turns columns into rows.',
    follows: { UNPIVOT: ['INCLUDE NULLS', 'EXCLUDE NULLS'] },
    clauses: ['FOR', 'IN', 'AS'],
    inParentheses: true,
  },
  {
    names: ['WINDOW'],
    syntax: '|> WINDOW window_expression [[AS] alias] [, ...]',
    description: 'Adds columns computed with window functions. Deprecated, use EXTEND.',
    clauses: ['AS'],
  },
  {
    names: ['MATCH_RECOGNIZE'],
    syntax: `|> MATCH_RECOGNIZE (
     [PARTITION BY expression [, ...]]
     ORDER BY expression [order_suffix] [, ...]
     MEASURES expression [AS] alias [, ...]
     [AFTER MATCH SKIP {PAST LAST ROW | TO NEXT ROW}]
     PATTERN (pattern)
     DEFINE symbol AS boolean_expression [, ...]
     [OPTIONS (use_longest_match = {TRUE | FALSE})]
   ) [[AS] alias]${ORDER_SUFFIX}`,
    description: 'Finds the sequences of rows that match a pattern and aggregates each one.',
    follows: { SKIP: ['PAST LAST ROW', 'TO NEXT ROW'] },
    clauses: [
      'PARTITION BY',
      'ORDER BY',
      ...ORDER_CLAUSES,
      'MEASURES',
      'AFTER MATCH SKIP',
      'PATTERN',
      'DEFINE',
      'OPTIONS',
      'AS',
    ],
    inParentheses: true,
  },
  {
    names: ['ASSERT'],
    syntax: '|> ASSERT condition [, payload_expression [, ...]]',
    description:
      'Fails the query with the payload as the message if the condition is not true for every row.',
  },
  {
    names: ['DESCRIBE'],
    syntax: '|> DESCRIBE',
    description:
      'Returns a description of the table (its columns and their types) instead of the rows.',
  },
  {
    names: ['IF'],
    syntax: `|> IF condition THEN (subpipeline)
   [ELSEIF condition THEN (subpipeline)] ...
   [ELSE (subpipeline)]`,
    description: 'Runs the subpipeline of the first condition that is true.',
    clauses: ['THEN', 'ELSEIF', 'ELSE'],
  },
  {
    names: ['CREATE'],
    completions: ['CREATE TABLE'],
    syntax: `|> CREATE [OR REPLACE] [TEMP | TEMPORARY]
   TABLE [IF NOT EXISTS] table_name [(table_element, ...)]
   [PARTITION BY expression, ...]
   [CLUSTER BY expression, ...]
   [OPTIONS (key = value, ...)]`,
    description: 'Creates a table with the rows. Ends the query.',
    follows: {
      CREATE: ['OR REPLACE', 'TEMP', 'TEMPORARY', 'TABLE'],
      REPLACE: ['TEMP', 'TEMPORARY', 'TABLE'],
      TEMP: ['TABLE'],
      TEMPORARY: ['TABLE'],
      TABLE: ['IF NOT EXISTS'],
      EXISTS: [], // The table name
    },
    clauses: ['PARTITION BY', 'CLUSTER BY', 'OPTIONS'],
  },
  {
    names: ['EXPORT DATA'],
    syntax: '|> EXPORT DATA [OPTIONS (key = value, ...)]',
    description: 'Writes the rows to files or a stream. Ends the query.',
    clauses: ['OPTIONS'],
  },
  {
    names: ['INSERT'],
    completions: ['INSERT INTO'],
    syntax: `|> INSERT [[OR] IGNORE | OR REPLACE | OR UPDATE]
   [INTO] table_name [(column [, ...])]
   [ASSERT_ROWS_MODIFIED count]
   [THEN RETURN [WITH ACTION [AS alias]]
     expression [, ...]]`,
    description: 'Inserts the rows into a table. Ends the query.',
    follows: {
      INSERT: ['OR', 'IGNORE', 'INTO'],
      OR: ['IGNORE', 'REPLACE', 'UPDATE'],
      IGNORE: ['INTO'],
      REPLACE: ['INTO'],
      UPDATE: ['INTO'],
    },
    clauses: ['ASSERT_ROWS_MODIFIED', 'THEN RETURN', 'WITH ACTION', 'AS'],
  },
  {
    names: ['FORK'],
    syntax: '|> FORK (subpipeline) [, (subpipeline)] ...',
    description: 'Runs subpipelines on the rows, each one making a result. Ends the query.',
  },
  {
    names: ['TEE'],
    syntax: '|> TEE [(subpipeline) [, (subpipeline)] ...]',
    description:
      'Returns the rows (or what subpipelines make of them) as extra results, and goes on with the rows.',
  },
  {
    names: ['FINISH'],
    syntax: '|> FINISH',
    description: 'Ends the query without returning the rows.',
  },
];

/**
 * What can come right after the pipe symbol: the completions of each operator
 */
export const PIPE_OPERATOR_COMPLETIONS: readonly { label: string; operator: PipeOperatorSyntax }[] =
  PIPE_OPERATORS.flatMap(operator =>
    (operator.completions || operator.names).map(label => ({ label, operator })),
  );

function phraseWords(phrase: string): string[] {
  return phrase ? phrase.split(' ') : [];
}

function endsWith(words: readonly string[], end: readonly string[]): boolean {
  if (end.length > words.length) return false;
  const offset = words.length - end.length;
  return end.every((word, i) => words[offset + i] === word);
}

const OPERATORS_BY_NAME = new Map<string, PipeOperatorSyntax>();

// The beginnings of the operator names (starting with the empty one) and the words that come after them
const NAME_STARTS = new Map<string, string[]>();

for (const operator of PIPE_OPERATORS) {
  for (const name of operator.names) {
    OPERATORS_BY_NAME.set(name, operator);
    const words = phraseWords(name);
    for (let i = 0; i < words.length; i++) {
      const start = words.slice(0, i).join(' ');
      const next = NAME_STARTS.get(start) || [];
      if (!next.includes(words[i])) next.push(words[i]);
      NAME_STARTS.set(start, next);
    }
  }
}

interface OperatorKeywords {
  // The keys of follows (as words) and what follows them, the longest keys first
  follows: [key: string[], phrases: string[][]][];
  clauses: string[][];
}

const OPERATOR_KEYWORDS = new Map<PipeOperatorSyntax, OperatorKeywords>(
  PIPE_OPERATORS.map(operator => [
    operator,
    {
      follows: Object.entries(operator.follows || {})
        .map(([key, phrases]): [string[], string[][]] => [
          phraseWords(key),
          phrases.map(phraseWords),
        ])
        .sort(([a], [b]) => b.length - a.length),
      clauses: (operator.clauses || []).map(phraseWords),
    },
  ]),
);

// Enough words to tell where a phrase goes on (two words of a key and two words of a phrase)
const MAX_WORDS = 4;

/**
 * Where a token is in the pipe operators. Each token that changes it makes a new one, and each pair of parentheses has
 * one of its own.
 */
export interface PipeContext {
  /** The context around the parentheses that this is in */
  readonly outer: PipeContext | undefined;
  /** The pipe operator that this is in */
  readonly operator: PipeOperatorSyntax | undefined;
  /** The words of the operator name so far, from the pipe symbol until the name is complete */
  readonly name: readonly string[] | undefined;
  /** The last words in the pipe operator (in upper case) since a token that is not a word */
  readonly words: readonly string[];
  /** Contexts that are the same have the same hash */
  readonly hash: number;
}

function hashString(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(31, hash) + text.charCodeAt(i); // Math.imul keeps it to 32 bits
  }
  return hash;
}

function makePipeContext(
  outer: PipeContext | undefined,
  operator: PipeOperatorSyntax | undefined,
  name: readonly string[] | undefined,
  words: readonly string[],
): PipeContext {
  const operatorIndex = operator ? PIPE_OPERATORS.indexOf(operator) : -1;
  return {
    outer,
    operator,
    name,
    words,
    hash: hashString(
      `${outer?.hash ?? 0}|${operatorIndex}|${name ? name.join(' ') : '-'}|${words.join(' ')}`,
    ),
  };
}

/**
 * The context before the first token, not in a pipe operator
 */
export const START_PIPE_CONTEXT: PipeContext = makePipeContext(undefined, undefined, undefined, []);

function withoutWords(context: PipeContext): PipeContext {
  const { outer, operator, name, words } = context;
  return name || words.length ? makePipeContext(outer, operator, undefined, []) : context;
}

/**
 * The context after a token, given as its text. Words are the words of the language (keywords, functions, identifiers
 * and so on). Of the other tokens the pipe symbol, parentheses and semicolons are told apart by their text.
 */
export function nextPipeContext(context: PipeContext, text: string, isWord: boolean): PipeContext {
  const { outer, operator, name } = context;

  if (isWord) {
    const word = text.toUpperCase();
    if (name) {
      const newName = [...name, word];
      const namedOperator = OPERATORS_BY_NAME.get(newName.join(' '));
      if (namedOperator) {
        return makePipeContext(outer, namedOperator, undefined, newName.slice(-MAX_WORDS));
      }
      if (NAME_STARTS.has(newName.join(' '))) return makePipeContext(outer, undefined, newName, []);
      return makePipeContext(outer, undefined, undefined, []); // A pipe operator that we do not know
    }
    if (!operator) return context;
    return makePipeContext(outer, operator, undefined, [...context.words, word].slice(-MAX_WORDS));
  }

  switch (text) {
    case '|>':
      return makePipeContext(outer, undefined, [], []);

    case '(':
      // The parentheses of an operator like PIVOT have its keywords, otherwise they have a query or an expression
      return makePipeContext(
        context,
        operator?.inParentheses ? operator : undefined,
        undefined,
        [],
      );

    case ')':
      return pipeContextAfterParentheses(outer || context);

    case ';':
      return operator || name ? makePipeContext(outer, undefined, undefined, []) : context;

    default:
      return withoutWords(context);
  }
}

/**
 * The context after a pair of parentheses (whatever is in them)
 */
export function pipeContextAfterParentheses(context: PipeContext): PipeContext {
  return withoutWords(context);
}

/**
 * Whether the context is right after the pipe symbol, where an operator name comes
 */
export function isAfterPipeSymbol(context: PipeContext): boolean {
  return context.name?.length === 0;
}

/**
 * The keywords (or phrases) that can come next in a pipe operator, `only` when nothing else can. Undefined outside of
 * pipe operators.
 */
export function getPipeKeywords(
  context: PipeContext,
): { keywords: readonly string[]; only: boolean } | undefined {
  const { operator, name, words } = context;
  if (name) return { keywords: NAME_STARTS.get(name.join(' ')) || [], only: true };
  if (!operator) return;

  const { follows, clauses } = OPERATOR_KEYWORDS.get(operator)!;
  const keywords = new Set<string>();
  let only = false;

  // What follows the longest key that the words end with
  const follow = follows.find(([key]) => endsWith(words, key));
  if (follow) {
    only = true;
    for (const phrase of follow[1]) keywords.add(phrase.join(' '));
  }

  // The rest of a phrase that the words are in the middle of
  const addRestOfPhrase = (start: string[], phrase: string[]) => {
    for (let i = 1; i < phrase.length; i++) {
      if (endsWith(words, [...start, ...phrase.slice(0, i)])) {
        only = true;
        keywords.add(phrase.slice(i).join(' '));
      }
    }
  };
  for (const [key, phrases] of follows) {
    for (const phrase of phrases) addRestOfPhrase(key, phrase);
  }
  for (const clause of clauses) addRestOfPhrase([], clause);

  return only
    ? { keywords: Array.from(keywords), only }
    : { keywords: operator.clauses || [], only };
}

/**
 * Whether a word is a keyword of pipe syntax in the context (the words that are keywords everywhere aside)
 */
export function isPipeKeyword(context: PipeContext, word: string): boolean {
  if (!context.operator && !context.name) return false;
  const upper = word.toUpperCase();
  return Boolean(
    getPipeKeywords(context)?.keywords.some(
      keyword => keyword === upper || keyword.startsWith(`${upper} `),
    ),
  );
}
