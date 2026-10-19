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

import type { SyntaxNode } from '@lezer/common';
import type { SqlBase } from 'druid-query-toolkit';
import {
  F,
  L,
  SqlColumn,
  SqlExpression,
  SqlFunction,
  SqlLiteral,
  SqlQuery,
  SqlSetStatement,
  SqlStar,
} from 'druid-query-toolkit';

import { parser as dsqlParser } from '../editor-languages/dsql.parser';

import type { LineColumn } from './general';
import { offsetToLineColumn } from './general';

export function prettyPrintSql(b: SqlBase): string {
  return b.prettyTrim(50).toString();
}

export function timeFormatToSql(timeFormat: string): SqlExpression | undefined {
  switch (timeFormat) {
    case 'auto':
      return SqlExpression.parse('TIME_PARSE(TRIM(?))');

    case 'iso':
      return SqlExpression.parse('TIME_PARSE(?)');

    case 'posix':
      return SqlExpression.parse(`MILLIS_TO_TIMESTAMP((?) * 1000)`);

    case 'millis':
      return SqlExpression.parse(`MILLIS_TO_TIMESTAMP(?)`);

    case 'micro':
      return SqlExpression.parse(`MILLIS_TO_TIMESTAMP((?) / 1000)`);

    case 'nano':
      return SqlExpression.parse(`MILLIS_TO_TIMESTAMP((?) / 1000000)`);

    default:
      return SqlExpression.parse(`TIME_PARSE(?, '${timeFormat}')`);
  }
}

export function convertToGroupByExpression(ex: SqlExpression): SqlExpression | undefined {
  const underlyingExpression = ex.getUnderlyingExpression();
  if (!(underlyingExpression instanceof SqlFunction)) return;

  const args = underlyingExpression.args?.values;
  if (!args) return;

  const interestingArgs = args.filter(
    arg => !(arg instanceof SqlLiteral || arg instanceof SqlStar),
  );
  if (interestingArgs.length !== 1) return;

  const newEx = interestingArgs[0];
  if (newEx instanceof SqlColumn) return newEx;

  return newEx.as((ex.getOutputName() || 'grouped').replace(/^[a-z]+_/i, ''));
}

function extractQueryPrefix(text: string): string {
  let q = SqlQuery.parse(text);

  // The parser will parse a SELECT query with a partitionedByClause and clusteredByClause but that is not valid, remove them from the query
  if (!q.getIngestTable() && (q.partitionedByClause || q.clusteredByClause)) {
    q = q.changePartitionedByClause(undefined).changeClusteredByClause(undefined);
  }

  return q.toString().trimEnd();
}

export function findSqlQueryPrefix(text: string): string | undefined {
  try {
    return extractQueryPrefix(text);
  } catch (e) {
    const startOffset = e.location?.start?.offset;
    if (typeof startOffset !== 'number') return;
    const prefix = text.slice(0, startOffset);
    // Try to trim to where the error came from
    try {
      return extractQueryPrefix(prefix);
    } catch {
      // Try to trim out last word
      try {
        const lastWord = /\b\w+$/.exec(prefix);
        return extractQueryPrefix(lastWord ? prefix.slice(0, lastWord.index).trimEnd() : prefix);
      } catch {
        return;
      }
    }
  }
}

export function cleanSqlQueryPrefix(text: string): string {
  const matchReplace = /\sREPLACE$/i.exec(text);
  if (matchReplace) {
    // This query likely grabbed a "REPLACE" (which is not a reserved keyword) from the next query over, see if we can delete it
    const textWithoutReplace = text.slice(0, -matchReplace[0].length).trimEnd();
    if (SqlQuery.maybeParse(textWithoutReplace)) {
      return textWithoutReplace;
    }
  }

  return text;
}

export interface QuerySlice {
  index: number;
  startOffset: number;
  startLineColumn: LineColumn;
  endOffset: number;
  endLineColumn: LineColumn;
  sql: string;
}

interface TextRange {
  start: number;
  end: number;
}

/**
 * The queries that druid-query-toolkit can find: they start with one of a few keywords (or SET statements) and end
 * where the toolkit stops parsing
 */
function findToolkitQueries(text: string): (TextRange & { sql: string })[] {
  const found: (TextRange & { sql: string })[] = [];

  let remainingText = text;
  let offset = 0;
  let m: RegExpExecArray | null = null;
  // Have an upper bound to how many queries we might extract from a long text
  for (let i = 0; i < 1e3; i++) {
    m = /SET|SELECT|WITH|INSERT|REPLACE|EXPLAIN/i.exec(remainingText);
    if (!m) break;

    const sql = findSqlQueryPrefix(remainingText.slice(m.index));
    if (sql) {
      found.push({
        start: offset + m.index,
        end: offset + m.index + sql.length,
        sql: cleanSqlQueryPrefix(sql),
      });
    }

    let advanceBy = m.index;
    const initialWord = m[0].toUpperCase();
    if (sql && initialWord === 'SET') {
      const startOfSetStatements = remainingText.slice(m.index);
      const [setPart, queryPart] = SqlSetStatement.partitionSetStatements(
        startOfSetStatements,
        true,
      );
      advanceBy += setPart.length;
      const nextWord = /SELECT|WITH|INSERT|REPLACE/i.exec(queryPart);
      if (nextWord) {
        advanceBy += nextWord[0].length;
      }
    } else {
      advanceBy += initialWord.length; // Skip the initial word only
    }

    remainingText = remainingText.slice(advanceBy);
    offset += advanceBy;
  }

  return found;
}

const COMMENT_NODES = new Set(['Issue', 'LineComment', 'BlockComment']);
const WORD_NODES = new Set(['Keyword', 'FunctionName', 'Constant', 'TypeName', 'Identifier']);
const QUERY_START_WORDS = new Set(['SELECT', 'WITH', 'EXPLAIN', 'INSERT', 'REPLACE']);

interface Statement extends TextRange {
  /** The first word in upper case, if the statement starts with a word */
  firstWord?: string;
  /** Where the SET statements right before this one start */
  setStart?: number;
  /** Where the first pipe operator starts */
  pipeStart?: number;
  /** The tokens (other than comments), a pair of parentheses or a pipe operator is one token */
  tokens: TextRange[];
}

/**
 * What the DruidSQL editor language makes of the text (it knows all of pipe syntax, unlike druid-query-toolkit): the
 * statements (separated by semicolons) at the top and in each pair of parentheses, and where the words of the pipe
 * operators (outside of their parentheses) start
 */
function parseStatements(text: string): { statements: Statement[]; pipeWordStarts: Set<number> } {
  const statements: Statement[] = [];
  const pipeWordStarts = new Set<number>();

  const visit = (container: SyntaxNode) => {
    let current: Statement | undefined;
    let setStart: number | undefined;
    for (let child = container.firstChild; child; child = child.nextSibling) {
      const { name, from, to } = child;
      if (COMMENT_NODES.has(name) || name === '(' || name === ')') continue;

      // The semicolon ends the statement (and is part of it)
      if (name === 'Punctuation' && text.slice(from, to) === ';') {
        if (current) {
          current.end = to;
          statements.push(current);
          setStart = current.firstWord === 'SET' ? (setStart ?? current.start) : undefined;
        }
        current = undefined;
        continue;
      }

      current ??= {
        start: from,
        end: to,
        firstWord: WORD_NODES.has(name) ? text.slice(from, to).toUpperCase() : undefined,
        setStart,
        tokens: [],
      };
      current.end = to;
      current.tokens.push({ start: from, end: to });

      if (name === 'Parens') visit(child);
      if (name === 'PipeOperator') {
        current.pipeStart ??= from;
        for (let token = child.firstChild; token; token = token.nextSibling) {
          if (WORD_NODES.has(token.name)) pipeWordStarts.add(token.from);
          if (token.name === 'Parens') visit(token);
        }
      }
    }
    if (current) statements.push(current);
  };

  visit(dsqlParser.parse(text).topNode);
  return { statements, pipeWordStarts };
}

/**
 * The queries in the text that can be run on their own: the ones that druid-query-toolkit finds, and the ones with pipe
 * syntax (including FROM-first queries) as the DruidSQL editor language parses them
 */
export function findAllSqlQueriesInText(text: string): QuerySlice[] {
  const { statements, pipeWordStarts } = parseStatements(text);

  const queries: (TextRange & { sql?: string })[] = [];
  for (const query of findToolkitQueries(text)) {
    // A query does not start in a pipe operator (unless it is in parentheses), like the SELECT of `|> SELECT a`
    if (pipeWordStarts.has(query.start)) continue;

    // The toolkit stops at the pipe operators that follow a query (one that is a part of a statement, not in its
    // parentheses), the query goes on to the end of the statement
    const piped = statements.find(
      ({ setStart, end, pipeStart, tokens }) =>
        query.end < end &&
        (query.start === setStart || tokens.some(token => token.start === query.start)) &&
        tokens.find(token => query.end < token.end)?.start === pipeStart,
    );
    queries.push(piped ? { start: query.start, end: piped.end } : query);
  }

  // The queries that start with FROM, and the statements with pipe operators that start like a query (the toolkit
  // does not know all of pipe syntax), with the SET statements before them
  for (const { start, end, firstWord, setStart, pipeStart } of statements) {
    if (
      firstWord === 'FROM' ||
      (typeof pipeStart === 'number' && firstWord && QUERY_START_WORDS.has(firstWord))
    ) {
      queries.push({ start: setStart ?? start, end });
    }
  }

  // The longest query of the ones that start at the same place
  const longestQueries = new Map<number, TextRange & { sql?: string }>();
  for (const query of queries) {
    const longest = longestQueries.get(query.start);
    if (!longest || longest.end < query.end) longestQueries.set(query.start, query);
  }

  return Array.from(longestQueries.values())
    .sort((a, b) => a.start - b.start)
    .map(({ start, end, sql }, index) => ({
      index,
      startOffset: start,
      startLineColumn: offsetToLineColumn(text, start)!,
      endOffset: end,
      endLineColumn: offsetToLineColumn(text, end)!,
      sql: sql ?? text.slice(start, end),
    }));
}

const GRANULARITY_TO_ALIGN_TO_DAY: Record<string, boolean> = {
  PT2H: true,
  PT3H: true,
  PT4H: true,
  PT6H: true,
  PT8H: true,
  PT12H: true,
  PT24H: true,
};

/**
 * A smart time floor that adjusts the origin for the hour granularities that divide evenly into days to make them align with days
 */
export function smartTimeFloor(
  ex: SqlExpression,
  granularity: string,
  isUTC: boolean,
): SqlExpression {
  return F(
    'TIME_FLOOR',
    ex,
    L(granularity),
    !isUTC && GRANULARITY_TO_ALIGN_TO_DAY[granularity] ? F.timeFloor(ex, 'P1D') : undefined,
  );
}
