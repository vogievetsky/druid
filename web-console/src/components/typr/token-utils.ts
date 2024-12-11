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

import { C, F, L, SqlExpression } from 'druid-query-toolkit';

import { filterMap, oneOf } from '../../utils';

// ----------------------------------------------------------------------

export type BaseToken =
  | { type: 'space'; value: string }
  | { type: 'invalid'; value: string }
  | { type: 'term'; term: string; quoted: boolean; missingEndQuote?: boolean }
  | { type: 'operator'; op: string }
  | { type: 'logic'; logic: 'AND' | 'OR' | 'NOT' }
  | { type: 'paren'; paren: '(' | ')' };

const OPERATORS = ['=', '!=', '>=', '<=', '>', '<'];
const LOGICS = ['AND', 'OR', 'NOT'];

export function parseToBaseTokens(input: string): BaseToken[] {
  const n = input.length;
  const tokens: BaseToken[] = [];
  let i = 0;

  while (i < n) {
    // Handle whitespace
    if (input[i] === ' ') {
      const start = i;
      while (i < n && input[i] === ' ') {
        i++;
      }
      tokens.push({ type: 'space', value: input.slice(start, i) });
      continue;
    }

    // Handle quoted strings
    if (input[i] === '"') {
      // Read to the next " or EOF skipping \"
      let end = i + 1;
      let prevChar = '"';
      while (end < n && prevChar !== '\\' && (prevChar = input[end]) !== '"') end++;

      // We reached EOF, make a special token to mark a missing quote
      if (end === n) {
        tokens.push({
          type: 'term',
          term: input.slice(i + 1),
          quoted: true,
          missingEndQuote: true,
        });
        return tokens;
      }

      tokens.push({ type: 'term', term: input.slice(i + 1, end), quoted: true });
      continue;
    }

    // Handle operators
    const matchedOperator = OPERATORS.find(op => input.startsWith(op, i));
    if (matchedOperator) {
      tokens.push({ type: 'operator', op: matchedOperator });
      i += matchedOperator.length;
      continue;
    }

    // Handle logic
    const matchedLogic = LOGICS.find(logic => input.startsWith(logic, i));
    if (matchedLogic) {
      tokens.push({ type: 'logic', logic: matchedLogic as any });
      i += matchedLogic.length;
      continue;
    }

    // Handle keywords
    const start = i;
    while (
      i < n &&
      input[i] !== ' ' &&
      input[i] !== '"' &&
      !OPERATORS.some(op => input.startsWith(op, i))
    ) {
      i++;
    }
    tokens.push({ type: 'term', term: input.slice(start, i), quoted: false });
  }

  return tokens;
}

// ----------------------------------------------------------------------

export type SearchToken =
  | { type: 'space'; value: string }
  | { type: 'term'; term: string }
  | { type: 'field'; key: string; value: string }
  | { type: 'logic'; logic: 'AND' | 'OR' | 'NOT' };

export function parseToSearchTokens(text: string): SearchToken[] {
  const parts = text.replace(/\s+$/, ' ').split(' '); // max on space at the end
  const tokens: SearchToken[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) tokens.push({ type: 'space', value: ' ' });
    const part = parts[i];
    if (part) {
      if (part === 'AND' || part === 'OR' || part === 'NOT') {
        tokens.push({ type: 'logic', logic: part });
      } else {
        const eqs = part.split('=');
        tokens.push(
          eqs.length === 1
            ? { type: 'term', term: part }
            : { type: 'field', key: eqs[0], value: eqs.slice(1).join('=') },
        );
      }
    }
  }
  return tokens;
}

export function searchTokenToString(token: SearchToken): string {
  switch (token.type) {
    case 'space':
      return token.value;

    case 'term':
      return token.term;

    case 'field':
      return `${token.key}=${token.value}`;

    case 'logic':
      return token.logic;
  }
}

export function searchTokensToString(searchTokens: SearchToken[]): string {
  return searchTokens.map(searchTokenToString).join('');
}

export function removeSearchTokenByIndex(
  tokens: readonly SearchToken[],
  index: number,
): SearchToken[] {
  const newTokens = tokens.slice();
  if (newTokens[index - 1]?.type === 'space') {
    newTokens.splice(index - 1, 2);
  } else if (newTokens[index + 1]?.type === 'space') {
    newTokens.splice(index, 2);
  } else {
    newTokens.splice(index, 1);
  }
  return newTokens;
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function searchTokenToHtml(searchToken: SearchToken, index: number): string {
  if (searchToken.type === 'space') return searchToken.value;
  return `<span class="${searchToken.type}" data-tooltip='Index: ${index}'>${
    searchToken.type === 'field'
      ? `${escapeHtml(searchToken.key)}<span class="eq">=</span>${escapeHtml(searchToken.value)}`
      : escapeHtml(searchTokenToString(searchToken))
  }${
    oneOf(searchToken.type, 'term', 'field')
      ? `<span class="closer-cont"><span class="closer" data-term-index="${index}"></span></span>`
      : ''
  }</span>`;
}

// -------------------------------

// type Syntax =
//   | {
//       type: 'and' | 'or';
//       children: [];
//     }
//   | { type: 'not'; child: [] }
//   | { type: 'term'; term: string }
//   | { type: 'field'; key: string; value: string };

function escapeRegex(string: string): string {
  return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}

const LOG_COLUMN = C('_log');
export function tokensToExpression(tokens: SearchToken[]): SqlExpression {
  return SqlExpression.and(
    ...filterMap(tokens, token => {
      switch (token.type) {
        case 'term':
          return F('REGEXP_LIKE', LOG_COLUMN, `\\b${escapeRegex(token.term)}\\b`);

        case 'field':
          return C(token.key).equal(L(token.value));

        default:
          return;
      }
    }),
  );
}
